using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Dtos;

namespace Ranker.Application.Claims;

public sealed record GetRecentClaimsQuery(int Limit = 10) : IRequest<IReadOnlyList<LiveClaimEventDto>>;

public class GetRecentClaimsQueryHandler(RankerDbContext dbContext)
    : IRequestHandler<GetRecentClaimsQuery, IReadOnlyList<LiveClaimEventDto>>
{
    public async Task<IReadOnlyList<LiveClaimEventDto>> Handle(GetRecentClaimsQuery request, CancellationToken ct)
    {
        var limit = Math.Clamp(request.Limit, 1, 50);
        var now = DateTime.UtcNow;

        var claims = await dbContext.Claims
            .AsNoTracking()
            .Include(c => c.Listing)
                .ThenInclude(l => l!.Category)
            .OrderByDescending(c => c.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

        var result = new List<LiveClaimEventDto>(claims.Count);
        foreach (var c in claims)
        {
            if (c.Listing == null) continue;

            var timeDiff = now - c.CreatedAt;
            string timeAgo;
            if (timeDiff.TotalMinutes < 1)
                timeAgo = "Just now";
            else if (timeDiff.TotalMinutes < 60)
                timeAgo = $"{(int)timeDiff.TotalMinutes}m ago";
            else if (timeDiff.TotalHours < 24)
                timeAgo = $"{(int)timeDiff.TotalHours}h ago";
            else
                timeAgo = $"{(int)timeDiff.TotalDays}d ago";

            var category = c.Listing.Category;
            var isTop = c.Listing.CurrentClaimAmount == c.Amount;
            var actionText = isTop
                ? $"recaptured #1 for ₹{c.Amount:0}"
                : $"updated claim to ₹{c.Amount:0}";
            var highlightText = isTop ? "Took Top Spot" : $"{category?.Name ?? "Active Claim"}";

            result.Add(new LiveClaimEventDto(
                c.Id,
                c.ListingId,
                c.Listing.Name,
                c.Listing.SiteName,
                category?.Name ?? string.Empty,
                category?.Slug ?? string.Empty,
                category?.Icon,
                c.Amount,
                c.CreatedAt,
                isTop,
                actionText,
                highlightText,
                timeAgo));
        }

        return result;
    }
}
