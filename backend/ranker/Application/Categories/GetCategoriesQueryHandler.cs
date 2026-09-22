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

        // ActivityScore (rule E2): recency-weighted recent bid count. A bid today counts ~1.0, one from
        // 29 days ago counts ~1/30 - recent activity dominates without ignoring older bids entirely.
        // Materialized on its own (rather than left-joined against Categories in one query) because EF
        // Core can't translate that combination - a GroupBy/Sum aggregate correlated inside a LEFT JOIN.
        var activityScores = await dbContext.Bids
            .Where(b => b.CreatedAt >= cutoff)
            .GroupBy(b => b.Listing!.CategoryId)
            .Select(g => new
            {
                CategoryId = g.Key,
                Score = g.Sum(b => 1.0 / (1 + EF.Functions.DateDiffDay(b.CreatedAt, now))),
            })
            .ToListAsync(ct);

        var scoreByCategory = activityScores.ToDictionary(s => s.CategoryId, s => s.Score);

        var baseQuery = dbContext.Categories.Where(c => c.ParentCategoryId == parentCategoryId);

        var totalCount = await baseQuery.CountAsync(ct);

        var categories = await baseQuery
            .Select(c => new { Category = c, ListingCount = c.Listings.Count() })
            .ToListAsync(ct);

        var withScores = categories
            .Select(x => new
            {
                x.Category,
                x.ListingCount,
                Score = scoreByCategory.GetValueOrDefault(x.Category.Id),
            });

        var sorted = request.SortBy switch
        {
            CategorySortBy.Trending => withScores.OrderByDescending(x => x.Score).ThenBy(x => x.Category.Name),
            CategorySortBy.Alphabetical => withScores.OrderBy(x => x.Category.Name),
            // No CreatedAt column on Category; Id order is a stable proxy for insertion order.
            CategorySortBy.Newest => withScores.OrderByDescending(x => x.Category.Id),
            _ => withScores.OrderBy(x => x.Category.Name),
        };

        var items = sorted
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new CategoryDto(
                x.Category.Id,
                x.Category.Name,
                x.Category.Slug,
                x.Category.ParentCategoryId,
                x.Category.MinBidIncrement,
                x.Category.MinStartingBid,
                x.Score,
                x.ListingCount))
            .ToList();

        return new PagedResult<CategoryDto>(items, page, pageSize, totalCount);
    }
}
