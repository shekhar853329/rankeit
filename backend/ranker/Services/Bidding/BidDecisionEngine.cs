namespace Ranker.Services.Bidding;

public enum BidFailureReason
{
    None,
    CategoryNotFound,
    ListingNotFound,
    ListingCategoryMismatch,
    OwnerEmailMismatch,
    NewListingMissingDetails,
    BidTooLow,
    PaymentAmountMismatch,
}

public sealed record BidDecision(
    bool Success,
    BidFailureReason FailureReason,
    decimal RequiredMinimumBid,
    decimal ExpectedChargeAmount,
    decimal NewCurrentBidAmount,
    bool BecameCategoryTop)
{
    public static BidDecision Fail(BidFailureReason reason, decimal requiredMinimum = 0m, decimal expectedCharge = 0m) =>
        new(false, reason, requiredMinimum, expectedCharge, 0m, false);
}

/// <summary>
/// Pure, side-effect-free bidding rules (business rules B1-B3). Kept independent of EF Core/SQL so it can
/// be unit tested exhaustively and reused by the command handler after it has taken the row lock and
/// loaded a consistent snapshot of the category's current top bid.
/// </summary>
public static class BidDecisionEngine
{
    public static BidDecision Evaluate(
        decimal categoryMinBidIncrement,
        decimal categoryMinStartingBid,
        decimal? currentTopBidInCategory,
        int? currentTopListingId,
        int? existingListingId,
        decimal existingListingCurrentBid,
        decimal targetBidAmount,
        decimal confirmedPaymentAmount)
    {
        // Rule B1/B2: a brand-new listing must clear MinStartingBid when the category is empty; once a
        // top bid exists, every bid (new or re-bid) must clear top + MinBidIncrement.
        var requiredMinimum = currentTopBidInCategory.HasValue
            ? currentTopBidInCategory.Value + categoryMinBidIncrement
            : categoryMinStartingBid;

        if (targetBidAmount < requiredMinimum)
        {
            return BidDecision.Fail(BidFailureReason.BidTooLow, requiredMinimum);
        }

        // Rule B3: a listing reclaiming/raising its own bid pays only the difference from its current bid;
        // a brand-new listing pays its full target amount (its current bid starts at 0).
        var expectedCharge = targetBidAmount - existingListingCurrentBid;

        if (confirmedPaymentAmount != expectedCharge)
        {
            return BidDecision.Fail(BidFailureReason.PaymentAmountMismatch, requiredMinimum, expectedCharge);
        }

        // Mirrors the tie-break rule (CurrentBidAmount DESC, FirstBidAt ASC): a strictly higher bid always
        // takes #1; an equal bid only keeps/gains #1 if it belongs to the listing that already holds it
        // (whose FirstBidAt is already the earliest), otherwise the earlier listing keeps the top spot.
        var becameTop =
            currentTopBidInCategory is null ||
            targetBidAmount > currentTopBidInCategory.Value ||
            existingListingId == currentTopListingId;

        return new BidDecision(true, BidFailureReason.None, requiredMinimum, expectedCharge, targetBidAmount, becameTop);
    }
}
