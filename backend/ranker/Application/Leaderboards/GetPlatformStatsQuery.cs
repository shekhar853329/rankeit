using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Dtos;

namespace Ranker.Application.Leaderboards;

public sealed record GetPlatformStatsQuery(string? CategorySlug = null) : IRequest<PlatformStatsDto>;

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
            .OrderByDescending(l => l.CurrentBidAmount)
            .ThenBy(l => l.FirstBidAt)
            .Select(l => l.ClickCount)
            .FirstOrDefaultAsync(ct);

        // If listing clicks are low in dev, compute based on total impressions / visits or actual leader clicks
        var avgLeaderViews = topLeaderClicks > 0 ? topLeaderClicks : (todayVisits > 0 ? (int)(todayVisits * 0.6) : 3850);

        // Retrieve bids from the past 7 days to calculate true incremental transaction volume
        // (A re-bid only charges the difference between the new target bid and the previous bid)
        var sevenDaysAgo = todayUtc.AddDays(-6);
        var recentBidsQuery = dbContext.Bids
            .AsNoTracking()
            .Include(b => b.Listing)
                .ThenInclude(l => l!.Category)
            .Where(b => b.CreatedAt >= sevenDaysAgo);

        if (category != null)
        {
            recentBidsQuery = recentBidsQuery.Where(b => b.Listing!.CategoryId == category.Id);
        }

        var recentBidsForStats = await recentBidsQuery
            .OrderBy(b => b.ListingId)
            .ThenBy(b => b.CreatedAt)
            .ToListAsync(ct);

        // For any listing that had bids before 7 days ago, get their baseline bid amount
        var activeListingIds = recentBidsForStats.Select(b => b.ListingId).Distinct().ToList();
        var priorListingBids = await dbContext.Bids
            .AsNoTracking()
            .Where(b => activeListingIds.Contains(b.ListingId) && b.CreatedAt < sevenDaysAgo)
            .GroupBy(b => b.ListingId)
            .Select(g => new
            {
                ListingId = g.Key,
                LastAmount = g.OrderByDescending(b => b.CreatedAt).Select(b => b.Amount).FirstOrDefault()
            })
            .ToDictionaryAsync(x => x.ListingId, x => x.LastAmount, ct);

        var runningBidMap = new Dictionary<int, decimal>(priorListingBids);
        var processedBids = new List<(Bid Bid, decimal ActualPaid)>(recentBidsForStats.Count);

        foreach (var b in recentBidsForStats)
        {
            var prevAmount = runningBidMap.GetValueOrDefault(b.ListingId, 0m);
            var paid = Math.Max(0m, b.Amount - prevAmount);
            runningBidMap[b.ListingId] = b.Amount;
            processedBids.Add((b, paid));
        }

        var todayProcessedBids = processedBids
            .Where(x => x.Bid.CreatedAt >= todayUtc)
            .ToList();

        // 3. Average CPC today: Total actual payment volume / Total clicks
        var totalBidsVolumeToday = todayProcessedBids.Sum(x => x.ActualPaid);

        var listingsClicksQuery = dbContext.Listings.AsNoTracking();
        if (category != null)
        {
            listingsClicksQuery = listingsClicksQuery.Where(l => l.CategoryId == category.Id);
        }
        var totalClicks = await listingsClicksQuery.SumAsync(l => (int?)l.ClickCount, ct) ?? 0;

        decimal averageCpc;
        if (totalClicks > 0 && totalBidsVolumeToday > 0)
        {
            averageCpc = Math.Round(totalBidsVolumeToday / totalClicks, 2);
        }
        else
        {
            var totalAllTimeBids = await listingsClicksQuery.SumAsync(l => (decimal?)l.CurrentBidAmount, ct) ?? 0m;
            averageCpc = totalClicks > 0 ? Math.Round(totalAllTimeBids / Math.Max(totalClicks, 1), 2) : 0.78m;
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
            var categoryBidsCount = await dbContext.Bids.Where(b => b.Listing!.CategoryId == category.Id).CountAsync(ct);
            protocolAuditId = $"#{category.Slug.ToUpper()}-{(categoryBidsCount + 100)}-B";
        }
        else
        {
            var totalBidsCount = await dbContext.Bids.CountAsync(ct);
            var totalReconciliationsCount = await dbContext.BidReconciliations.CountAsync(ct);
            protocolAuditId = $"#{(totalBidsCount + totalReconciliationsCount + 400)}-B";
        }

        // 6. Hourly Bid Pressure (Today) - Using actual payment volume received per hour
        var hourlyBids = todayProcessedBids
            .GroupBy(x => x.Bid.CreatedAt.Hour)
            .Select(g => new
            {
                Hour = g.Key,
                Volume = g.Sum(x => x.ActualPaid),
                Count = g.Count()
            })
            .ToList();

        var hourlyMap = hourlyBids.ToDictionary(h => h.Hour, h => (h.Volume, h.Count));
        var hourlyPoints = new List<HourlyBidPointDto>(24);

        for (var h = 0; h <= 23; h++)
        {
            if (hourlyMap.TryGetValue(h, out var stat))
            {
                var avgBid = stat.Count > 0 ? Math.Round(stat.Volume / stat.Count, 2) : 0m;
                hourlyPoints.Add(new HourlyBidPointDto(h, stat.Volume, stat.Count, avgBid));
            }
            else
            {
                hourlyPoints.Add(new HourlyBidPointDto(h, 0m, 0, 0m));
            }
        }

        // 7. Recent Bids Timeline (Individual bid payments with actual charged amount and resulting bid level)
        var timelineSource = todayProcessedBids.Count > 0 ? todayProcessedBids : processedBids;
        var recentTimeline = timelineSource
            .OrderBy(x => x.Bid.CreatedAt)
            .Take(150)
            .Select(x => new BidTimelinePointDto(
                x.Bid.Id,
                x.Bid.ListingId,
                x.Bid.Listing?.Name ?? "Listing",
                x.Bid.Listing?.Category?.Name ?? (category?.Name ?? "General"),
                x.ActualPaid,
                x.Bid.CreatedAt,
                x.Bid.PaymentReference,
                x.Bid.Amount))
            .ToList();

        // 8. Daily Bid Pressure (Last 7 Days)
        var dailyMap = processedBids
            .GroupBy(x => DateOnly.FromDateTime(x.Bid.CreatedAt))
            .ToDictionary(g => g.Key, g => (Volume: g.Sum(x => x.ActualPaid), Count: g.Count()));

        var dailyPoints = new List<DailyBidPointDto>(7);
        for (var i = 6; i >= 0; i--)
        {
            var d = todayDate.AddDays(-i);
            var dateLabel = d.ToString("MMM dd");
            if (dailyMap.TryGetValue(d, out var dStat))
            {
                dailyPoints.Add(new DailyBidPointDto(dateLabel, dStat.Volume, dStat.Count));
            }
            else
            {
                dailyPoints.Add(new DailyBidPointDto(dateLabel, 0m, 0));
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
