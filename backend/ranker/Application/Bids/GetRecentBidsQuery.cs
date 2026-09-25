using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Dtos;

namespace Ranker.Application.Bids;

public sealed record GetRecentBidsQuery(int Limit = 10) : IRequest<IReadOnlyList<LiveBidEventDto>>;

public class GetRecentBidsQueryHandler(RankerDbContext dbContext)
    : IRequestHandler<GetRecentBidsQuery, IReadOnlyList<LiveBidEventDto>>
{
    public async Task<IReadOnlyList<LiveBidEventDto>> Handle(GetRecentBidsQuery request, CancellationToken ct)
    {
        var limit = Math.Clamp(request.Limit, 1, 50);
        var now = DateTime.UtcNow;

        var bids = await dbContext.Bids
            .AsNoTracking()
            .Include(b => b.Listing)
                .ThenInclude(l => l!.Category)
            .OrderByDescending(b => b.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

        var result = new List<LiveBidEventDto>(bids.Count);
        foreach (var b in bids)
        {
            if (b.Listing == null) continue;

            var timeDiff = now - b.CreatedAt;
            string timeAgo;
            if (timeDiff.TotalMinutes < 1)
                timeAgo = "Just now";
            else if (timeDiff.TotalMinutes < 60)
                timeAgo = $"{(int)timeDiff.TotalMinutes}m ago";
            else if (timeDiff.TotalHours < 24)
                timeAgo = $"{(int)timeDiff.TotalHours}h ago";
            else
                timeAgo = $"{(int)timeDiff.TotalDays}d ago";

            var category = b.Listing.Category;
            var isTop = b.Listing.CurrentBidAmount == b.Amount;
            var actionText = isTop
                ? $"recaptured #1 for ${b.Amount:0}"
                : $"bumped bid to ${b.Amount:0}";
            var highlightText = isTop ? "Took Top Spot" : $"{category?.Name ?? "Active Bid"}";

            result.Add(new LiveBidEventDto(
                b.Id,
                b.ListingId,
                b.Listing.Name,
                b.Listing.SiteName,
                category?.Name ?? string.Empty,
                category?.Slug ?? string.Empty,
                category?.Icon,
                b.Amount,
                b.CreatedAt,
                isTop,
                actionText,
                highlightText,
                timeAgo));
        }

        return result;
    }
}
