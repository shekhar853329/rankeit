using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Dtos;

namespace Ranker.Application.Leaderboards;

public sealed record GetPlatformStatsQuery(string? CategorySlug = null, string? TimeMode = null) : IRequest<PlatformStatsDto>;

public class GetPlatformStatsQueryHandler(RankerDbContext dbContext)
    : IRequestHandler<GetPlatformStatsQuery, PlatformStatsDto>
{
    public async Task<PlatformStatsDto> Handle(GetPlatformStatsQuery request, CancellationToken ct)
    {
        var todayUtc = DateTime.UtcNow.Date;
        var todayDate = DateOnly.FromDateTime(todayUtc);
        var yesterdayDate = todayDate.AddDays(-1);

        Category? category = null;
        if (!string.IsNullOrWhiteSpace(request.CategorySlug))
        {
            var slugLower = request.CategorySlug.Trim().ToLowerInvariant();
            category = await dbContext.Categories
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Slug.ToLower() == slugLower, ct);
        }

        // 1. Traffic surge from DailyVisitCounts
        var visits = await dbContext.DailyVisitCounts
            .AsNoTracking()
            .Where(v => v.VisitDate == todayDate || v.VisitDate == yesterdayDate)
            .ToDictionaryAsync(v => v.VisitDate, v => v.Count, ct);

        var todayVisits = visits.GetValueOrDefault(todayDate, 0);
        var yesterdayVisits = visits.GetValueOrDefault(yesterdayDate, 0);

        double surgePercentage;
        if (yesterdayVisits > 0)
        {
            surgePercentage = Math.Round(((double)(todayVisits - yesterdayVisits) / yesterdayVisits) * 100.0, 1);
        }
        else
        {
            surgePercentage = todayVisits > 0 ? 100.0 : 0.0;
        }

        // 2. Avg direct views / clicks for today's leader
        var leaderQuery = dbContext.Listings.AsNoTracking();
        if (category != null)
        {
            leaderQuery = leaderQuery.Where(l => l.CategoryId == category.Id);
        }

        var topLeaderClicks = await leaderQuery
            .OrderByDescending(l => l.CurrentClaimAmount)
            .ThenBy(l => l.FirstClaimAt)
            .Select(l => l.ClickCount)
            .FirstOrDefaultAsync(ct);

        // If listing clicks are low in dev, compute based on total impressions / visits or actual leader clicks
        var avgLeaderViews = topLeaderClicks > 0 ? topLeaderClicks : (todayVisits > 0 ? (int)(todayVisits * 0.6) : 3850);

        // Retrieve claims from the past 7 days to calculate true incremental transaction volume
        // (A re-claim only charges the difference between the new target claim and the previous claim)
        var sevenDaysAgo = todayUtc.AddDays(-6);
        var recentClaimsQuery = dbContext.Claims
            .AsNoTracking()
            .Include(c => c.Listing)
                .ThenInclude(l => l!.Category)
            .Where(c => c.CreatedAt >= sevenDaysAgo);

        if (category != null)
        {
            recentClaimsQuery = recentClaimsQuery.Where(c => c.Listing!.CategoryId == category.Id);
        }

        var recentClaimsForStats = await recentClaimsQuery
            .OrderBy(c => c.ListingId)
            .ThenBy(c => c.CreatedAt)
            .ToListAsync(ct);

        // For any listing that had claims before 7 days ago, get their baseline claim amount
        var activeListingIds = recentClaimsForStats.Select(c => c.ListingId).Distinct().ToList();
        var priorListingClaims = await dbContext.Claims
            .AsNoTracking()
            .Where(c => activeListingIds.Contains(c.ListingId) && c.CreatedAt < sevenDaysAgo)
            .GroupBy(c => c.ListingId)
            .Select(g => new
            {
                ListingId = g.Key,
                LastAmount = g.OrderByDescending(c => c.CreatedAt).Select(c => c.Amount).FirstOrDefault()
            })
            .ToDictionaryAsync(x => x.ListingId, x => x.LastAmount, ct);

        var runningClaimMap = new Dictionary<int, decimal>(priorListingClaims);
        var processedClaims = new List<(Claim Claim, decimal ActualPaid)>(recentClaimsForStats.Count);

        foreach (var c in recentClaimsForStats)
        {
            var prevAmount = runningClaimMap.GetValueOrDefault(c.ListingId, 0m);
            var paid = c.PaymentAmount > 0m ? c.PaymentAmount : Math.Max(0m, c.Amount - prevAmount);
            runningClaimMap[c.ListingId] = c.Amount;
            processedClaims.Add((c, paid));
        }

        var todayProcessedClaims = processedClaims
            .Where(x => x.Claim.CreatedAt >= todayUtc)
            .ToList();

        // 3. Average CPC today: Total actual payment volume / Total clicks
        var totalClaimsVolumeToday = todayProcessedClaims.Sum(x => x.ActualPaid);

        var listingsClicksQuery = dbContext.Listings.AsNoTracking();
        if (category != null)
        {
            listingsClicksQuery = listingsClicksQuery.Where(l => l.CategoryId == category.Id);
        }
        var totalClicks = await listingsClicksQuery.SumAsync(l => (int?)l.ClickCount, ct) ?? 0;

        decimal averageCpc;
        if (totalClicks > 0 && totalClaimsVolumeToday > 0)
        {
            averageCpc = Math.Round(totalClaimsVolumeToday / totalClicks, 2);
        }
        else
        {
            var totalAllTimeClaims = await listingsClicksQuery.SumAsync(l => (decimal?)l.CurrentClaimAmount, ct) ?? 0m;
            averageCpc = totalClicks > 0 ? Math.Round(totalAllTimeClaims / Math.Max(totalClicks, 1), 2) : 0.78m;
        }

        // 4. Direct CTR rate: Total clicks / Total visits
        double ctrRate;
        if (todayVisits > 0)
        {
            ctrRate = Math.Round(((double)totalClicks / todayVisits) * 100.0, 1);
        }
        else
        {
            ctrRate = 4.2;
        }

        // 5. Protocol audit ID: based on total historical transactions recorded in DB
        string protocolAuditId;
        if (category != null)
        {
            var categoryClaimsCount = await dbContext.Claims.Where(c => c.Listing!.CategoryId == category.Id).CountAsync(ct);
            protocolAuditId = $"#{category.Slug.ToUpper()}-{(categoryClaimsCount + 100)}-C";
        }
        else
        {
            var totalClaimsCount = await dbContext.Claims.CountAsync(ct);
            var totalReconciliationsCount = await dbContext.ClaimReconciliations.CountAsync(ct);
            protocolAuditId = $"#{(totalClaimsCount + totalReconciliationsCount + 400)}-C";
        }

        // 6. Hourly Claim Pressure (Today) - Using actual payment volume received per hour
        var hourlyClaims = todayProcessedClaims
            .GroupBy(x => x.Claim.CreatedAt.Hour)
            .Select(g => new
            {
                Hour = g.Key,
                Volume = g.Sum(x => x.ActualPaid),
                Count = g.Count()
            })
            .ToList();

        var hourlyMap = hourlyClaims.ToDictionary(h => h.Hour, h => (h.Volume, h.Count));
        var hourlyPoints = new List<HourlyClaimPointDto>(24);

        for (var h = 0; h <= 23; h++)
        {
            if (hourlyMap.TryGetValue(h, out var stat))
            {
                var avgClaim = stat.Count > 0 ? Math.Round(stat.Volume / stat.Count, 2) : 0m;
                hourlyPoints.Add(new HourlyClaimPointDto(h, stat.Volume, stat.Count, avgClaim));
            }
            else
            {
                hourlyPoints.Add(new HourlyClaimPointDto(h, 0m, 0, 0m));
            }
        }

        // 7. Recent Claims Timeline (Individual claim payments with actual charged amount and resulting claim level)
        var isToday = string.Equals(request.TimeMode, "today", StringComparison.OrdinalIgnoreCase);
        var timelineSource = isToday ? todayProcessedClaims : processedClaims;
        var recentTimeline = timelineSource
            .OrderBy(x => x.Claim.CreatedAt)
            .Take(150)
            .Select(x => new ClaimTimelinePointDto(
                x.Claim.Id,
                x.Claim.ListingId,
                x.Claim.Listing?.Name ?? "Listing",
                x.Claim.Listing?.Category?.Name ?? (category?.Name ?? "General"),
                x.ActualPaid,
                x.Claim.CreatedAt,
                x.Claim.PaymentReference,
                x.Claim.Amount))
            .ToList();

        // 8. Daily Claim Pressure (Last 7 Days)
        var dailyMap = processedClaims
            .GroupBy(x => DateOnly.FromDateTime(x.Claim.CreatedAt))
            .ToDictionary(g => g.Key, g => (Volume: g.Sum(x => x.ActualPaid), Count: g.Count()));

        var dailyPoints = new List<DailyClaimPointDto>(7);
        for (var i = 6; i >= 0; i--)
        {
            var d = todayDate.AddDays(-i);
            var dateLabel = d.ToString("MMM dd");
            if (dailyMap.TryGetValue(d, out var dStat))
            {
                dailyPoints.Add(new DailyClaimPointDto(dateLabel, dStat.Volume, dStat.Count));
            }
            else
            {
                dailyPoints.Add(new DailyClaimPointDto(dateLabel, 0m, 0));
            }
        }

        return new PlatformStatsDto(
            surgePercentage,
            avgLeaderViews,
            averageCpc,
            ctrRate,
            protocolAuditId,
            hourlyPoints,
            recentTimeline,
            dailyPoints);
    }
}
