using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Common;
using Ranker.Data;
using Ranker.Dtos;
using Ranker.Repositories;

namespace Ranker.Application.Leaderboards;

public class GetCategoryLeaderboardQueryHandler(RankerDbContext dbContext, ICategoryRepository categoryRepository)
    : IRequestHandler<GetCategoryLeaderboardQuery, CategoryLeaderboardResponseDto?>
{
    public async Task<CategoryLeaderboardResponseDto?> Handle(GetCategoryLeaderboardQuery request, CancellationToken ct)
    {
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        var category = await categoryRepository.GetBySlugAsync(request.CategorySlug, ct);
        if (category is null)
        {
            return null;
        }

        var skip = (page - 1) * pageSize;

        // Ranked strictly by CurrentBidAmount DESC, FirstBidAt ASC (rule A1/A2). The (CategoryId,
        // CurrentBidAmount, FirstBidAt) index backs this ordering, and EF Core translates the
        // Skip/Take/CountAsync pair into a single indexed OFFSET/FETCH + COUNT round trip each.
        var query = dbContext.Listings
            .AsNoTracking()
            .Where(l => l.CategoryId == category.Id);

        if (request.TimeMode?.ToLowerInvariant() == "today")
        {
            var todayUtc = DateTime.UtcNow.Date;
            query = query.Where(l => l.LastBidAt >= todayUtc);
        }

        var ordered = query
            .OrderByDescending(l => l.CurrentBidAmount)
            .ThenBy(l => l.FirstBidAt);

        var totalCount = await ordered.CountAsync(ct);

        var pageItems = await ordered
            .Skip(skip)
            .Take(pageSize)
            .Select(l => new { l.Id, l.Name, l.Url, l.CurrentBidAmount, l.FirstBidAt, l.LastBidAt, l.ClickCount, BidCount = l.Bids.Count(), l.SiteName, l.LogoUrl, l.Description, l.FaviconUrl })
            .ToListAsync(ct);

        var entries = pageItems
            .Select((l, index) => new LeaderboardEntryDto(
                skip + index + 1,
                l.Id,
                l.Name,
                l.Url,
                l.CurrentBidAmount,
                l.FirstBidAt,
                l.LastBidAt,
                l.ClickCount,
                l.BidCount,
                l.SiteName,
                l.LogoUrl,
                l.Description,
                l.FaviconUrl))
            .ToList();

        var leaderboard = new PagedResult<LeaderboardEntryDto>(entries, page, pageSize, totalCount);
        return new CategoryLeaderboardResponseDto(category.Id, category.Name, category.Slug, category.Icon, category.MinBidIncrement, category.MinStartingBid, leaderboard);
    }
}
