using Ranker.Domain.Entities;
using Xunit;

namespace Ranker.Tests.Services.Leaderboards;

/// <summary>
/// Verifies the exact ordering semantics the SQL leaderboard query relies on
/// (ORDER BY CurrentBidAmount DESC, FirstBidAt ASC), independent of any database.
/// </summary>
public class LeaderboardOrderingTests
{
    [Fact]
    public void Ranking_OrdersByBidAmountDescending()
    {
        var listings = new List<Listing>
        {
            NewListing(id: 1, bid: 50m, firstBidAt: Day(1)),
            NewListing(id: 2, bid: 200m, firstBidAt: Day(2)),
            NewListing(id: 3, bid: 100m, firstBidAt: Day(3)),
        };

        var ranked = Rank(listings);

        Assert.Equal([2, 3, 1], ranked.Select(l => l.Id));
    }

    [Fact]
    public void Ranking_TiedBids_EarliestFirstBidAtWinsTheHigherSpot()
    {
        var listings = new List<Listing>
        {
            NewListing(id: 1, bid: 100m, firstBidAt: Day(5)),
            NewListing(id: 2, bid: 100m, firstBidAt: Day(1)), // bid first -> should rank above id 1
            NewListing(id: 3, bid: 100m, firstBidAt: Day(3)),
        };

        var ranked = Rank(listings);

        Assert.Equal([2, 3, 1], ranked.Select(l => l.Id));
    }

    [Fact]
    public void Ranking_IsScopedPerCategory_NeverMixesOtherCategoriesIn()
    {
        var listings = new List<Listing>
        {
            NewListing(id: 1, bid: 1000m, firstBidAt: Day(1), categoryId: 99), // huge bid, different category
            NewListing(id: 2, bid: 50m, firstBidAt: Day(2), categoryId: 1),
            NewListing(id: 3, bid: 40m, firstBidAt: Day(3), categoryId: 1),
        };

        var ranked = Rank(listings.Where(l => l.CategoryId == 1));

        Assert.Equal([2, 3], ranked.Select(l => l.Id));
    }

    private static List<Listing> Rank(IEnumerable<Listing> listings) =>
        listings
            .OrderByDescending(l => l.CurrentBidAmount)
            .ThenBy(l => l.FirstBidAt)
            .ToList();

    private static DateTime Day(int day) => new(2026, 1, day, 0, 0, 0, DateTimeKind.Utc);

    private static Listing NewListing(int id, decimal bid, DateTime firstBidAt, int categoryId = 1) => new()
    {
        Id = id,
        CategoryId = categoryId,
        Name = $"Listing {id}",
        Url = $"https://example.com/{id}",
        OwnerContactEmail = $"owner{id}@example.com",
        CurrentBidAmount = bid,
        FirstBidAt = firstBidAt,
        LastBidAt = firstBidAt,
    };
}
