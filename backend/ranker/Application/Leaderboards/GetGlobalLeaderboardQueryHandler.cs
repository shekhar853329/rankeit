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
        // Global leaderboard: rank listings by their total amount paid (CurrentBidAmount) across
        // all categories — no normalization, highest payer wins regardless of category.
        var results = await dbContext.Listings
            .AsNoTracking()
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
                l.CategoryId,
                Category = dbContext.Categories
                    .Where(c => c.Id == l.CategoryId)
                    .Select(c => new { c.Name, c.Slug })
                    .FirstOrDefault()
            })
            .ToListAsync(ct);

        return results
            .Select((x, i) => new GlobalLeaderboardEntryDto(
                i + 1,
                x.CategoryId,
                x.Category != null ? x.Category.Name : string.Empty,
                x.Category != null ? x.Category.Slug : string.Empty,
                x.Id,
                x.Name,
                x.Url,
                x.CurrentBidAmount,
                x.CurrentBidAmount,   // score = raw bid amount
                x.ClickCount))
            .ToList();
    }
}
