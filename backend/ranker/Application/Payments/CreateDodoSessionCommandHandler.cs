using System.Text.Json;
using MediatR;
using Microsoft.Extensions.Logging;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Dtos;
using Ranker.Services.Payments;

namespace Ranker.Application.Payments;

public class CreateDodoSessionCommandHandler(
    IDodoPaymentsService dodoPaymentsService,
    RankerDbContext dbContext,
    ILogger<CreateDodoSessionCommandHandler> logger)
    : IRequestHandler<CreateDodoSessionCommand, CreateDodoSessionResponseDto>
{
    private const int MinAmountInMinorUnits = 100;

    public async Task<CreateDodoSessionResponseDto> Handle(
        CreateDodoSessionCommand command,
        CancellationToken ct)
    {
        if (command.AmountInMinorUnits < MinAmountInMinorUnits)
        {
            throw new ArgumentOutOfRangeException(
                nameof(command.AmountInMinorUnits),
                command.AmountInMinorUnits,
                $"Amount must be at least {MinAmountInMinorUnits} minor units (1.00).");
        }

        var metadata = new Dictionary<string, string>();
        if (command.Metadata != null)
        {
            foreach (var kvp in command.Metadata)
            {
                if (!string.IsNullOrWhiteSpace(kvp.Value))
                    metadata[kvp.Key] = kvp.Value;
            }
        }

        if (!string.IsNullOrWhiteSpace(command.ListingName))
            metadata["listingName"] = command.ListingName;
        if (!string.IsNullOrWhiteSpace(command.ListingId))
            metadata["listingId"] = command.ListingId;
        if (!string.IsNullOrWhiteSpace(command.CategoryId))
            metadata["categoryId"] = command.CategoryId;
        if (!string.IsNullOrWhiteSpace(command.CustomerEmail))
            metadata["ownerContactEmail"] = command.CustomerEmail;

        var requestJson = JsonSerializer.Serialize(new
        {
            amountInMinorUnits = command.AmountInMinorUnits,
            currency = command.Currency,
            customerEmail = command.CustomerEmail,
            customerName = command.CustomerName,
            returnUrl = command.ReturnUrl,
            metadata
        });

        logger.LogInformation(
            "Creating Dodo Payments checkout session: amount={Amount} {Currency}, email={Email}",
            command.AmountInMinorUnits, command.Currency, command.CustomerEmail);

        try
        {
            var (sessionId, checkoutUrl) = await dodoPaymentsService.CreateCheckoutSessionAsync(
                amountInMinorUnits: command.AmountInMinorUnits,
                currency: command.Currency,
                customerEmail: command.CustomerEmail,
                customerName: command.CustomerName,
                returnUrl: command.ReturnUrl,
                metadata: metadata,
                billingStreet: command.BillingStreet,
                billingCity: command.BillingCity,
                billingState: command.BillingState,
                billingCountry: command.BillingCountry,
                billingZipcode: command.BillingZipcode,
                ct: ct);

            var responseJson = JsonSerializer.Serialize(new
            {
                sessionId,
                checkoutUrl
            });

            logger.LogInformation("Dodo Payments checkout session created: {SessionId}", sessionId);

            var audit = new PaymentAuditLog
            {
                Action = "CreateSession",
                Gateway = "DodoPayments",
                OrderId = sessionId,
                AmountInPaise = command.AmountInMinorUnits,
                Amount = Math.Round((decimal)command.AmountInMinorUnits / 100m, 2),
                Currency = command.Currency,
                RequestPayloadJson = requestJson,
                ResponsePayloadJson = responseJson,
                IsSuccess = true,
                CreatedAt = DateTime.UtcNow,
            };

            dbContext.PaymentAuditLogs.Add(audit);
            await dbContext.SaveChangesAsync(ct);

            return new CreateDodoSessionResponseDto(sessionId, checkoutUrl);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed creating Dodo checkout session: amount={Amount} {Currency}, email={Email}",
                command.AmountInMinorUnits, command.Currency, command.CustomerEmail);

            var failedAudit = new PaymentAuditLog
            {
                Action = "CreateSession",
                Gateway = "DodoPayments",
                AmountInPaise = command.AmountInMinorUnits,
                Amount = Math.Round((decimal)command.AmountInMinorUnits / 100m, 2),
                Currency = command.Currency,
                RequestPayloadJson = requestJson,
                IsSuccess = false,
                ErrorMessage = ex.Message,
                CreatedAt = DateTime.UtcNow,
            };

            dbContext.PaymentAuditLogs.Add(failedAudit);
            try { await dbContext.SaveChangesAsync(ct); } catch { /* Ignore secondary logging failure */ }

            throw;
        }
    }
}
