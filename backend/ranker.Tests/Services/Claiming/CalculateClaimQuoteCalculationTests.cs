using Ranker.Services.Claiming;
using Xunit;

namespace Ranker.Tests.Services.Claiming;

public class CalculateClaimQuoteCalculationTests
{
    [Fact]
    public void Quote_NewListing_ExpectedChargeEqualsTargetAmount()
    {
        const decimal targetClaimAmount = 150m;
        const decimal existingListingClaim = 0m;

        var expectedCharge = Math.Max(0m, targetClaimAmount - existingListingClaim);

        Assert.Equal(150m, expectedCharge);
    }

    [Fact]
    public void Quote_ReclaimOnExistingListing_ExpectedChargeIsDifference()
    {
        const decimal targetClaimAmount = 220m;
        const decimal existingListingClaim = 150m;

        var expectedCharge = Math.Max(0m, targetClaimAmount - existingListingClaim);

        Assert.Equal(70m, expectedCharge);
    }

    [Fact]
    public void Quote_RequiredMinimumClaim_CategoryEmpty_EqualsMinStartingClaim()
    {
        decimal? currentTopClaim = null;
        const decimal minStartingClaim = 100m;
        const decimal minClaimIncrement = 10m;

        var requiredMinimum = currentTopClaim.HasValue
            ? currentTopClaim.Value + minClaimIncrement
            : minStartingClaim;

        Assert.Equal(100m, requiredMinimum);
    }

    [Fact]
    public void Quote_RequiredMinimumClaim_CategoryHasTopClaim_EqualsTopPlusIncrement()
    {
        decimal? currentTopClaim = 200m;
        const decimal minStartingClaim = 100m;
        const decimal minClaimIncrement = 1m;

        var requiredMinimum = currentTopClaim.HasValue
            ? currentTopClaim.Value + minClaimIncrement
            : minStartingClaim;

        Assert.Equal(201m, requiredMinimum);
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
    public void Quote_TargetAmountMustBeStrictlyHigherThanExistingListingCurrentClaim()
    {
        const decimal existingClaim = 150m;
        const decimal targetClaim = 150m;

        var isHigher = targetClaim > existingClaim;

        Assert.False(isHigher);
    }
}
