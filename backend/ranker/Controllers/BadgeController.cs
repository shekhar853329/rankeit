using MediatR;
using Microsoft.AspNetCore.Mvc;
using Ranker.Application.Badges;
using Ranker.Data;
using Microsoft.EntityFrameworkCore;

namespace Ranker.Controllers;

[ApiController]
[Route("api/badge")]
public class BadgeController(ISender sender, RankerDbContext dbContext, IHttpClientFactory httpClientFactory) : ControllerBase
{
    // ─── GET /api/badge/{slug}?style={light|dark|brand|compact|crown}&metric={category|global} ─
    [HttpGet("{slug}")]
    public async Task<IActionResult> GetBadge(
        string slug,
        [FromQuery] string style = "light",
        [FromQuery] string metric = "category",
        CancellationToken ct = default)
    {
        var data = await sender.Send(new GetBadgeDataQuery(slug), ct);
        var svg = RenderSvg(data, style, metric);

        Response.Headers["Cache-Control"] = "public, max-age=600";
        Response.Headers["Access-Control-Allow-Origin"] = "*";
        return Content(svg, "image/svg+xml");
    }

    // ─── GET /api/badge/{slug}/verify ────────────────────────────────────────
    [HttpGet("{slug}/verify")]
    public async Task<IActionResult> VerifyBadge(string slug, CancellationToken ct = default)
    {
        var slugLower = slug.Trim().ToLowerInvariant();

        var allListings = await dbContext.Listings
            .Where(l => l.CurrentClaimAmount > 0)
            .ToListAsync(ct);
        var listing = allListings.FirstOrDefault(l => GetBadgeDataQueryHandler.SlugifyUrl(l.Url) == slugLower);

        if (listing is null)
            return NotFound(new { error = "Listing not found for the given slug." });

        var checkedAt = DateTimeOffset.UtcNow;

        // Throttle: if checked within the last 15 minutes, return cached result
        if (listing.BadgeLastCheckedAt.HasValue &&
            (checkedAt - listing.BadgeLastCheckedAt.Value).TotalMinutes < 15)
        {
            return Ok(new
            {
                verified = listing.BadgeVerified,
                checkedAt = listing.BadgeLastCheckedAt!.Value,
                cached = true
            });
        }

        // Crawl the site for a link to rankup.cyou/website/{slug}
        bool found = false;
        try
        {
            using var client = httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.UserAgent.ParseAdd(
                "Mozilla/5.0 (compatible; RankUpBot/1.0; +https://rankup.cyou)");

            var siteUrl = listing.Url.Contains("://") ? listing.Url : "https://" + listing.Url;
            var html = await client.GetStringAsync(siteUrl, ct);

            // Look for any href containing rankup.cyou/website/{slug}
            var target = $"rankup.cyou/website/{slugLower}";
            found = html.Contains(target, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            // Crawl failed — treat as unverified, but still record the attempt
        }

        listing.BadgeVerified = found;
        listing.BadgeVerifiedAt = found ? checkedAt : listing.BadgeVerifiedAt;
        listing.BadgeLastCheckedAt = checkedAt;

        await dbContext.SaveChangesAsync(ct);

        return Ok(new { verified = found, checkedAt, cached = false });
    }

    // ─── SVG rendering ───────────────────────────────────────────────────────
    private static string RenderSvg(BadgeDataResult? data, string style, string metric)
    {
        if (data is null)
            return RenderNotRankedSvg(style);

        var isGlobal = metric.Equals("global", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(data.CategoryName);
        var rankNumber = isGlobal
            ? (data.GlobalRank.HasValue ? $"#{data.GlobalRank}" : "Unranked")
            : (data.CategoryRank.HasValue ? $"#{data.CategoryRank}" : "Unranked");

        var context = isGlobal
            ? "on RankUp"
            : $"in {EscapeXml(TruncateName(data.CategoryName ?? "Category", 18))}";

        var subtitle = isGlobal ? "GLOBAL LEADERBOARD · RANKUP" : "RANKED ON RANKUP";

        return style.ToLowerInvariant() switch
        {
            "dark" => RenderDarkSvg(rankNumber, context, subtitle, data.IsVerified),
            "brand" => RenderBrandSvg(rankNumber, context, subtitle, data.IsVerified),
            "compact" => RenderCompactSvg(rankNumber, isGlobal ? "RankUp" : EscapeXml(TruncateName(data.CategoryName ?? "RankUp", 14))),
            "crown" => RenderCrownSvg(rankNumber, context, data.IsVerified),
            _ => RenderLightSvg(rankNumber, context, subtitle, data.IsVerified),
        };
    }

    private static string RenderLightSvg(string rankNumber, string context, string subtitle, bool isVerified) => $"""
        <svg xmlns="http://www.w3.org/2000/svg" width="240" height="54" viewBox="0 0 240 54" role="img" aria-label="Ranked on RankUp">
          <title>Ranked on RankUp: {rankNumber} {context}</title>
          <defs>
            <linearGradient id="ru_grad" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#f95738"/>
              <stop offset="60%" stop-color="#d53d21"/>
              <stop offset="100%" stop-color="#b12408"/>
            </linearGradient>
            <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.04"/>
            </filter>
          </defs>
          <rect width="240" height="54" rx="10" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5" filter="url(#shadow)"/>
          <g transform="translate(10, 10)">
            <rect width="34" height="34" rx="8" fill="url(#ru_grad)"/>
            <path d="M17 8.5L25 21H9L17 8.5Z" fill="#ffffff"/>
            <rect x="11.5" y="23" width="11" height="2.5" rx="1" fill="#ffffff" fill-opacity="0.9"/>
          </g>
          <text x="52" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="9" font-weight="700" fill="#64748b" letter-spacing="0.6">{subtitle}</text>
          <text x="52" y="39" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
            <tspan font-size="15" font-weight="800" fill="#d93c1d">{rankNumber}</tspan>
            <tspan font-size="12" font-weight="600" fill="#1e293b"> {context}</tspan>
          </text>
          {RenderVerifiedBadge(isVerified, 216, 10)}
        </svg>
        """;

    private static string RenderDarkSvg(string rankNumber, string context, string subtitle, bool isVerified) => $"""
        <svg xmlns="http://www.w3.org/2000/svg" width="240" height="54" viewBox="0 0 240 54" role="img" aria-label="Ranked on RankUp">
          <title>Ranked on RankUp: {rankNumber} {context}</title>
          <defs>
            <linearGradient id="ru_grad_dark" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#f95738"/>
              <stop offset="60%" stop-color="#d53d21"/>
              <stop offset="100%" stop-color="#b12408"/>
            </linearGradient>
            <linearGradient id="ru_dark_bg" x1="0" y1="0" x2="240" y2="54" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#0f172a"/>
              <stop offset="100%" stop-color="#1e293b"/>
            </linearGradient>
          </defs>
          <rect width="240" height="54" rx="10" fill="url(#ru_dark_bg)" stroke="#334155" stroke-width="1.5"/>
          <g transform="translate(10, 10)">
            <rect width="34" height="34" rx="8" fill="url(#ru_grad_dark)"/>
            <path d="M17 8.5L25 21H9L17 8.5Z" fill="#ffffff"/>
            <rect x="11.5" y="23" width="11" height="2.5" rx="1" fill="#ffffff" fill-opacity="0.9"/>
          </g>
          <text x="52" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="9" font-weight="700" fill="#94a3b8" letter-spacing="0.6">{subtitle}</text>
          <text x="52" y="39" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
            <tspan font-size="15" font-weight="800" fill="#ff8a65">{rankNumber}</tspan>
            <tspan font-size="12" font-weight="600" fill="#f8fafc"> {context}</tspan>
          </text>
          {RenderVerifiedBadge(isVerified, 216, 10)}
        </svg>
        """;

    private static string RenderBrandSvg(string rankNumber, string context, string subtitle, bool isVerified) => $"""
        <svg xmlns="http://www.w3.org/2000/svg" width="240" height="54" viewBox="0 0 240 54" role="img" aria-label="Ranked on RankUp">
          <title>Ranked on RankUp: {rankNumber} {context}</title>
          <defs>
            <linearGradient id="brand_bg" x1="0" y1="0" x2="240" y2="54" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#f95738"/>
              <stop offset="60%" stop-color="#d53d21"/>
              <stop offset="100%" stop-color="#9a1b02"/>
            </linearGradient>
          </defs>
          <rect width="240" height="54" rx="10" fill="url(#brand_bg)" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>
          <g transform="translate(10, 10)">
            <rect width="34" height="34" rx="8" fill="#ffffff" fill-opacity="0.18"/>
            <path d="M17 8.5L25 21H9L17 8.5Z" fill="#ffffff"/>
            <rect x="11.5" y="23" width="11" height="2.5" rx="1" fill="#ffffff" fill-opacity="0.9"/>
          </g>
          <text x="52" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="9" font-weight="700" fill="#ffdad3" letter-spacing="0.6">{subtitle}</text>
          <text x="52" y="39" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
            <tspan font-size="15" font-weight="800" fill="#ffffff">{rankNumber}</tspan>
            <tspan font-size="12" font-weight="600" fill="#ffffff" fill-opacity="0.95"> {context}</tspan>
          </text>
          {RenderVerifiedBadge(isVerified, 216, 10, true)}
        </svg>
        """;

    private static string RenderCrownSvg(string rankNumber, string context, bool isVerified) => $"""
        <svg xmlns="http://www.w3.org/2000/svg" width="240" height="54" viewBox="0 0 240 54" role="img" aria-label="RankUp Crown Champion">
          <title>RankUp Crown Champion: {rankNumber} {context}</title>
          <defs>
            <linearGradient id="gold_bg" x1="0" y1="0" x2="240" y2="54" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#fffdf5"/>
              <stop offset="100%" stop-color="#fef9c3"/>
            </linearGradient>
            <linearGradient id="gold_logo" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#f59e0b"/>
              <stop offset="100%" stop-color="#d97706"/>
            </linearGradient>
          </defs>
          <rect width="240" height="54" rx="10" fill="url(#gold_bg)" stroke="#f59e0b" stroke-width="1.5"/>
          <g transform="translate(10, 10)">
            <rect width="34" height="34" rx="8" fill="url(#gold_logo)"/>
            <text x="17" y="24" font-size="18" text-anchor="middle">👑</text>
          </g>
          <text x="52" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="9" font-weight="800" fill="#92400e" letter-spacing="0.6">👑 CROWN HOLDER · RANKUP</text>
          <text x="52" y="39" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
            <tspan font-size="15" font-weight="800" fill="#b45309">{rankNumber}</tspan>
            <tspan font-size="12" font-weight="700" fill="#78350f"> {context}</tspan>
          </text>
          {RenderVerifiedBadge(isVerified, 216, 10)}
        </svg>
        """;

    private static string RenderCompactSvg(string rankNumber, string label) => $"""
        <svg xmlns="http://www.w3.org/2000/svg" width="180" height="28" viewBox="0 0 180 28" role="img" aria-label="Ranked on RankUp">
          <title>Ranked on RankUp: {rankNumber} {label}</title>
          <defs>
            <linearGradient id="ru_grad_compact" x1="0" y1="0" x2="68" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#f95738"/>
              <stop offset="100%" stop-color="#b12408"/>
            </linearGradient>
            <clipPath id="compact_round">
              <rect width="180" height="28" rx="6"/>
            </clipPath>
          </defs>
          <g clip-path="url(#compact_round)">
            <rect x="0" y="0" width="68" height="28" fill="url(#ru_grad_compact)"/>
            <rect x="68" y="0" width="112" height="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
            <g transform="translate(6, 6)">
              <path d="M8 3L12 10H4L8 3Z" fill="#ffffff"/>
              <rect x="5.5" y="11" width="5" height="1.5" rx="0.5" fill="#ffffff"/>
            </g>
            <text x="24" y="18" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10.5" font-weight="800" fill="#ffffff">RankUp</text>
            <text x="76" y="18" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="800" fill="#d93c1d">
              {rankNumber}
              <tspan font-size="10.5" font-weight="600" fill="#1e293b"> {label}</tspan>
            </text>
          </g>
          <rect width="180" height="28" rx="6" fill="none" stroke="#e2e8f0" stroke-width="1"/>
        </svg>
        """;

    private static string RenderVerifiedBadge(bool isVerified, int x, int y, bool isLightOnBrand = false)
    {
        if (!isVerified) return string.Empty;

        var circleColor = isLightOnBrand ? "#ffffff" : "#10b981";
        var checkColor = isLightOnBrand ? "#b12408" : "#ffffff";

        return $"""
            <g transform="translate({x}, {y})" title="Verified on RankUp">
              <circle cx="7" cy="7" r="7" fill="{circleColor}"/>
              <path d="M4.2 7.1L6.1 9L9.8 4.9" stroke="{checkColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </g>
            """;
    }

    private static string RenderNotRankedSvg(string style)
    {
        var isDark = style.Equals("dark", StringComparison.OrdinalIgnoreCase);
        var bg = isDark ? "#0f172a" : "#f8fafc";
        var stroke = isDark ? "#334155" : "#e2e8f0";
        var textHead = isDark ? "#64748b" : "#94a3b8";
        var textMain = isDark ? "#94a3b8" : "#64748b";

        return $"""
            <svg xmlns="http://www.w3.org/2000/svg" width="240" height="54" viewBox="0 0 240 54" role="img" aria-label="Not ranked on RankUp">
              <title>Not ranked on RankUp</title>
              <rect width="240" height="54" rx="10" fill="{bg}" stroke="{stroke}" stroke-width="1.5"/>
              <g transform="translate(10, 10)">
                <rect width="34" height="34" rx="8" fill="#94a3b8" fill-opacity="0.3"/>
                <path d="M17 8.5L25 21H9L17 8.5Z" fill="#94a3b8"/>
                <rect x="11.5" y="23" width="11" height="2.5" rx="1" fill="#94a3b8"/>
              </g>
              <text x="52" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="700" fill="{textHead}" letter-spacing="0.6">RANKUP DIRECTORY</text>
              <text x="52" y="39" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="{textMain}">Claim Rank on RankUp</text>
            </svg>
            """;
    }

    private static string EscapeXml(string s) =>
        s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");

    private static string TruncateName(string s, int max) =>
        s.Length <= max ? s : s[..max] + "…";
}
