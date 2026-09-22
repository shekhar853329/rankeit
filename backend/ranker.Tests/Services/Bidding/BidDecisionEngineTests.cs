using Ranker.Services.Bidding;
using Xunit;

namespace Ranker.Tests.Services.Bidding;

public class BidDecisionEngineTests
{
    // --- Min-increment / min-starting-bid validation (rule B1/B2) ---

    [Fact]
    public void Evaluate_NewListing_EmptyCategory_MustMeetMinStartingBid()
    {
        var decision = BidDecisionEngine.Evaluate(
            categoryMinBidIncrement: 10m,
            categoryMinStartingBid: 100m,
            currentTopBidInCategory: null,
            currentTopListingId: null,
            existingListingId: null,
            existingListingCurrentBid: 0m,
            targetBidAmount: 99m,
            confirmedPaymentAmount: 99m);

        Assert.False(decision.Success);
        Assert.Equal(BidFailureReason.BidTooLow, decision.FailureReason);
        Assert.Equal(100m, decision.RequiredMinimumBid);
    }

    [Fact]
    public void Evaluate_NewListing_EmptyCategory_ExactlyMinStartingBid_Succeeds()
    {
        var decision = BidDecisionEngine.Evaluate(
            categoryMinBidIncrement: 10m,
            categoryMinStartingBid: 100m,
            currentTopBidInCategory: null,
            currentTopListingId: null,
            existingListingId: null,
            existingListingCurrentBid: 0m,
            targetBidAmount: 100m,
            confirmedPaymentAmount: 100m);

        Assert.True(decision.Success);
        Assert.True(decision.BecameCategoryTop);
        Assert.Equal(100m, decision.NewCurrentBidAmount);
    }

    [Theory]
    [InlineData(109, false)] // below top(100) + increment(10)
    [InlineData(110, true)]  // exactly top + increment
    [InlineData(150, true)]  // comfortably above
    public void Evaluate_BidBelowTopPlusIncrement_IsRejected(decimal target, bool expectedSuccess)
    {
        var decision = BidDecisionEngine.Evaluate(
            categoryMinBidIncrement: 10m,
            categoryMinStartingBid: 50m,
            currentTopBidInCategory: 100m,
            currentTopListingId: 1,
            existingListingId: null,
            existingListingCurrentBid: 0m,
            targetBidAmount: target,
            confirmedPaymentAmount: target);

        Assert.Equal(expectedSuccess, decision.Success);
        if (!expectedSuccess)
        {
            Assert.Equal(BidFailureReason.BidTooLow, decision.FailureReason);
        }
    }

    // --- Re-bid difference calculation (rule B3) ---

    [Fact]
    public void Evaluate_ReclaimingTopSpot_ChargesOnlyTheDifference()
    {
        // Listing 2 previously bid 150 (now sitting below the current top of 200) and wants to reclaim
        // #1 at 220. It should only be charged 220 - 150 = 70, not the full 220.
        var decision = BidDecisionEngine.Evaluate(
            categoryMinBidIncrement: 10m,
            categoryMinStartingBid: 50m,
            currentTopBidInCategory: 200m,
            currentTopListingId: 1,
            existingListingId: 2,
            existingListingCurrentBid: 150m,
            targetBidAmount: 220m,
            confirmedPaymentAmount: 70m);

        Assert.True(decision.Success);
        Assert.Equal(70m, decision.ExpectedChargeAmount);
        Assert.Equal(220m, decision.NewCurrentBidAmount);
        Assert.True(decision.BecameCategoryTop);
    }

    [Fact]
    public void Evaluate_ReclaimingTopSpot_WrongConfirmedAmount_IsRejected()
    {
        var decision = BidDecisionEngine.Evaluate(
            categoryMinBidIncrement: 10m,
            categoryMinStartingBid: 50m,
            currentTopBidInCategory: 200m,
            currentTopListingId: 1,
            existingListingId: 2,
            existingListingCurrentBid: 150m,
            targetBidAmount: 220m,
            confirmedPaymentAmount: 220m); // gateway charged the full amount instead of the difference

        Assert.False(decision.Success);
        Assert.Equal(BidFailureReason.PaymentAmountMismatch, decision.FailureReason);
        Assert.Equal(70m, decision.ExpectedChargeAmount);
    }

