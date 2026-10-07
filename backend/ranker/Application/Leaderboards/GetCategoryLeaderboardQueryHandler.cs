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

        var isToday = string.Equals(request.TimeMode, "today", StringComparison.OrdinalIgnoreCase);

        if (isToday)
        {
            var todayUtc = DateTime.UtcNow.Date;
            var todayQuery = dbContext.Listings
                .AsNoTracking()
                .Where(l => l.CategoryId == category.Id && l.LastClaimAt >= todayUtc);

            if (!string.IsNullOrWhiteSpace(request.Query))
            {
                var search = request.Query.Trim();
                todayQuery = todayQuery.Where(l =>
                    EF.Functions.Like(l.Name, $"%{search}%") ||
                    (l.SiteName != null && EF.Functions.Like(l.SiteName, $"%{search}%")) ||
                    (l.Description != null && EF.Functions.Like(l.Description, $"%{search}%")));
            }

            // In today mode, compute the actual payment amount charged today (taking credit deduction into account).
            var projected = todayQuery.Select(l => new
            {
                l.Id,
                l.Name,
                l.Url,
                TodayPaidAmount = l.Claims
                    .Where(c => c.CreatedAt >= todayUtc)
                    .Sum(c => (decimal?)(c.PaymentAmount > 0m ? c.PaymentAmount : c.Amount)) ?? 0m,
                TodayFirstClaimAt = l.Claims
                    .Where(c => c.CreatedAt >= todayUtc)
                    .Min(c => (DateTime?)c.CreatedAt) ?? l.FirstClaimAt,
                l.FirstClaimAt,
                l.LastClaimAt,
                l.ClickCount,
                ClaimCount = l.Claims.Count(),
                l.SiteName,
                l.LogoUrl,
                l.Description,
                l.FaviconUrl
            });

            var ordered = projected
                .OrderByDescending(x => x.TodayPaidAmount)
                .ThenBy(x => x.TodayFirstClaimAt);

            var totalCount = await ordered.CountAsync(ct);

            var pageItems = await ordered
                .Skip(skip)
                .Take(pageSize)
                .ToListAsync(ct);

            var entries = pageItems
                .Select((l, index) => new LeaderboardEntryDto(
                    skip + index + 1,
                    l.Id,
                    l.Name,
                    l.Url,
                    l.TodayPaidAmount,
                    l.FirstClaimAt,
                    l.LastClaimAt,
                    l.ClickCount,
                    l.ClaimCount,
                    l.SiteName,
                    l.LogoUrl,
                    l.Description,
                    l.FaviconUrl))
                .ToList();

            var leaderboard = new PagedResult<LeaderboardEntryDto>(entries, page, pageSize, totalCount);
            return new CategoryLeaderboardResponseDto(category.Id, category.Name, category.Slug, category.Icon, category.MinClaimIncrement, category.MinStartingClaim, leaderboard);
        }
        else
        {
            // Ranked strictly by CurrentClaimAmount DESC, FirstClaimAt ASC (rule A1/A2). The (CategoryId,
            // CurrentClaimAmount, FirstClaimAt) index backs this ordering.
            var query = dbContext.Listings
                .AsNoTracking()
                .Where(l => l.CategoryId == category.Id);

            if (!string.IsNullOrWhiteSpace(request.Query))
            {
                var search = request.Query.Trim();
                query = query.Where(l =>
                    EF.Functions.Like(l.Name, $"%{search}%") ||
                    (l.SiteName != null && EF.Functions.Like(l.SiteName, $"%{search}%")) ||
                    (l.Description != null && EF.Functions.Like(l.Description, $"%{search}%")));
            }

            var ordered = query
                .OrderByDescending(l => l.CurrentClaimAmount)
                .ThenBy(l => l.FirstClaimAt);

            var totalCount = await ordered.CountAsync(ct);

            var pageItems = await ordered
                .Skip(skip)
                .Take(pageSize)
                .Select(l => new { l.Id, l.Name, l.Url, l.CurrentClaimAmount, l.FirstClaimAt, l.LastClaimAt, l.ClickCount, ClaimCount = l.Claims.Count(), l.SiteName, l.LogoUrl, l.Description, l.FaviconUrl })
                .ToListAsync(ct);

            var entries = pageItems
                .Select((l, index) => new LeaderboardEntryDto(
                    skip + index + 1,
                    l.Id,
                    l.Name,
                    l.Url,
                    l.CurrentClaimAmount,
                    l.FirstClaimAt,
                    l.LastClaimAt,
                    l.ClickCount,
                    l.ClaimCount,
                    l.SiteName,
                    l.LogoUrl,
                    l.Description,
                    l.FaviconUrl))
                .ToList();

            var leaderboard = new PagedResult<LeaderboardEntryDto>(entries, page, pageSize, totalCount);
            return new CategoryLeaderboardResponseDto(category.Id, category.Name, category.Slug, category.Icon, category.MinClaimIncrement, category.MinStartingClaim, leaderboard);
        }
    }
}
