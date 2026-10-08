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
            confirmedPaymentAmount: 70m,
            isAllTimeMode: true);

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
            confirmedPaymentAmount: 220m, // gateway charged the full amount instead of the difference
            isAllTimeMode: true);

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
        // The current #1 listing claims again at the same level.
        // In Today mode there is no "cannot lower" guard; the payment is the full target (no credit deduction).
        // existingListingCurrentClaim is 0 because this is the first time this listing has claimed today;
        // it has no prior all-time total in this scenario.
        // newCurrentClaimAmount = 0 + 100 = 100; since existingId == currentTopId and 100 >= 100, stays top.
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 0m,
            categoryMinStartingClaim: 50m,
            currentTopClaimInCategory: 100m,
            currentTopListingId: 1,
            existingListingId: 1,
            existingListingCurrentClaim: 0m,
            targetClaimAmount: 100m,
            confirmedPaymentAmount: 100m,
            isAllTimeMode: false);

        Assert.True(decision.Success);
        Assert.True(decision.BecameCategoryTop);
    }

    // --- Today mode with an existing listing (isAllTimeMode = false) ---

    [Fact]
    public void Evaluate_TodayMode_ExistingListing_ChargesFullTargetAmount()
    {
        // In Today mode, prior payments are NOT credited. The user pays the full target amount
        // regardless of their all-time cumulative total.
        // NewCurrentClaimAmount = existingListingCurrentClaim + targetClaimAmount (accumulation).
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
        // 150 (existing all-time) + 220 (today payment) = 370
        Assert.Equal(370m, decision.NewCurrentClaimAmount);
        Assert.True(decision.BecameCategoryTop); // 370 > 200 (current top)
    }

    [Fact]
    public void Evaluate_TodayMode_ExistingListing_TargetBelowExistingClaim_Succeeds()
    {
        // In Today mode there is no "cannot lower" guard. A user may pay less than their all-time
        // total — the AllTimeCumulativeTooLow guard must NOT fire.
        // NewCurrentClaimAmount = existingListingCurrentClaim + targetClaimAmount (accumulation).
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 10m,
            categoryMinStartingClaim: 50m,
            currentTopClaimInCategory: 200m,
            currentTopListingId: 1,
            existingListingId: 2,
            existingListingCurrentClaim: 150m,
            targetClaimAmount: 100m,  // below the all-time cumulative of 150 — allowed in Today mode
            confirmedPaymentAmount: 100m,
            isAllTimeMode: false);

        Assert.True(decision.Success);
        Assert.Equal(100m, decision.ExpectedChargeAmount);
        // 150 (existing all-time) + 100 (today payment) = 250; beats the current top of 200
        Assert.Equal(250m, decision.NewCurrentClaimAmount);
        Assert.True(decision.BecameCategoryTop); // 250 > 200
    }

    // --- Today mode: CurrentClaimAmount accumulation semantics ---
    //
    // In Today mode the engine charges the FULL targetClaimAmount (no credit deduction) and
    // returns NewCurrentClaimAmount = existingListingCurrentClaim + targetClaimAmount.
    // The handler sets listing.CurrentClaimAmount = decision.NewCurrentClaimAmount for both modes.

    [Fact]
    public void Evaluate_TodayMode_ExistingListing_BelowAllTimeHigh_ChargesFullTarget_AndAccumulates()
    {
        // Listing has all-time total of $100. User pays $50 in Today mode.
        // Engine charges $50 (full target, no credit) and accumulates: 100 + 50 = 150.
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 10m,
            categoryMinStartingClaim: 50m,
            currentTopClaimInCategory: 200m,
            currentTopListingId: 1,
            existingListingId: 2,
            existingListingCurrentClaim: 100m,
            targetClaimAmount: 50m,
            confirmedPaymentAmount: 50m,
            isAllTimeMode: false);

        Assert.True(decision.Success);
        Assert.Equal(50m, decision.ExpectedChargeAmount);
        // NewCurrentClaimAmount = 100 (existing) + 50 (today payment) = 150
        Assert.Equal(150m, decision.NewCurrentClaimAmount);
        // 150 < 200 (current top), so does not become top
        Assert.False(decision.BecameCategoryTop);
    }

    [Fact]
    public void Evaluate_TodayMode_ExistingListing_AccumulationBeatsCurrentTop_BecomesTop()
    {
        // Listing has all-time total of $100. User pays $150 in Today mode (beats all-time high).
        // Engine charges $150 and accumulates: 100 + 150 = 250 > current top 200 → becomes top.
        var decision = ClaimDecisionEngine.Evaluate(
            categoryMinClaimIncrement: 10m,
            categoryMinStartingClaim: 50m,
            currentTopClaimInCategory: 200m,
            currentTopListingId: 1,
            existingListingId: 2,
            existingListingCurrentClaim: 100m,
            targetClaimAmount: 150m,
            confirmedPaymentAmount: 150m,
            isAllTimeMode: false);

        Assert.True(decision.Success);
        Assert.Equal(150m, decision.ExpectedChargeAmount);
        // NewCurrentClaimAmount = 100 (existing) + 150 (today payment) = 250
        Assert.Equal(250m, decision.NewCurrentClaimAmount);
        // 250 > 200 (current top) → becomes top
        Assert.True(decision.BecameCategoryTop);
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
