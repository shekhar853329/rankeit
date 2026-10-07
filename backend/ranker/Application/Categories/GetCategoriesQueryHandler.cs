using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Common;
using Ranker.Data;
using Ranker.Dtos;

namespace Ranker.Application.Categories;

public class GetCategoriesQueryHandler(RankerDbContext dbContext) : IRequestHandler<GetCategoriesQuery, PagedResult<CategoryDto>>
{
    private const int TrendingWindowDays = 30;

    public async Task<PagedResult<CategoryDto>> Handle(GetCategoriesQuery request, CancellationToken ct)
    {
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        int? parentCategoryId = null;
        if (request.ParentSlug is not null)
        {
            parentCategoryId = await dbContext.Categories
                .Where(c => c.Slug == request.ParentSlug)
                .Select(c => (int?)c.Id)
                .FirstOrDefaultAsync(ct);

            if (parentCategoryId is null)
            {
                return new PagedResult<CategoryDto>([], page, pageSize, 0);
            }
        }

        var cutoff = DateTime.UtcNow.AddDays(-TrendingWindowDays);
        var now = DateTime.UtcNow;

        // ActivityScore (rule E2): recency-weighted recent claim count. A claim today counts ~1.0, one from
        // 29 days ago counts ~1/30 - recent activity dominates without ignoring older claims entirely.
        // RecentClaimCount is the plain count of claims in the same window, for a human-readable "N claims".
        // Materialized on its own (rather than left-joined against Categories in one query) because EF
        // Core can't translate that combination - a GroupBy/Sum aggregate correlated inside a LEFT JOIN.
        var activityScores = await dbContext.Claims
            .Where(c => c.CreatedAt >= cutoff)
            .Select(c => new { c.Listing!.CategoryId, c.CreatedAt })
            .ToListAsync(ct);

        // Recency-weighted score: computed in memory to keep it provider-agnostic
        var statsByCategory = activityScores
            .GroupBy(c => c.CategoryId)
            .ToDictionary(
                g => g.Key,
                g => (
                    Score: g.Sum(c => 1.0 / (1 + (now - c.CreatedAt).TotalDays)),
                    Count: g.Count()
                ));

        var baseQuery = dbContext.Categories.Where(c => c.ParentCategoryId == parentCategoryId);

        var totalCount = await baseQuery.CountAsync(ct);

        var categories = await baseQuery
            .Select(c => new { Category = c, ListingCount = c.Listings.Count() })
            .ToListAsync(ct);

        var withScores = categories
            .Select(x =>
            {
                statsByCategory.TryGetValue(x.Category.Id, out var stats);
                return new
                {
                    x.Category,
                    x.ListingCount,
                    Score = stats.Score,
                    RecentClaimCount = stats.Count,
                };
            });

        var sorted = request.SortBy switch
        {
            CategorySortBy.Trending => withScores.OrderByDescending(x => x.Score).ThenBy(x => x.Category.Name),
            CategorySortBy.Alphabetical => withScores.OrderBy(x => x.Category.Name),
            // No CreatedAt column on Category; Id order is a stable proxy for insertion order.
            CategorySortBy.Newest => withScores.OrderByDescending(x => x.Category.Id),
            _ => withScores.OrderBy(x => x.Category.Name),
        };

        var todayUtc = DateTime.UtcNow.Date;
        var todayCounts = await dbContext.Listings
            .Where(l => l.LastClaimAt >= todayUtc)
            .GroupBy(l => l.CategoryId)
            .Select(g => new { CategoryId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.CategoryId, g => g.Count, ct);

        var maxClaims = await dbContext.Listings
            .GroupBy(l => l.CategoryId)
            .Select(g => new { CategoryId = g.Key, MaxAmount = g.Max(l => l.CurrentClaimAmount) })
            .ToDictionaryAsync(g => g.CategoryId, g => g.MaxAmount, ct);

        var items = sorted
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new CategoryDto(
                x.Category.Id,
                x.Category.Name,
                x.Category.Slug,
                x.Category.Icon,
                x.Category.ParentCategoryId,
                x.Category.MinClaimIncrement,
                x.Category.MinStartingClaim,
                x.Score,
                x.RecentClaimCount,
                x.ListingCount,
                todayCounts.GetValueOrDefault(x.Category.Id, 0),
                maxClaims.GetValueOrDefault(x.Category.Id, 0m)))
            .ToList();

        return new PagedResult<CategoryDto>(items, page, pageSize, totalCount);
    }
}
