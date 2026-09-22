using System.Data;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Domain.Events;
using Ranker.Dtos;
using Ranker.Repositories;
using Ranker.Services.Bidding;

namespace Ranker.Application.Bids;

public class PlaceBidCommandHandler(
    RankerDbContext dbContext,
    ICategoryRepository categoryRepository,
    IListingRepository listingRepository,
    IBidRepository bidRepository,
    IMediator mediator,
    ILogger<PlaceBidCommandHandler> logger) : IRequestHandler<PlaceBidCommand, PlaceBidResultDto>
{
    public async Task<PlaceBidResultDto> Handle(PlaceBidCommand command, CancellationToken ct)
    {
        var category = await categoryRepository.GetByIdAsync(command.CategoryId, ct);
        if (category is null)
        {
            return Failure(BidFailureReason.CategoryNotFound, "Category not found.");
        }

        var isNewListing = command.ListingId is null;
        if (isNewListing && (string.IsNullOrWhiteSpace(command.ListingName) || string.IsNullOrWhiteSpace(command.ListingUrl)))
        {
            return Failure(BidFailureReason.NewListingMissingDetails, "ListingName and ListingUrl are required for a new listing.");
        }

        // Serializable ensures the read of the category's current top listing below can't see a
        // phantom/changed row from a concurrent transaction - SQL Server enforces this with range locks,
        // so no raw-SQL table hints are needed to make concurrent bids on the same category race-safe.
        await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);

        Listing? existingListing = null;
        if (command.ListingId is { } listingId)
        {
            existingListing = await listingRepository.GetByIdAsync(listingId, ct);
            if (existingListing is null)
            {
                await transaction.RollbackAsync(ct);
                return Failure(BidFailureReason.ListingNotFound, "Listing not found.");
            }

            if (existingListing.CategoryId != command.CategoryId)
            {
                await transaction.RollbackAsync(ct);
                return Failure(BidFailureReason.ListingCategoryMismatch, "Listing does not belong to this category.");
            }

            if (!string.Equals(existingListing.OwnerContactEmail.Trim(), command.OwnerContactEmail.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                await transaction.RollbackAsync(ct);
                return Failure(BidFailureReason.OwnerEmailMismatch, "OwnerContactEmail does not match the listing on record.");
            }
        }

        // Reads the category's current #1 row; the Serializable transaction guarantees a concurrent
        // bidder targeting the same category can't commit a conflicting change underneath us.
        var topListing = await listingRepository.GetTopListingForUpdateAsync(command.CategoryId, ct);

        var existingListingCurrentBid = existingListing?.CurrentBidAmount ?? 0m;

        var decision = BidDecisionEngine.Evaluate(
            category.MinBidIncrement,
            category.MinStartingBid,
            topListing?.CurrentBidAmount,
            topListing?.Id,
            existingListing?.Id,
            existingListingCurrentBid,
            command.TargetBidAmount,
            command.ConfirmedPaymentAmount);

        if (!decision.Success)
        {
            // BidTooLow / PaymentAmountMismatch mean the client's numbers went stale mid-flight - most
            // often because a concurrent bidder won the row lock first (rule B4). Since payment happens at
            // the gateway before this call, money may already be captured, so we flag it for reconciliation
            // (manual refund) instead of silently discarding it.
            if (decision.FailureReason is BidFailureReason.BidTooLow or BidFailureReason.PaymentAmountMismatch
                && command.ConfirmedPaymentAmount > 0)
            {
                dbContext.BidReconciliations.Add(new BidReconciliation
                {
                    CategoryId = command.CategoryId,
                    ListingId = existingListing?.Id,
                    AttemptedTargetAmount = command.TargetBidAmount,
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
                    "Bid rejected after payment confirmation (reason: {Reason}); flagged for reconciliation. PaymentReference={PaymentReference}",
                    decision.FailureReason, command.PaymentReference);

                return new PlaceBidResultDto(
                    false,
                    "BID_REJECTED_RECONCILE_PAYMENT",
                    $"Bid no longer meets the minimum ({decision.RequiredMinimumBid:0.00}) - a concurrent bid likely won first. Your payment has been flagged for reconciliation/refund.",
                    existingListing?.Id,
                    null,
                    null);
            }

            await transaction.RollbackAsync(ct);
            return Failure(decision.FailureReason, DescribeFailure(decision));
        }

        var now = DateTime.UtcNow;
        Listing listing;
        if (existingListing is null)
        {
            listing = new Listing
            {
                CategoryId = command.CategoryId,
                Name = command.ListingName!,
                Url = command.ListingUrl!,
                OwnerContactEmail = command.OwnerContactEmail,
                CurrentBidAmount = decision.NewCurrentBidAmount,
                FirstBidAt = now,
                LastBidAt = now,
            };
            listingRepository.Add(listing);
        }
        else
        {
            listing = existingListing;
            listing.CurrentBidAmount = decision.NewCurrentBidAmount;
            listing.LastBidAt = now;
        }

        bidRepository.Add(new Bid
        {
            Listing = listing,
            Amount = decision.NewCurrentBidAmount,
            CreatedAt = now,
            PaymentReference = command.PaymentReference,
        });

        try
        {
            await dbContext.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            // Defense-in-depth: should be prevented by the row lock above, but if the optimistic
            // concurrency token still trips, treat it exactly like a lost race.
            logger.LogError(ex, "Concurrency conflict placing bid for listing {ListingId}", existingListing?.Id);
            await transaction.RollbackAsync(ct);
            return Failure(BidFailureReason.BidTooLow, "A concurrent update won the race for this listing. Please retry.");
        }

        await transaction.CommitAsync(ct);

        await mediator.Publish(new BidPlacedEvent(
            listing.Id,
            category.Id,
            category.Slug,
            listing.Name,
            listing.CurrentBidAmount,
            now,
            decision.BecameCategoryTop), ct);

        return new PlaceBidResultDto(true, null, null, listing.Id, listing.CurrentBidAmount, decision.ExpectedChargeAmount);
    }

    private static PlaceBidResultDto Failure(BidFailureReason reason, string message) =>
        new(false, reason.ToString(), message, null, null, null);

    private static string DescribeFailure(BidDecision decision) => decision.FailureReason switch
    {
        BidFailureReason.BidTooLow =>
            $"Target bid must be at least {decision.RequiredMinimumBid:0.00}.",
        BidFailureReason.PaymentAmountMismatch =>
            $"Confirmed payment amount does not match the expected charge of {decision.ExpectedChargeAmount:0.00}.",
        _ => decision.FailureReason.ToString(),
    };
}
