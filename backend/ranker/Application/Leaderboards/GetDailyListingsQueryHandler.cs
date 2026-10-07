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
            .Select(l => l.FirstClaimAt.Date)
            .Distinct()
            .OrderByDescending(d => d)
            .ToListAsync(ct);

        var pageDays = allDays.Skip((page - 1) * pageSize).Take(pageSize).ToList();

        var groups = new List<DailyListingGroupDto>(pageDays.Count);
        foreach (var day in pageDays)
        {
            var nextDay = day.AddDays(1);

            // Ranked strictly by claim amount paid within the day (mirrors the per-category leaderboard rule).
            var entries = await dbContext.Listings
                .AsNoTracking()
                .Where(l => l.FirstClaimAt >= day && l.FirstClaimAt < nextDay)
                .Select(l => new
                {
                    l.Id,
                    l.Name,
                    l.Url,
                    PaidOnDay = l.Claims
                        .Where(c => c.CreatedAt >= day && c.CreatedAt < nextDay)
                        .Sum(c => (decimal?)(c.PaymentAmount > 0m ? c.PaymentAmount : c.Amount)) ?? l.CurrentClaimAmount,
                    l.FirstClaimAt,
                    l.ClickCount,
                    l.SiteName,
                    l.LogoUrl,
                    l.FaviconUrl,
                    CategoryName = l.Category!.Name,
                    CategorySlug = l.Category!.Slug,
                })
                .OrderByDescending(l => l.PaidOnDay)
                .ThenBy(l => l.FirstClaimAt)
                .ToListAsync(ct);

            var rankedEntries = entries
                .Select((e, index) => new DailyListingEntryDto(
                    index + 1,
                    e.Id,
                    e.Name,
                    e.Url,
                    e.CategoryName,
                    e.CategorySlug,
                    e.PaidOnDay,
                    e.FirstClaimAt,
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
