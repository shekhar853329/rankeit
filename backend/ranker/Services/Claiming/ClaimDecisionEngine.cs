namespace Ranker.Services.Claiming;

public enum ClaimFailureReason
{
    None,
    CategoryNotFound,
    ListingNotFound,
    ListingCategoryMismatch,
    OwnerEmailMismatch,
    NewListingMissingDetails,
    ClaimTooLow,
    PaymentAmountMismatch,
    /// <summary>
    /// All-time mode only: the target amount does not exceed the listing's all-time cumulative total paid.
    /// </summary>
    AllTimeCumulativeTooLow,
}

public sealed record ClaimDecision(
    bool Success,
    ClaimFailureReason FailureReason,
    decimal RequiredMinimumClaim,
    decimal ExpectedChargeAmount,
    decimal NewCurrentClaimAmount,
    bool BecameCategoryTop)
{
    public static ClaimDecision Fail(ClaimFailureReason reason, decimal requiredMinimum = 0m, decimal expectedCharge = 0m) =>
        new(false, reason, requiredMinimum, expectedCharge, 0m, false);
}

/// <summary>
/// Pure, side-effect-free claim rules (business rules B1-B3). Kept independent of EF Core/SQL so it can
/// be unit tested exhaustively and reused by the command handler after it has taken the row lock and
/// loaded a consistent snapshot of the category's current top claim.
/// </summary>
public static class ClaimDecisionEngine
{
    public static ClaimDecision Evaluate(
        decimal categoryMinClaimIncrement,
        decimal categoryMinStartingClaim,
        decimal? currentTopClaimInCategory,
        int? currentTopListingId,
        int? existingListingId,
        decimal existingListingCurrentClaim,
        decimal targetClaimAmount,
        decimal confirmedPaymentAmount,
        bool isAllTimeMode = false)
    {
        // Amount required to take or maintain Rank #1: uses categoryMinClaimIncrement from database
        var rank1Minimum = currentTopClaimInCategory.HasValue
            ? currentTopClaimInCategory.Value + categoryMinClaimIncrement
            : categoryMinStartingClaim;

        const decimal absoluteFloor = 1m;
        if (targetClaimAmount < absoluteFloor)
        {
            return ClaimDecision.Fail(ClaimFailureReason.ClaimTooLow, absoluteFloor);
        }

        // All-time mode: a listing's new target must be strictly greater than its all-time cumulative total
        // paid. Because CurrentClaimAmount is maintained as a running total (each reclaim raises it by the
        // delta charged), it IS the all-time cumulative paid — no separate column is needed.
        if (isAllTimeMode && existingListingId.HasValue && targetClaimAmount <= existingListingCurrentClaim)
        {
            return ClaimDecision.Fail(ClaimFailureReason.AllTimeCumulativeTooLow, existingListingCurrentClaim + categoryMinClaimIncrement);
        }

        // A listing cannot lower its active claim
        if (existingListingId.HasValue && targetClaimAmount < existingListingCurrentClaim)
        {
            return ClaimDecision.Fail(ClaimFailureReason.ClaimTooLow, existingListingCurrentClaim);
        }

        // Rule B3: a listing reclaiming/raising its own position pays only the difference from its current claim;
        // a brand-new listing pays its full target amount (its current claim starts at 0).
        var expectedCharge = targetClaimAmount - existingListingCurrentClaim;

        if (confirmedPaymentAmount != expectedCharge)
        {
            return ClaimDecision.Fail(ClaimFailureReason.PaymentAmountMismatch, rank1Minimum, expectedCharge);
        }

        // Mirrors the tie-break rule (CurrentClaimAmount DESC, FirstClaimAt ASC): a strictly higher claim always
        // takes #1; an equal claim only keeps/gains #1 if it belongs to the listing that already holds it
        // (whose FirstClaimAt is already the earliest), otherwise the earlier listing keeps the top spot.
        var becameTop =
            currentTopClaimInCategory is null ||
            targetClaimAmount > currentTopClaimInCategory.Value ||
            (existingListingId == currentTopListingId && targetClaimAmount >= currentTopClaimInCategory.Value);

        return new ClaimDecision(true, ClaimFailureReason.None, rank1Minimum, expectedCharge, targetClaimAmount, becameTop);
    }
}