    [Fact]
    public void Evaluate_NewListing_ChargesFullTargetAmount()
    {
        var decision = BidDecisionEngine.Evaluate(
            categoryMinBidIncrement: 10m,
            categoryMinStartingBid: 50m,
            currentTopBidInCategory: 200m,
            currentTopListingId: 1,
            existingListingId: null,
            existingListingCurrentBid: 0m,
            targetBidAmount: 210m,
            confirmedPaymentAmount: 210m);

        Assert.True(decision.Success);
        Assert.Equal(210m, decision.ExpectedChargeAmount);
    }

    // --- Tie-break semantics mirrored from the SQL ORDER BY CurrentBidAmount DESC, FirstBidAt ASC ---

    [Fact]
    public void Evaluate_EqualBid_ByADifferentListing_DoesNotBecomeTop()
    {
        // MinBidIncrement of 0 allows an equal bid to pass the minimum check, but the earlier bidder
        // (FirstBidAt ASC) should still keep the #1 spot on a tie.
        var decision = BidDecisionEngine.Evaluate(
            categoryMinBidIncrement: 0m,
            categoryMinStartingBid: 50m,
            currentTopBidInCategory: 100m,
            currentTopListingId: 1,
            existingListingId: 2,
            existingListingCurrentBid: 0m,
            targetBidAmount: 100m,
            confirmedPaymentAmount: 100m);

        Assert.True(decision.Success);
        Assert.False(decision.BecameCategoryTop);
    }

    [Fact]
    public void Evaluate_EqualBid_ByTheCurrentTopListingItself_StaysTop()
    {
        var decision = BidDecisionEngine.Evaluate(
            categoryMinBidIncrement: 0m,
            categoryMinStartingBid: 50m,
            currentTopBidInCategory: 100m,
            currentTopListingId: 1,
            existingListingId: 1,
            existingListingCurrentBid: 100m,
            targetBidAmount: 100m,
            confirmedPaymentAmount: 0m);

        Assert.True(decision.Success);
        Assert.True(decision.BecameCategoryTop);
    }

    // --- Race-condition safety: two concurrent bidders targeting the same #1 spot ---

    [Fact]
    public void Evaluate_SecondConcurrentBidder_SeesUpdatedTopAndIsRejected()
    {
        // Simulates the outcome of the row-level lock in ListingRepository.GetTopListingForUpdateAsync:
        // bidder A's transaction commits first and becomes the new top; bidder B's transaction only
        // proceeds afterwards (having been blocked by the lock) and now evaluates against A's fresh bid.
        const decimal minIncrement = 10m;
        const decimal minStarting = 50m;
        const decimal originalTop = 100m;

        var bidderA = BidDecisionEngine.Evaluate(
            minIncrement, minStarting, originalTop, currentTopListingId: 1,
            existingListingId: null, existingListingCurrentBid: 0m,
            targetBidAmount: 120m, confirmedPaymentAmount: 120m);

        Assert.True(bidderA.Success);

        // Bidder B computed their bid against the same stale snapshot (originalTop = 100) before the lock
        // serialized them behind bidder A. Once unblocked, they must be evaluated against A's new top (120).
        var bidderB = BidDecisionEngine.Evaluate(
            minIncrement, minStarting, currentTopBidInCategory: bidderA.NewCurrentBidAmount, currentTopListingId: 2,
            existingListingId: null, existingListingCurrentBid: 0m,
            targetBidAmount: 120m, confirmedPaymentAmount: 120m);

        Assert.False(bidderB.Success);
        Assert.Equal(BidFailureReason.BidTooLow, bidderB.FailureReason);
        Assert.Equal(130m, bidderB.RequiredMinimumBid);
    }
}
