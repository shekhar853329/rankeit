using Ranker.Domain.Entities;
using Xunit;

namespace Ranker.Tests.Services.Leaderboards;

/// <summary>
/// Verifies the exact ordering semantics the SQL leaderboard query relies on
/// (ORDER BY CurrentClaimAmount DESC, FirstClaimAt ASC), independent of any database.
/// </summary>
public class LeaderboardOrderingTests
{
    [Fact]
    public void Ranking_OrdersByClaimAmountDescending()
    {
        var listings = new List<Listing>
        {
            NewListing(id: 1, claim: 50m, firstClaimAt: Day(1)),
            NewListing(id: 2, claim: 200m, firstClaimAt: Day(2)),
            NewListing(id: 3, claim: 100m, firstClaimAt: Day(3)),
        };

        var ranked = Rank(listings);

        Assert.Equal([2, 3, 1], ranked.Select(l => l.Id));
    }

    [Fact]
    public void Ranking_TiedClaims_EarliestFirstClaimAtWinsTheHigherSpot()
    {
        var listings = new List<Listing>
        {
            NewListing(id: 1, claim: 100m, firstClaimAt: Day(5)),
            NewListing(id: 2, claim: 100m, firstClaimAt: Day(1)), // claimed first -> should rank above id 1
            NewListing(id: 3, claim: 100m, firstClaimAt: Day(3)),
        };

        var ranked = Rank(listings);

        Assert.Equal([2, 3, 1], ranked.Select(l => l.Id));
    }

    [Fact]
    public void Ranking_IsScopedPerCategory_NeverMixesOtherCategoriesIn()
    {
        var listings = new List<Listing>
        {
            NewListing(id: 1, claim: 1000m, firstClaimAt: Day(1), categoryId: 99), // higher claim, different category
            NewListing(id: 2, claim: 50m, firstClaimAt: Day(2), categoryId: 1),
            NewListing(id: 3, claim: 40m, firstClaimAt: Day(3), categoryId: 1),
        };

        var ranked = Rank(listings.Where(l => l.CategoryId == 1));

        Assert.Equal([2, 3], ranked.Select(l => l.Id));
    }

    [Fact]
    public void TodayRanking_DeductsPreviousCredits_AndOrdersByActualAmountPaidToday()
    {
        var today = Day(10);
        var yesterday = Day(9);

        // Listing 1: Placed 100 yesterday. Raised to 120 today.
        // Actual amount paid today = 120 - 100 = 20 (previous credits deducted).
        // Total all-time = 120.
        var listing1 = NewListing(id: 1, claim: 120m, firstClaimAt: yesterday);
        listing1.LastClaimAt = today;
        listing1.Claims = new List<Claim>
        {
            new() { Id = 1, ListingId = 1, Amount = 100m, PaymentAmount = 100m, CreatedAt = yesterday, PaymentReference = "ref-1" },
            new() { Id = 2, ListingId = 1, Amount = 120m, PaymentAmount = 20m, CreatedAt = today, PaymentReference = "ref-2" },
        };

        // Listing 2: Brand new today. Placed 50 today.
        // Actual amount paid today = 50.
        // Total all-time = 50.
        var listing2 = NewListing(id: 2, claim: 50m, firstClaimAt: today);
        listing2.LastClaimAt = today;
        listing2.Claims = new List<Claim>
        {
            new() { Id = 3, ListingId = 2, Amount = 50m, PaymentAmount = 50m, CreatedAt = today, PaymentReference = "ref-3" },
        };

        var listings = new List<Listing> { listing1, listing2 };

        // In All-Time mode: ordered by CurrentClaimAmount (accumulative of all payments)
        // Listing 1 (120) ranks above Listing 2 (50)
        var allTimeRanked = Rank(listings);
        Assert.Equal([1, 2], allTimeRanked.Select(l => l.Id));

        // In Today mode: ordered by actual amount paid today
        // Listing 2 paid 50 today -> Ranks #1 today
        // Listing 1 paid 20 today (after deducting previous 100 credit) -> Ranks #2 today
        var todayRanked = RankToday(listings, today);
        Assert.Equal([2, 1], todayRanked.Select(x => x.Listing.Id));
        Assert.Equal(50m, todayRanked[0].TodayPaidAmount);
        Assert.Equal(20m, todayRanked[1].TodayPaidAmount);
    }

    [Fact]
    public void TodayRanking_AccumulatesMultiplePaymentsDoneOnTheSameDay()
    {
        var today = Day(10);

        // Listing 1: Claimed 30 today (paid 30), then raised to 50 today (paid 20).
        // Total paid today = 50.
        var listing1 = NewListing(id: 1, claim: 50m, firstClaimAt: today);
        listing1.LastClaimAt = today.AddHours(2);
        listing1.Claims = new List<Claim>
        {
            new() { Id = 1, ListingId = 1, Amount = 30m, PaymentAmount = 30m, CreatedAt = today, PaymentReference = "ref-1" },
            new() { Id = 2, ListingId = 1, Amount = 50m, PaymentAmount = 20m, CreatedAt = today.AddHours(2), PaymentReference = "ref-2" },
        };

        // Listing 2: Claimed 45 today (paid 45).
        var listing2 = NewListing(id: 2, claim: 45m, firstClaimAt: today.AddHours(1));
        listing2.LastClaimAt = today.AddHours(1);
        listing2.Claims = new List<Claim>
        {
            new() { Id = 3, ListingId = 2, Amount = 45m, PaymentAmount = 45m, CreatedAt = today.AddHours(1), PaymentReference = "ref-3" },
        };

        var todayRanked = RankToday(new[] { listing2, listing1 }, today);

        // Listing 1 paid 50 total today, Listing 2 paid 45 total today
        Assert.Equal([1, 2], todayRanked.Select(x => x.Listing.Id));
        Assert.Equal(50m, todayRanked[0].TodayPaidAmount);
        Assert.Equal(45m, todayRanked[1].TodayPaidAmount);
    }

    private static List<Listing> Rank(IEnumerable<Listing> listings) =>
        listings
            .OrderByDescending(l => l.CurrentClaimAmount)
            .ThenBy(l => l.FirstClaimAt)
            .ToList();

    private static List<(Listing Listing, decimal TodayPaidAmount)> RankToday(IEnumerable<Listing> listings, DateTime todayUtc) =>
        listings
            .Where(l => l.LastClaimAt >= todayUtc)
            .Select(l => new
            {
                Listing = l,
                TodayPaidAmount = l.Claims
                    .Where(c => c.CreatedAt >= todayUtc)
                    .Sum(c => c.PaymentAmount > 0m ? c.PaymentAmount : c.Amount),
                TodayFirstClaimAt = l.Claims
                    .Where(c => c.CreatedAt >= todayUtc)
                    .Min(c => (DateTime?)c.CreatedAt) ?? l.FirstClaimAt
            })
            .OrderByDescending(x => x.TodayPaidAmount)
            .ThenBy(x => x.TodayFirstClaimAt)
            .Select(x => (x.Listing, x.TodayPaidAmount))
            .ToList();

    private static DateTime Day(int day) => new(2026, 1, day, 0, 0, 0, DateTimeKind.Utc);

    private static Listing NewListing(int id, decimal claim, DateTime firstClaimAt, int categoryId = 1) => new()
    {
        Id = id,
        CategoryId = categoryId,
        Name = $"Listing {id}",
        Url = $"https://example.com/{id}",
        OwnerContactEmail = $"owner{id}@example.com",
        CurrentClaimAmount = claim,
        FirstClaimAt = firstClaimAt,
        LastClaimAt = firstClaimAt,
    };
}
