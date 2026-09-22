using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Dtos;
using Ranker.Services.Leaderboards;

namespace Ranker.Application.Leaderboards;

public class GetGlobalLeaderboardQueryHandler(RankerDbContext dbContext, GlobalLeaderboardCache cache)
    : IRequestHandler<GetGlobalLeaderboardQuery, IReadOnlyList<GlobalLeaderboardEntryDto>>
{
    public Task<IReadOnlyList<GlobalLeaderboardEntryDto>> Handle(GetGlobalLeaderboardQuery request, CancellationToken ct)
    {
        var topN = Math.Clamp(request.TopN, 1, 500);
        return cache.GetOrCreateAsync(topN, () => ComputeAsync(topN, ct));
    }

    private async Task<IReadOnlyList<GlobalLeaderboardEntryDto>> ComputeAsync(int topN, CancellationToken ct)
    {
        // This is a cached read model (rule C3), only recomputed when a BidPlaced event changes a
        // category's #1, so pulling each category's listings into memory here is an acceptable trade-off
        // for keeping the ranking/normalization logic in plain EF Core LINQ instead of raw SQL.
        var listings = await dbContext.Listings
            .AsNoTracking()
            .Select(l => new { l.Id, l.Name, l.Url, l.CurrentBidAmount, l.FirstBidAt, l.CategoryId })
            .ToListAsync(ct);

        var categories = await dbContext.Categories
            .AsNoTracking()
            .Select(c => new { c.Id, c.Name, c.Slug })
            .ToListAsync(ct);

        var categoryLookup = categories.ToDictionary(c => c.Id);

        var candidates = listings
            .GroupBy(l => l.CategoryId)
            .Select(g =>
            {
                // Rule A1/A2 ordering within the category: highest bid first, earliest bidder breaks ties.
                var ranked = g.OrderByDescending(l => l.CurrentBidAmount).ThenBy(l => l.FirstBidAt).ToList();
                var top1 = ranked[0];
                var secondPlaceBid = ranked.Count > 1 ? ranked[1].CurrentBidAmount : (decimal?)null;
                var avgBid = g.Average(l => l.CurrentBidAmount);
                var category = categoryLookup[g.Key];

                // Rule C2: normalize against the category's own price tier so high-bid verticals (e.g. Real
                // Estate) don't automatically dominate lower-price ones (e.g. Freelancers).
                var normalizedScore = secondPlaceBid is > 0
                    ? top1.CurrentBidAmount / secondPlaceBid.Value
                    : avgBid > 0
                        ? top1.CurrentBidAmount / avgBid
                        : 1m;

                return new
                {
                    category.Id,
                    category.Name,
                    category.Slug,
                    Listing = top1,
                    NormalizedScore = normalizedScore,
                };
            })
            .OrderByDescending(x => x.NormalizedScore)
            .Take(topN)
            .Select((x, i) => new GlobalLeaderboardEntryDto(
                i + 1,
                x.Id,
                x.Name,
                x.Slug,
                x.Listing.Id,
                x.Listing.Name,
                x.Listing.Url,
                x.Listing.CurrentBidAmount,
                x.NormalizedScore))
            .ToList();

        return candidates;
    }
}
