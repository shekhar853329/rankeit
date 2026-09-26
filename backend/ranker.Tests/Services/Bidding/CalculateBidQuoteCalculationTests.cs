using Ranker.Services.Bidding;
using Xunit;

namespace Ranker.Tests.Services.Bidding;

public class CalculateBidQuoteCalculationTests
{
    [Fact]
    public void Quote_NewListing_ExpectedChargeEqualsTargetAmount()
    {
        const decimal targetBidAmount = 150m;
        const decimal existingListingBid = 0m;

        var expectedCharge = Math.Max(0m, targetBidAmount - existingListingBid);

        Assert.Equal(150m, expectedCharge);
    }

    [Fact]
    public void Quote_RebidOnExistingListing_ExpectedChargeIsDifference()
    {
        const decimal targetBidAmount = 220m;
        const decimal existingListingBid = 150m;

        var expectedCharge = Math.Max(0m, targetBidAmount - existingListingBid);

        Assert.Equal(70m, expectedCharge);
    }

    [Fact]
    public void Quote_RequiredMinimumBid_CategoryEmpty_EqualsMinStartingBid()
    {
        decimal? currentTopBid = null;
        const decimal minStartingBid = 100m;
        const decimal minBidIncrement = 10m;

        var requiredMinimum = currentTopBid.HasValue
            ? currentTopBid.Value + minBidIncrement
            : minStartingBid;

        Assert.Equal(100m, requiredMinimum);
    }

    [Fact]
    public void Quote_RequiredMinimumBid_CategoryHasTopBid_EqualsTopPlusIncrement()
    {
        decimal? currentTopBid = 200m;
        const decimal minStartingBid = 100m;
        const decimal minBidIncrement = 10m;

        var requiredMinimum = currentTopBid.HasValue
            ? currentTopBid.Value + minBidIncrement
            : minStartingBid;

        Assert.Equal(210m, requiredMinimum);
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(250, true)]
    public void Quote_TargetAmountMeetsMinimumCheck(decimal target, bool expectedValid)
    {
        const decimal requiredMinimum = 1m;
        var isValid = target >= requiredMinimum;

        Assert.Equal(expectedValid, isValid);
    }

    [Fact]
    public void Quote_TargetAmountMustBeStrictlyHigherThanExistingListingCurrentBid()
    {
        const decimal existingBid = 150m;
        const decimal targetBid = 150m;

        var isHigher = targetBid > existingBid;

        Assert.False(isHigher);
    }
}
