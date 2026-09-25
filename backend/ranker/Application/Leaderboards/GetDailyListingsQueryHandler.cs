using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Common;
using Ranker.Data;
using Ranker.Dtos;

namespace Ranker.Application.Leaderboards;

public class GetDailyListingsQueryHandler(RankerDbContext dbContext)
    : IRequestHandler<GetDailyListingsQuery, PagedResult<DailyListingGroupDto>>
{
    public async Task<PagedResult<DailyListingGroupDto>> Handle(GetDailyListingsQuery request, CancellationToken ct)
    {
        var page = Math.Max(request.Page, 1);
        var pageSize = Math.Clamp(request.PageSize, 1, 30);

        var allDays = await dbContext.Listings
            .Select(l => l.FirstBidAt.Date)
            .Distinct()
            .OrderByDescending(d => d)
            .ToListAsync(ct);

        var pageDays = allDays.Skip((page - 1) * pageSize).Take(pageSize).ToList();

        var groups = new List<DailyListingGroupDto>(pageDays.Count);
        foreach (var day in pageDays)
        {
            var nextDay = day.AddDays(1);

            // Ranked strictly by bid amount within the day (mirrors the per-category leaderboard rule).
            var entries = await dbContext.Listings
                .AsNoTracking()
                .Where(l => l.FirstBidAt >= day && l.FirstBidAt < nextDay)
                .OrderByDescending(l => l.CurrentBidAmount)
                .ThenBy(l => l.FirstBidAt)
                .Select(l => new
                {
                    l.Id,
                    l.Name,
                    l.Url,
                    l.CurrentBidAmount,
                    l.FirstBidAt,
                    l.ClickCount,
                    l.SiteName,
                    l.LogoUrl,
                    l.FaviconUrl,
                    CategoryName = l.Category!.Name,
                    CategorySlug = l.Category!.Slug,
                })
                .ToListAsync(ct);

            var rankedEntries = entries
                .Select((e, index) => new DailyListingEntryDto(
                    index + 1,
                    e.Id,
                    e.Name,
                    e.Url,
                    e.CategoryName,
                    e.CategorySlug,
                    e.CurrentBidAmount,
                    e.FirstBidAt,
                    e.ClickCount,
                    e.SiteName,
                    e.LogoUrl,
                    e.FaviconUrl))
                .ToList();

            groups.Add(new DailyListingGroupDto(DateOnly.FromDateTime(day), rankedEntries.Count, rankedEntries));
        }

        return new PagedResult<DailyListingGroupDto>(groups, page, pageSize, allDays.Count);
    }
}
