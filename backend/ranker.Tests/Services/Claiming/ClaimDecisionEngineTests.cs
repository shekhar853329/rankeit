using Ranker.Services.Claiming;
using Xunit;

namespace Ranker.Tests.Services.Claiming;

public class ClaimDecisionEngineTests
{
    // --- Min-increment / min-starting-claim validation (rule B1/B2) ---

    [Fact]
    public void Evaluate_NewListing_BelowMinimumOneRupee_Fails()
    {
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 10m,
            categoryMinStartingClaim: 100m,
            currentTopClaimInCategory: null,
            currentTopListingId: null,
            existingListingId: null,
            existingListingCurrentClaim: 0m,
            targetClaimAmount: 0m,
            confirmedPaymentAmount: 0m);

        Assert.False(decision.Success);
        Assert.Equal(ClaimFailureReason.ClaimTooLow, decision.FailureReason);
        Assert.Equal(1m, decision.RequiredMinimumClaim);
    }

    [Fact]
    public void Evaluate_NewListing_AnyValidAmount_Succeeds()
    {
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 10m,
            categoryMinStartingClaim: 100m,
            currentTopClaimInCategory: null,
            currentTopListingId: null,
            existingListingId: null,
            existingListingCurrentClaim: 0m,
            targetClaimAmount: 50m,
            confirmedPaymentAmount: 50m);

        Assert.True(decision.Success);
        Assert.True(decision.BecameCategoryTop);
        Assert.Equal(50m, decision.NewCurrentClaimAmount);
    }

    [Theory]
    [InlineData(50, false)]  // below top(100) -> succeeds, but does not become top
    [InlineData(100, false)] // equal to top(100) -> succeeds, but does not become top
    [InlineData(101, true)]  // 1 rupee above top(100) -> succeeds and becomes top
    [InlineData(110, true)]  // above top(100) -> succeeds and becomes top
    [InlineData(150, true)]  // comfortably above -> succeeds and becomes top
    public void Evaluate_ClaimBelowTopPlusIncrement_SucceedsAndDeterminesBecameTop(decimal target, bool expectedBecameTop)
    {
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 10m,
            categoryMinStartingClaim: 50m,
            currentTopClaimInCategory: 100m,
            currentTopListingId: 1,
            existingListingId: null,
            existingListingCurrentClaim: 0m,
            targetClaimAmount: target,
            confirmedPaymentAmount: target);

        Assert.True(decision.Success);
        Assert.Equal(expectedBecameTop, decision.BecameCategoryTop);
    }

    // --- Re-claim difference calculation (rule B3) ---

    [Fact]
    public void Evaluate_ReclaimingTopSpot_ChargesOnlyTheDifference()
    {
        // Listing 2 previously claimed 150 (now sitting below the current top of 200) and wants to reclaim
        // #1 at 220. It should only be charged 220 - 150 = 70, not the full 220.
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 10m,
            categoryMinStartingClaim: 50m,
            currentTopClaimInCategory: 200m,
            currentTopListingId: 1,
            existingListingId: 2,
            existingListingCurrentClaim: 150m,
            targetClaimAmount: 220m,
            confirmedPaymentAmount: 70m);

        Assert.True(decision.Success);
        Assert.Equal(70m, decision.ExpectedChargeAmount);
        Assert.Equal(220m, decision.NewCurrentClaimAmount);
        Assert.True(decision.BecameCategoryTop);
    }

    [Fact]
    public void Evaluate_ReclaimingTopSpot_WrongConfirmedAmount_IsRejected()
    {
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 10m,
            categoryMinStartingClaim: 50m,
            currentTopClaimInCategory: 200m,
            currentTopListingId: 1,
            existingListingId: 2,
            existingListingCurrentClaim: 150m,
            targetClaimAmount: 220m,
            confirmedPaymentAmount: 220m); // gateway charged the full amount instead of the difference

        Assert.False(decision.Success);
        Assert.Equal(ClaimFailureReason.PaymentAmountMismatch, decision.FailureReason);
        Assert.Equal(70m, decision.ExpectedChargeAmount);
    }

    [Fact]
    public void Evaluate_NewListing_ChargesFullTargetAmount()
    {
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 10m,
            categoryMinStartingClaim: 50m,
            currentTopClaimInCategory: 200m,
            currentTopListingId: 1,
            existingListingId: null,
            existingListingCurrentClaim: 0m,
            targetClaimAmount: 210m,
            confirmedPaymentAmount: 210m);

        Assert.True(decision.Success);
        Assert.Equal(210m, decision.ExpectedChargeAmount);
    }

    // --- Tie-break semantics mirrored from the SQL ORDER BY CurrentClaimAmount DESC, FirstClaimAt ASC ---

    [Fact]
    public void Evaluate_EqualClaim_ByADifferentListing_DoesNotBecomeTop()
    {
        // MinClaimIncrement of 0 allows an equal claim to pass the minimum check, but the earlier claimant
        // (FirstClaimAt ASC) should still keep the #1 spot on a tie.
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 0m,
            categoryMinStartingClaim: 50m,
            currentTopClaimInCategory: 100m,
            currentTopListingId: 1,
            existingListingId: 2,
            existingListingCurrentClaim: 0m,
            targetClaimAmount: 100m,
            confirmedPaymentAmount: 100m);

        Assert.True(decision.Success);
        Assert.False(decision.BecameCategoryTop);
    }

    [Fact]
    public void Evaluate_EqualClaim_ByTheCurrentTopListingItself_StaysTop()
    {
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 0m,
            categoryMinStartingClaim: 50m,
            currentTopClaimInCategory: 100m,
            currentTopListingId: 1,
            existingListingId: 1,
            existingListingCurrentClaim: 100m,
            targetClaimAmount: 100m,
            confirmedPaymentAmount: 0m);

        Assert.True(decision.Success);
        Assert.True(decision.BecameCategoryTop);
    }

    // --- Today mode with an existing listing (isAllTimeMode = false) ---

    [Fact]
    public void Evaluate_TodayMode_ExistingListing_ChargesFullTargetAmount()
    {
        // In Today mode, prior payments are NOT credited. The user pays the full target amount
        // regardless of their all-time cumulative total.
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 10m,
            categoryMinStartingClaim: 50m,
            currentTopClaimInCategory: 200m,
            currentTopListingId: 1,
            existingListingId: 2,
            existingListingCurrentClaim: 150m,
            targetClaimAmount: 220m,
            confirmedPaymentAmount: 220m, // full amount, not delta
            isAllTimeMode: false);

        Assert.True(decision.Success);
        Assert.Equal(220m, decision.ExpectedChargeAmount);
        Assert.Equal(220m, decision.NewCurrentClaimAmount);
        Assert.True(decision.BecameCategoryTop);
    }

    [Fact]
    public void Evaluate_TodayMode_ExistingListing_TargetBelowExistingClaim_Succeeds()
    {
        // In Today mode there is no "cannot lower" guard. A user may pay less than their all-time
        // total — the AllTimeCumulativeTooLow guard must NOT fire.
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 10m,
            categoryMinStartingClaim: 50m,
            currentTopClaimInCategory: 200m,
            currentTopListingId: 1,
            existingListingId: 2,
            existingListingCurrentClaim: 150m,
            targetClaimAmount: 100m,  // below the all-time cumulative of 150
            confirmedPaymentAmount: 100m,
            isAllTimeMode: false);

        Assert.True(decision.Success);
        Assert.Equal(100m, decision.ExpectedChargeAmount);
        Assert.Equal(100m, decision.NewCurrentClaimAmount);
    }

    // --- Race-condition safety: two concurrent claimants targeting the same #1 spot ---

    [Fact]
    public void Evaluate_SecondConcurrentClaimant_SeesUpdatedTopAndDoesNotBecomeTop()
    {
        // Simulates the outcome of the row-level lock in ListingRepository.GetTopListingForUpdateAsync:
        // claimant A's transaction commits first and becomes the new top; claimant B's transaction only
        // proceeds afterwards (having been blocked by the lock) and now evaluates against A's fresh claim.
        const decimal minIncrement = 10m;
        const decimal minStarting = 50m;
        const decimal originalTop = 100m;

        var claimantA = ClaimDecisionEngine.Evaluate(
            minIncrement, minStarting, originalTop, currentTopListingId: 1,
            existingListingId: null, existingListingCurrentClaim: 0m,
            targetClaimAmount: 120m, confirmedPaymentAmount: 120m);

        Assert.True(claimantA.Success);
        Assert.True(claimantA.BecameCategoryTop);

        // Claimant B computed their claim against the same stale snapshot (originalTop = 100) before the lock
        // serialized them behind claimant A. Once unblocked, their claim of 120 still succeeds but does not become top.
        var claimantB = ClaimDecisionEngine.Evaluate(
            minIncrement, minStarting, currentTopClaimInCategory: claimantA.NewCurrentClaimAmount, currentTopListingId: 2,
            existingListingId: null, existingListingCurrentClaim: 0m,
            targetClaimAmount: 120m, confirmedPaymentAmount: 120m);

        Assert.True(claimantB.Success);
        Assert.False(claimantB.BecameCategoryTop);
    }
}
