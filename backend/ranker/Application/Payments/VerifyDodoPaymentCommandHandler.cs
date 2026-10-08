using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Ranker.Application.Claims;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Dtos;
using Ranker.Services.Payments;

namespace Ranker.Application.Payments;

public class VerifyDodoPaymentCommandHandler(
    IDodoPaymentsService dodoPaymentsService,
    RankerDbContext dbContext,
    ISender sender,
    ILogger<VerifyDodoPaymentCommandHandler> logger)
    : IRequestHandler<VerifyDodoPaymentCommand, VerifyDodoPaymentResponseDto>
{
    public async Task<VerifyDodoPaymentResponseDto> Handle(
        VerifyDodoPaymentCommand command,
        CancellationToken ct)
    {
        var paymentId = command.PaymentId;
        var sessionId = command.SessionId;

        // If paymentId not provided, query session to get paymentId
        if (string.IsNullOrWhiteSpace(paymentId) && !string.IsNullOrWhiteSpace(sessionId))
        {
            try
            {
                var sessionStatus = await dodoPaymentsService.GetSessionStatusAsync(sessionId, ct);
                paymentId = sessionStatus.PaymentId;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to resolve payment ID from session {SessionId}", sessionId);
            }
        }

        if (string.IsNullOrWhiteSpace(paymentId))
        {
            return new VerifyDodoPaymentResponseDto(
                Verified: false,
                Error: "PaymentId could not be determined.");
        }

        // 1. Check if claim already fulfilled with this PaymentReference
        var existingClaim = await dbContext.Claims
            .Include(c => c.Listing)
            .FirstOrDefaultAsync(c => c.PaymentReference == paymentId, ct);

        if (existingClaim != null)
        {
            logger.LogInformation("Claim already placed for payment {PaymentId}. ListingId={ListingId}",
                paymentId, existingClaim.ListingId);

            return new VerifyDodoPaymentResponseDto(
                Verified: true,
                PaymentId: paymentId,
                Status: "succeeded",
                Amount: existingClaim.PaymentAmount,
                ListingId: existingClaim.ListingId,
                NewClaimAmount: existingClaim.Amount);
        }

        // 2. Fetch payment details from Dodo API
        var payment = await dodoPaymentsService.GetPaymentAsync(paymentId, ct);
        if (payment == null)
        {
            return new VerifyDodoPaymentResponseDto(
                Verified: false,
                PaymentId: paymentId,
                Error: "Payment not found in Dodo Payments gateway.");
        }

        var isSucceeded = string.Equals(payment.Status, "succeeded", StringComparison.OrdinalIgnoreCase);
        if (!isSucceeded)
        {
            return new VerifyDodoPaymentResponseDto(
                Verified: false,
                PaymentId: paymentId,
                Status: payment.Status,
                Error: $"Payment status is '{payment.Status}', not 'succeeded'.");
        }

        // 3. Extract metadata
        var metadata = payment.Metadata ?? new Dictionary<string, string>();

        metadata.TryGetValue("categoryId", out var catIdStr);
        if (!int.TryParse(catIdStr, out var categoryId))
        {
            metadata.TryGetValue("category_id", out catIdStr);
            int.TryParse(catIdStr, out categoryId);
        }

        int? listingId = null;
        if (metadata.TryGetValue("listingId", out var listIdStr) && int.TryParse(listIdStr, out var lid))
            listingId = lid;
        else if (metadata.TryGetValue("listing_id", out listIdStr) && int.TryParse(listIdStr, out lid))
            listingId = lid;

        metadata.TryGetValue("listingName", out var listingName);
        if (string.IsNullOrWhiteSpace(listingName)) metadata.TryGetValue("listing_name", out listingName);

        metadata.TryGetValue("listingUrl", out var listingUrl);
        if (string.IsNullOrWhiteSpace(listingUrl)) metadata.TryGetValue("listing_url", out listingUrl);

        metadata.TryGetValue("ownerContactEmail", out var ownerEmail);
        if (string.IsNullOrWhiteSpace(ownerEmail)) metadata.TryGetValue("owner_contact_email", out ownerEmail);
        if (string.IsNullOrWhiteSpace(ownerEmail)) ownerEmail = payment.CustomerEmail ?? "";

        decimal targetClaimAmount = 0m;
        if (metadata.TryGetValue("targetClaimAmount", out var targetStr) && decimal.TryParse(targetStr, out var tca))
            targetClaimAmount = tca;
        else if (metadata.TryGetValue("target_claim_amount", out targetStr) && decimal.TryParse(targetStr, out tca))
            targetClaimAmount = tca;

        decimal confirmedPaymentAmount = Math.Round((decimal)payment.TotalAmount / 100m, 2);
        if (metadata.TryGetValue("chargeAmount", out var chargeStr) && decimal.TryParse(chargeStr, out var ca) && ca > 0)
            confirmedPaymentAmount = ca;
        else if (metadata.TryGetValue("confirmedPaymentAmount", out chargeStr) && decimal.TryParse(chargeStr, out ca) && ca > 0)
            confirmedPaymentAmount = ca;

        if (targetClaimAmount <= 0) targetClaimAmount = confirmedPaymentAmount;

        metadata.TryGetValue("siteName", out var siteName);
        metadata.TryGetValue("logoUrl", out var logoUrl);
        metadata.TryGetValue("description", out var description);
        metadata.TryGetValue("faviconUrl", out var faviconUrl);

        // Restore the time mode from session metadata so the engine applies the correct rules.
        // Defaults to false (today mode) when absent — today-mode payments don't need the all-time guard.
        var isAllTimeMode = false;
        if (metadata.TryGetValue("isAllTimeMode", out var allTimeModeStr))
            bool.TryParse(allTimeModeStr, out isAllTimeMode);

        if (categoryId <= 0)
        {
            logger.LogWarning("Missing categoryId in payment metadata for {PaymentId}", paymentId);
            return new VerifyDodoPaymentResponseDto(
                Verified: false,
                PaymentId: paymentId,
                Status: payment.Status,
                Error: "Payment metadata missing required categoryId.");
        }

        logger.LogInformation("Fulfilling claim from Dodo payment verification: {PaymentId}, Category={CategoryId}, Amount={Amount}",
            paymentId, categoryId, confirmedPaymentAmount);

        var placeCommand = new PlaceClaimCommand(
            CategoryId: categoryId,
            ListingId: listingId,
            ListingName: listingName,
            ListingUrl: listingUrl,
            OwnerContactEmail: ownerEmail,
            TargetClaimAmount: targetClaimAmount,
            PaymentReference: paymentId,
            ConfirmedPaymentAmount: confirmedPaymentAmount,
            SiteName: siteName,
            LogoUrl: logoUrl,
            Description: description,
            FaviconUrl: faviconUrl,
            IsAllTimeMode: isAllTimeMode);

        var placeResult = await sender.Send(placeCommand, ct);

        if (placeResult.Success)
        {
            return new VerifyDodoPaymentResponseDto(
                Verified: true,
                PaymentId: paymentId,
                Status: "succeeded",
                Amount: placeResult.AmountCharged ?? confirmedPaymentAmount,
                ListingId: placeResult.ListingId,
                NewClaimAmount: placeResult.NewCurrentClaimAmount ?? targetClaimAmount);
        }
        else
        {
            logger.LogWarning("PlaceClaim rejected during Dodo verification: {ErrorCode} - {ErrorMessage}",
                placeResult.ErrorCode, placeResult.ErrorMessage);

            return new VerifyDodoPaymentResponseDto(
                Verified: false,
                PaymentId: paymentId,
                Status: "succeeded",
                Error: placeResult.ErrorMessage ?? "Claim placement rejected by server.");
        }
    }
}
