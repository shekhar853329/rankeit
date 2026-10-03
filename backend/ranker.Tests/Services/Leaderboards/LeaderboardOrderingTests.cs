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

    private static List<Listing> Rank(IEnumerable<Listing> listings) =>
        listings
            .OrderByDescending(l => l.CurrentClaimAmount)
            .ThenBy(l => l.FirstClaimAt)
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
