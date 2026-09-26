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
        var timeMode = request.TimeMode?.ToLowerInvariant() == "alltime" ? "alltime" : "today";
        return cache.GetOrCreateAsync(topN, timeMode, () => ComputeAsync(topN, timeMode, ct));
    }

    private async Task<IReadOnlyList<GlobalLeaderboardEntryDto>> ComputeAsync(int topN, string timeMode, CancellationToken ct)
    {
        var query = dbContext.Listings.AsNoTracking();

        if (timeMode == "today")
        {
            var todayUtc = DateTime.UtcNow.Date;
            query = query.Where(l => l.LastBidAt >= todayUtc);
        }

        var results = await query
            .OrderByDescending(l => l.CurrentBidAmount)
            .ThenBy(l => l.FirstBidAt)
            .Take(topN)
            .Select(l => new
            {
                l.Id,
                l.Name,
                l.Url,
                l.CurrentBidAmount,
                l.ClickCount,
                BidCount = l.Bids.Count(),
                l.CategoryId,
                l.SiteName,
                l.LogoUrl,
                l.Description,
                l.FaviconUrl,
                Category = dbContext.Categories
                    .Where(c => c.Id == l.CategoryId)
                    .Select(c => new { c.Name, c.Slug, c.Icon })
                    .FirstOrDefault()
            })
            .ToListAsync(ct);

        return results
            .Select((x, i) => new GlobalLeaderboardEntryDto(
                i + 1,
                x.CategoryId,
                x.Category != null ? x.Category.Name : string.Empty,
                x.Category != null ? x.Category.Slug : string.Empty,
                x.Category?.Icon,
                x.Id,
                x.Name,
                x.Url,
                x.CurrentBidAmount,
                x.CurrentBidAmount,
                x.ClickCount,
                x.BidCount,
                x.SiteName,
                x.LogoUrl,
                x.Description,
                x.FaviconUrl))
            .ToList();
    }
}
