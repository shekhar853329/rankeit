using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;

namespace Ranker.Application.Badges;

public class GetBadgeDataQueryHandler(RankerDbContext dbContext)
    : IRequestHandler<GetBadgeDataQuery, BadgeDataResult?>
{
    public async Task<BadgeDataResult?> Handle(GetBadgeDataQuery request, CancellationToken ct)
    {
        var slugLower = request.Slug.Trim().ToLowerInvariant();

        // Fetch all ranked listings for slug matching + rank computations
        var allListings = await dbContext.Listings
            .AsNoTracking()
            .Include(l => l.Category)
            .Where(l => l.CurrentClaimAmount > 0)
            .Select(l => new
            {
                l.Id,
                l.Name,
                l.Url,
                l.CategoryId,
                CategoryName = l.Category != null ? l.Category.Name : null,
                l.CurrentClaimAmount,
                l.FirstClaimAt,
                l.SiteName,
                l.BadgeVerified
            })
            .ToListAsync(ct);

        var listing = allListings.FirstOrDefault(l => SlugifyUrl(l.Url) == slugLower);
        if (listing is null)
            return null;

        // Category rank: ordered by CurrentClaimAmount desc, FirstClaimAt asc within category
        var categoryRank = allListings
            .Where(l => l.CategoryId == listing.CategoryId)
            .Count(l => l.CurrentClaimAmount > listing.CurrentClaimAmount
                || (l.CurrentClaimAmount == listing.CurrentClaimAmount && l.FirstClaimAt < listing.FirstClaimAt)) + 1;

        // Global all-time rank: ordered by CurrentClaimAmount desc, FirstClaimAt asc across all
        var globalRank = allListings
            .Count(l => l.CurrentClaimAmount > listing.CurrentClaimAmount
                || (l.CurrentClaimAmount == listing.CurrentClaimAmount && l.FirstClaimAt < listing.FirstClaimAt)) + 1;

        var displayName = listing.SiteName ?? listing.Name;

        return new BadgeDataResult(displayName, categoryRank, globalRank, listing.CategoryName, listing.BadgeVerified);
    }

    internal static string SlugifyUrl(string url)
    {
        try
        {
            var uri = new Uri(url.Contains("://") ? url : "https://" + url);
            var host = uri.Host.ToLowerInvariant();
            if (host.StartsWith("www."))
                host = host[4..];
            var hostSlug = host.Replace('.', '-');
            var path = uri.AbsolutePath.Trim('/');
            if (path.Length > 0)
            {
                var pathSlug = System.Text.RegularExpressions.Regex
                    .Replace(path.ToLowerInvariant(), @"[^a-z0-9]+", "-")
                    .Trim('-');
                if (pathSlug.Length > 0)
                    return $"{hostSlug}-{pathSlug}";
            }
            return hostSlug;
        }
        catch
        {
            return url.ToLowerInvariant()
                .Replace("https://", "").Replace("http://", "").Replace("www.", "")
                .Split('/')[0].Replace('.', '-');
        }
    }
}
