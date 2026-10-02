using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Dtos;

namespace Ranker.Application.Listings;

public class GetWebsiteProfileQueryHandler(RankerDbContext dbContext)
    : IRequestHandler<GetWebsiteProfileQuery, WebsiteProfileDto?>
{
    public async Task<WebsiteProfileDto?> Handle(GetWebsiteProfileQuery request, CancellationToken ct)
    {
        // Convert the slug back to a domain pattern for matching.
        // Slug format: "example-com" maps to "example.com" (dots replaced with hyphens).
        // We also handle multi-segment domains like "blog-example-com" -> "blog.example.com".
        var slugLower = request.Slug.Trim().ToLowerInvariant();

        // Try to find a listing whose URL domain matches the slug.
        // We need to normalize both the slug and the stored URLs for comparison.
        var allListings = await dbContext.Listings
            .AsNoTracking()
            .Include(l => l.Category)
            .Where(l => l.CurrentBidAmount > 0)
            .Select(l => new
            {
                l.Id,
                l.Name,
                l.Url,
                l.CategoryId,
                l.CurrentBidAmount,
                l.FirstBidAt,
                l.LastBidAt,
                l.ClickCount,
                l.SiteName,
                l.LogoUrl,
                l.Description,
                l.FaviconUrl,
                l.OwnerContactEmail,
                CategoryName = l.Category!.Name,
                CategorySlug = l.Category!.Slug,
                CategoryIcon = l.Category!.Icon,
                BidCount = l.Bids.Count
            })
            .ToListAsync(ct);

        // Find the listing whose URL domain, when slugified, matches the requested slug.
        var listing = allListings.FirstOrDefault(l => SlugifyUrl(l.Url) == slugLower);

        if (listing is null)
        {
            return null;
        }

        // Calculate rank
        var rank = allListings
            .Where(l => l.CategoryId == listing.CategoryId)
            .Count(l => l.CurrentBidAmount > listing.CurrentBidAmount
                || (l.CurrentBidAmount == listing.CurrentBidAmount && l.FirstBidAt < listing.FirstBidAt)) + 1;

        var totalInCategory = allListings.Count(l => l.CategoryId == listing.CategoryId);

        // Get other listings in the same category (excluding self), top 6 by bid
        var sameCategoryListings = allListings
            .Where(l => l.CategoryId == listing.CategoryId && l.Id != listing.Id)
            .OrderByDescending(l => l.CurrentBidAmount)
            .ThenBy(l => l.FirstBidAt)
            .Take(6)
            .Select((l, idx) =>
            {
                var lRank = allListings
                    .Where(x => x.CategoryId == l.CategoryId)
                    .Count(x => x.CurrentBidAmount > l.CurrentBidAmount
                        || (x.CurrentBidAmount == l.CurrentBidAmount && x.FirstBidAt < l.FirstBidAt)) + 1;

                return new RelatedListingDto(
                    l.Id,
                    l.Name,
                    l.Url,
                    l.CategoryName,
                    l.CategorySlug,
                    lRank,
                    l.CurrentBidAmount,
                    l.ClickCount,
                    l.SiteName,
                    l.LogoUrl,
                    l.Description,
                    l.FaviconUrl);
            })
            .ToList();

        return new WebsiteProfileDto(
            listing.Id,
            listing.Name,
            listing.Url,
            slugLower,
            listing.CategoryName,
            listing.CategorySlug,
            listing.CategoryIcon,
            rank,
            totalInCategory,
            listing.CurrentBidAmount,
            listing.FirstBidAt,
            listing.LastBidAt,
            listing.ClickCount,
            listing.BidCount,
            listing.SiteName,
            listing.LogoUrl,
            listing.Description,
            listing.FaviconUrl,
            MaskEmail(listing.OwnerContactEmail),
            sameCategoryListings);
    }

    /// <summary>
    /// Converts a full URL into a URL-safe slug, e.g.
    /// "https://www.example.com/path" -> "example-com"
    /// "https://blog.example.co.uk" -> "blog-example-co-uk"
    /// </summary>
    internal static string SlugifyUrl(string url)
    {
        try
        {
            var uri = new Uri(url.Contains("://") ? url : "https://" + url);
            var host = uri.Host.ToLowerInvariant();
            // Strip "www." prefix
            if (host.StartsWith("www."))
                host = host[4..];
            // Replace dots with hyphens
            return host.Replace('.', '-');
        }
        catch
        {
            // Fallback: just do basic string replacement
            var clean = url.ToLowerInvariant()
                .Replace("https://", "")
                .Replace("http://", "")
                .Replace("www.", "")
                .Split('/')[0]
                .Replace('.', '-');
            return clean;
        }
    }

    private static string? MaskEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return null;
        var parts = email.Split('@');
        if (parts.Length != 2) return email;
        var name = parts[0];
        var domain = parts[1];
        if (name.Length <= 2) return $"{name[0]}*@{domain}";
        return $"{name[0]}***{name[^1]}@{domain}";
    }
}
