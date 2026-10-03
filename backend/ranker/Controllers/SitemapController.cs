using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Ranker.Application.Listings;
using Ranker.Data;

namespace Ranker.Controllers;

[ApiController]
public class SitemapController(RankerDbContext dbContext, IMemoryCache cache) : ControllerBase
{
    private const string BaseUrl = "https://rankup.cyou";
    private const string CacheKey = "rankup_dynamic_sitemap_xml";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(20);

    [HttpGet("api/sitemap")]
    [HttpGet("api/sitemap.xml")]
    public async Task<IActionResult> GetSitemap(CancellationToken ct)
    {
        if (cache.TryGetValue(CacheKey, out string? cachedXml) && !string.IsNullOrEmpty(cachedXml))
        {
            return Content(cachedXml, "application/xml; charset=utf-8", Encoding.UTF8);
        }

        var sb = new StringBuilder();
        sb.AppendLine("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        sb.AppendLine("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");

        // 1. Core static pages
        AddUrl(sb, $"{BaseUrl}/", "hourly", "1.0", DateTime.UtcNow.ToString("yyyy-MM-dd"));
        AddUrl(sb, $"{BaseUrl}/categories", "daily", "0.9", DateTime.UtcNow.ToString("yyyy-MM-dd"));
        AddUrl(sb, $"{BaseUrl}/daily", "hourly", "0.8", DateTime.UtcNow.ToString("yyyy-MM-dd"));
        AddUrl(sb, $"{BaseUrl}/rules", "monthly", "0.5");
        AddUrl(sb, $"{BaseUrl}/contact", "monthly", "0.5");
        AddUrl(sb, $"{BaseUrl}/terms", "monthly", "0.4");
        AddUrl(sb, $"{BaseUrl}/privacy", "monthly", "0.4");

        // 2. All active category leaderboards
        var categories = await dbContext.Categories
            .AsNoTracking()
            .Select(c => c.Slug)
            .ToListAsync(ct);

        foreach (var catSlug in categories)
        {
            AddUrl(sb, $"{BaseUrl}/leaderboard/{catSlug}", "hourly", "0.8", DateTime.UtcNow.ToString("yyyy-MM-dd"));
        }

        // 3. All active paid listings (websites)
        var listings = await dbContext.Listings
            .AsNoTracking()
            .Where(l => l.CurrentClaimAmount > 0)
            .Select(l => new { l.Url, l.LastClaimAt })
            .ToListAsync(ct);

        var seenSlugs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var listing in listings)
        {
            var slug = GetWebsiteProfileQueryHandler.SlugifyUrl(listing.Url);
            if (string.IsNullOrWhiteSpace(slug) || !seenSlugs.Add(slug))
            {
                continue;
            }

            var lastMod = listing.LastClaimAt.ToString("yyyy-MM-dd");
            AddUrl(sb, $"{BaseUrl}/website/{slug}", "daily", "0.7", lastMod);
        }

        sb.AppendLine("</urlset>");

        var xml = sb.ToString();
        cache.Set(CacheKey, xml, CacheDuration);

        return Content(xml, "application/xml; charset=utf-8", Encoding.UTF8);
    }

    private static void AddUrl(StringBuilder sb, string loc, string changefreq, string priority, string? lastmod = null)
    {
        sb.AppendLine("  <url>");
        sb.Append("    <loc>").Append(loc).AppendLine("</loc>");
        if (!string.IsNullOrEmpty(lastmod))
        {
            sb.Append("    <lastmod>").Append(lastmod).AppendLine("</lastmod>");
        }
        sb.Append("    <changefreq>").Append(changefreq).AppendLine("</changefreq>");
        sb.Append("    <priority>").Append(priority).AppendLine("</priority>");
        sb.AppendLine("  </url>");
    }
}
