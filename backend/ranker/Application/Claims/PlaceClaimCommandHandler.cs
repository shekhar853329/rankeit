using System.Data;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Domain.Events;
using Ranker.Dtos;
using Ranker.Repositories;
using Ranker.Services.Claiming;

namespace Ranker.Application.Claims;

public class PlaceClaimCommandHandler(
    RankerDbContext dbContext,
    ICategoryRepository categoryRepository,
    IListingRepository listingRepository,
    IClaimRepository claimRepository,
    IMediator mediator,
    ILogger<PlaceClaimCommandHandler> logger) : IRequestHandler<PlaceClaimCommand, PlaceClaimResultDto>
{
    public async Task<PlaceClaimResultDto> Handle(PlaceClaimCommand command, CancellationToken ct)
    {
        var category = await categoryRepository.GetByIdAsync(command.CategoryId, ct);
        if (category is null)
        {
            return Failure(ClaimFailureReason.CategoryNotFound, "Category not found.");
        }

        var effectiveListingName = !string.IsNullOrWhiteSpace(command.ListingName)
            ? command.ListingName.Trim()
            : (!string.IsNullOrWhiteSpace(command.SiteName)
                ? command.SiteName.Trim()
                : command.ListingUrl?.Trim());

        var effectiveSiteName = !string.IsNullOrWhiteSpace(command.SiteName)
            ? command.SiteName.Trim()
            : effectiveListingName;

        var isNewListing = command.ListingId is null;
        if (isNewListing && (string.IsNullOrWhiteSpace(effectiveListingName) || string.IsNullOrWhiteSpace(command.ListingUrl)))
        {
            return Failure(ClaimFailureReason.NewListingMissingDetails, "ListingUrl is required for a new listing.");
        }

        // NpgsqlRetryingExecutionStrategy does not support user-initiated transactions directly.
        // We must wrap the entire transactional unit inside CreateExecutionStrategy().ExecuteAsync()
        // so the strategy can replay the whole block (including the transaction) on transient failures.
        // Serializable isolation ensures concurrent claims on the same category are race-safe.
        var executionStrategy = dbContext.Database.CreateExecutionStrategy();

        PlaceClaimResultDto result = null!;

        await executionStrategy.ExecuteAsync(async () =>
        {
            await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);

            Listing? existingListing = null;
            if (command.ListingId is { } listingId)
            {
                existingListing = await listingRepository.GetByIdAsync(listingId, ct);
                if (existingListing is null)
                {
                    await transaction.RollbackAsync(ct);
                    result = Failure(ClaimFailureReason.ListingNotFound, "Listing not found.");
                    return;
                }

                if (existingListing.CategoryId != command.CategoryId)
                {
                    await transaction.RollbackAsync(ct);
                    result = Failure(ClaimFailureReason.ListingCategoryMismatch, "Listing does not belong to this category.");
                    return;
                }

                if (!string.Equals(existingListing.OwnerContactEmail.Trim(), command.OwnerContactEmail.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    await transaction.RollbackAsync(ct);
                    result = Failure(ClaimFailureReason.OwnerEmailMismatch, "OwnerContactEmail does not match the listing on record.");
                    return;
                }
            }
            else if (!string.IsNullOrWhiteSpace(command.ListingUrl))
            {
                var trimmedUrl = command.ListingUrl.Trim();
                var matchedListing = await dbContext.Listings
                    .FirstOrDefaultAsync(l => l.CategoryId == command.CategoryId && l.Url == trimmedUrl, ct);

                if (matchedListing != null)
                {
                    if (!string.Equals(matchedListing.OwnerContactEmail.Trim(), command.OwnerContactEmail.Trim(), StringComparison.OrdinalIgnoreCase))
                    {
                        await transaction.RollbackAsync(ct);
                        result = Failure(ClaimFailureReason.OwnerEmailMismatch, "This listing URL is already registered under a different owner contact email.");
                        return;
                    }

                    existingListing = matchedListing;
                }
            }

            // Reads the category's current #1 row; the Serializable transaction guarantees a concurrent
            // claimant targeting the same category can't commit a conflicting change underneath us.
            var topListing = await listingRepository.GetTopListingForUpdateAsync(command.CategoryId, ct);

            var existingListingCurrentClaim = existingListing?.CurrentClaimAmount ?? 0m;

            var decision = ClaimDecisionEngine.Evaluate(
                category.MinClaimIncrement,
                category.MinStartingClaim,
                topListing?.CurrentClaimAmount,
                topListing?.Id,
                existingListing?.Id,
                existingListingCurrentClaim,
                command.TargetClaimAmount,
                command.ConfirmedPaymentAmount);

            if (!decision.Success)
            {
                // ClaimTooLow / PaymentAmountMismatch mean the client's numbers went stale mid-flight - most
                // often because a concurrent claimant won the row lock first. Since payment happens at
                // the gateway before this call, money may already be captured, so we flag it for reconciliation
                // (manual refund) instead of silently discarding it.
                if (decision.FailureReason is ClaimFailureReason.ClaimTooLow or ClaimFailureReason.PaymentAmountMismatch
                    && command.ConfirmedPaymentAmount > 0)
                {
                    dbContext.ClaimReconciliations.Add(new ClaimReconciliation
                    {
                        CategoryId = command.CategoryId,
                        ListingId = existingListing?.Id,
                        AttemptedTargetAmount = command.TargetClaimAmount,
                        ExpectedChargeAmount = decision.ExpectedChargeAmount,
                        ConfirmedPaymentAmount = command.ConfirmedPaymentAmount,
                        PaymentReference = command.PaymentReference,
                        Reason = decision.FailureReason.ToString(),
                        CreatedAt = DateTime.UtcNow,
                        Resolved = false,
                    });
                    await dbContext.SaveChangesAsync(ct);
                    await transaction.CommitAsync(ct);

                    logger.LogWarning(
                        "Claim rejected after payment confirmation (reason: {Reason}); flagged for reconciliation. PaymentReference={PaymentReference}",
                        decision.FailureReason, command.PaymentReference);

                    result = new PlaceClaimResultDto(
                        false,
                        "CLAIM_REJECTED_RECONCILE_PAYMENT",
                        $"Claim no longer meets the minimum ({decision.RequiredMinimumClaim:0.00}) - a concurrent claim likely won first. Your payment has been flagged for reconciliation/refund.",
                        existingListing?.Id,
                        null,
                        null);
                    return;
                }

                await transaction.RollbackAsync(ct);
                result = Failure(decision.FailureReason, DescribeFailure(decision));
                return;
            }

            var now = DateTime.UtcNow;
            Listing listing;
            if (existingListing is null)
            {
                listing = new Listing
                {
                    CategoryId = command.CategoryId,
                    Name = effectiveListingName!,
                    Url = command.ListingUrl!,
                    OwnerContactEmail = command.OwnerContactEmail,
                    CurrentClaimAmount = decision.NewCurrentClaimAmount,
                    FirstClaimAt = now,
                    LastClaimAt = now,
                    SiteName = effectiveSiteName,
                    LogoUrl = command.LogoUrl,
                    Description = command.Description,
                    FaviconUrl = command.FaviconUrl,
                };
                listingRepository.Add(listing);
            }
            else
            {
                listing = existingListing;
                listing.CurrentClaimAmount = decision.NewCurrentClaimAmount;
                listing.LastClaimAt = now;
                if (!string.IsNullOrWhiteSpace(command.ListingName))
                    listing.Name = command.ListingName.Trim();
                else if (string.IsNullOrWhiteSpace(listing.Name) && !string.IsNullOrWhiteSpace(effectiveListingName))
                    listing.Name = effectiveListingName;

                if (!string.IsNullOrWhiteSpace(command.SiteName))
                    listing.SiteName = command.SiteName.Trim();
                else if (string.IsNullOrWhiteSpace(listing.SiteName) && !string.IsNullOrWhiteSpace(effectiveSiteName))
                    listing.SiteName = effectiveSiteName;

                if (!string.IsNullOrWhiteSpace(command.LogoUrl)) listing.LogoUrl = command.LogoUrl;
                if (!string.IsNullOrWhiteSpace(command.Description)) listing.Description = command.Description;
                if (!string.IsNullOrWhiteSpace(command.FaviconUrl)) listing.FaviconUrl = command.FaviconUrl;
            }

            claimRepository.Add(new Claim
            {
                Listing = listing,
                Amount = decision.NewCurrentClaimAmount,
                PaymentAmount = decision.ExpectedChargeAmount,
                CreatedAt = now,
                PaymentReference = command.PaymentReference,
            });

            dbContext.PaymentAuditLogs.Add(new PaymentAuditLog
            {
                Action = "PlaceClaim",
                Gateway = "Razorpay",
                PaymentReference = command.PaymentReference,
                Amount = decision.ExpectedChargeAmount,
                AmountInPaise = (long)(decision.ExpectedChargeAmount * 100m),
                Currency = "INR",
                IsSuccess = true,
                RequestPayloadJson = System.Text.Json.JsonSerializer.Serialize(new
                {
                    listingId = listing.Id,
                    listingName = listing.Name,
                    categoryId = command.CategoryId,
                    targetClaimAmount = command.TargetClaimAmount,
                    confirmedPaymentAmount = command.ConfirmedPaymentAmount,
                    paymentReference = command.PaymentReference,
                }),
                ResponsePayloadJson = System.Text.Json.JsonSerializer.Serialize(new
                {
                    listingId = listing.Id,
                    newCurrentClaimAmount = listing.CurrentClaimAmount,
                    actualPaymentCharged = decision.ExpectedChargeAmount,
                    becameCategoryTop = decision.BecameCategoryTop,
                }),
                CreatedAt = now,
            });

            try
            {
                await dbContext.SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException ex)
            {
                // Defense-in-depth: should be prevented by the row lock above, but if the optimistic
                // concurrency token still trips, treat it exactly like a lost race.
                logger.LogError(ex, "Concurrency conflict placing claim for listing {ListingId}", existingListing?.Id);
                await transaction.RollbackAsync(ct);
                result = Failure(ClaimFailureReason.ClaimTooLow, "A concurrent update won the race for this listing. Please retry.");
                return;
            }

            await transaction.CommitAsync(ct);

            await mediator.Publish(new ClaimPlacedEvent(
                listing.Id,
                category.Id,
                category.Slug,
                listing.Name,
                listing.CurrentClaimAmount,
                now,
                decision.BecameCategoryTop), ct);

            result = new PlaceClaimResultDto(true, null, null, listing.Id, listing.CurrentClaimAmount, decision.ExpectedChargeAmount);
        });

        return result;
    }

    private static PlaceClaimResultDto Failure(ClaimFailureReason reason, string message) =>
        new(false, reason.ToString(), message, null, null, null);

    private static string DescribeFailure(ClaimDecision decision) => decision.FailureReason switch
    {
        ClaimFailureReason.ClaimTooLow =>
            $"Target claim must be at least {decision.RequiredMinimumClaim:0.00}.",
        ClaimFailureReason.PaymentAmountMismatch =>
            $"Confirmed payment amount does not match the expected charge of {decision.ExpectedChargeAmount:0.00}.",
        _ => decision.FailureReason.ToString(),
    };
}
