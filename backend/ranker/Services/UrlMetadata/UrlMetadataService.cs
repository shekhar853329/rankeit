using System.Text.RegularExpressions;
using Ranker.Dtos;

namespace Ranker.Services.UrlMetadata;

public interface IUrlMetadataService
{
    Task<UrlMetadataDto> FetchAsync(string rawUrl, CancellationToken ct = default);
}

public sealed partial class UrlMetadataService(
    IHttpClientFactory httpClientFactory,
    ILogger<UrlMetadataService> logger) : IUrlMetadataService
{
    // ── Compiled regexes (used by direct-scrape fallback) ─────────────────

    [GeneratedRegex(@"<meta[^>]+property=[""']og:title[""'][^>]+content=[""']([^""']+)[""']",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex OgTitleRegex();

    [GeneratedRegex(@"<meta[^>]+content=[""']([^""']+)[""'][^>]+property=[""']og:title[""']",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex OgTitleAltRegex();

    [GeneratedRegex(@"<meta[^>]+property=[""']og:site_name[""'][^>]+content=[""']([^""']+)[""']",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex OgSiteNameRegex();

    [GeneratedRegex(@"<meta[^>]+content=[""']([^""']+)[""'][^>]+property=[""']og:site_name[""']",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex OgSiteNameAltRegex();

    [GeneratedRegex(@"<meta[^>]+property=[""']og:image[""'][^>]+content=[""']([^""']+)[""']",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex OgImageRegex();

    [GeneratedRegex(@"<meta[^>]+content=[""']([^""']+)[""'][^>]+property=[""']og:image[""']",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex OgImageAltRegex();

    [GeneratedRegex(@"<meta[^>]+(?:property=[""']og:description[""']|name=[""']description[""'])[^>]+content=[""']([^""']{10,500})[""']",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex DescriptionRegex();

    [GeneratedRegex(@"<meta[^>]+content=[""']([^""']{10,500})[""'][^>]+(?:property=[""']og:description[""']|name=[""']description[""'])",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex DescriptionAltRegex();

    [GeneratedRegex(@"<link[^>]+rel=[""'][^""']*icon[^""']*[""'][^>]+href=[""']([^""']+)[""']",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex FaviconRegex();

    [GeneratedRegex(@"<link[^>]+href=[""']([^""']+)[""'][^>]+rel=[""'][^""']*icon[^""']*[""']",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex FaviconAltRegex();

    [GeneratedRegex(@"<title[^>]*>([^<]{1,300})</title>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex TitleRegex();

    // ── Public API ────────────────────────────────────────────────────────

    public async Task<UrlMetadataDto> FetchAsync(string rawUrl, CancellationToken ct = default)
    {
        var canonicalUrl = Canonicalize(rawUrl);
        if (canonicalUrl is null)
            return new UrlMetadataDto(null, null, null, null);

        // Try direct HTTP scrape with multiple strategies
        var result = await TryFetchDirectAsync(canonicalUrl, ct);
        if (result is not null)
            return result;

        // If all strategies fail, return basic metadata with extracted domain
        logger.LogWarning("All fetch strategies failed for {Url}", canonicalUrl);
        return await GetFallbackMetadata(canonicalUrl);
    }

    // ── Direct HTTP scrape with multiple strategies ──────────────────────

    private async Task<UrlMetadataDto?> TryFetchDirectAsync(string url, CancellationToken ct)
    {
        // Strategy 1: Use the pre-configured UrlMetadataDirect client
        var result = await TryFetchWithClient("UrlMetadataDirect", url, null, ct);
        if (result is not null)
        {
            logger.LogDebug("Successfully fetched metadata for {Url} using default client", url);
            return result;
        }

        // Strategy 2: Try with additional browser-like headers
        logger.LogDebug("Retrying {Url} with enhanced headers", url);
        result = await TryFetchWithClient("UrlMetadataDirect", url, AddEnhancedHeaders, ct);
        if (result is not null)
        {
            logger.LogDebug("Successfully fetched metadata for {Url} with enhanced headers", url);
            return result;
        }

        // Strategy 3: Try with mobile user agent (some sites are less strict with mobile)
        logger.LogDebug("Retrying {Url} with mobile user agent", url);
        result = await TryFetchWithClient("UrlMetadataDirect", url, AddMobileHeaders, ct);
        if (result is not null)
        {
            logger.LogDebug("Successfully fetched metadata for {Url} with mobile headers", url);
            return result;
        }

        logger.LogDebug("All direct fetch strategies failed for {Url}", url);
        return null;
    }

    private async Task<UrlMetadataDto?> TryFetchWithClient(
        string clientName, 
        string url, 
        Action<HttpRequestMessage, string>? configureRequest,
        CancellationToken ct)
    {
        try
        {
            var client = httpClientFactory.CreateClient(clientName);
            
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            
            // Apply additional headers if provided
            configureRequest?.Invoke(request, url);

            using var response = await client.SendAsync(request, ct);
            
            // Log status for debugging
            if (!response.IsSuccessStatusCode)
            {
                logger.LogDebug("HTTP {StatusCode} for {Url}", response.StatusCode, url);
                return null;
            }

            var html = await response.Content.ReadAsStringAsync(ct);

            return ParseHtmlMetadata(html, url);
        }
        catch (HttpRequestException ex)
        {
            logger.LogDebug(ex, "HTTP request failed for {Url}: {Message}", url, ex.Message);
            return null;
        }
        catch (TaskCanceledException ex)
        {
            logger.LogDebug(ex, "Request timeout for {Url}", url);
            return null;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Unexpected error fetching {Url}", url);
            return null;
        }
    }

    private void AddEnhancedHeaders(HttpRequestMessage request, string targetUrl)
    {
        // Make the request look more like a real browser
        request.Headers.TryAddWithoutValidation("Referer", GetBaseUrl(targetUrl));
        request.Headers.TryAddWithoutValidation("DNT", "1");
        request.Headers.TryAddWithoutValidation("Connection", "keep-alive");
        request.Headers.TryAddWithoutValidation("Upgrade-Insecure-Requests", "1");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Dest", "document");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Mode", "navigate");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "none");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-User", "?1");
        request.Headers.TryAddWithoutValidation("Cache-Control", "max-age=0");
    }

    private void AddMobileHeaders(HttpRequestMessage request, string targetUrl)
    {
        // Mobile user agent - often less strict bot detection
        request.Headers.TryAddWithoutValidation("User-Agent", 
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1");
        request.Headers.TryAddWithoutValidation("Referer", GetBaseUrl(targetUrl));
        request.Headers.TryAddWithoutValidation("Accept", 
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        request.Headers.TryAddWithoutValidation("Accept-Language", "en-US,en;q=0.9");
        request.Headers.TryAddWithoutValidation("Accept-Encoding", "gzip, deflate, br");
    }

    private UrlMetadataDto? ParseHtmlMetadata(string html, string url)
    {
        if (string.IsNullOrWhiteSpace(html))
            return null;

        var siteName = FirstMatch(OgSiteNameRegex(), OgSiteNameAltRegex(), html)
                    ?? FirstMatch(OgTitleRegex(), OgTitleAltRegex(), html)
                    ?? FirstMatch(TitleRegex(), null, html);

        // No title means either a bot-wall page or a JS-rendered SPA
        if (string.IsNullOrWhiteSpace(siteName))
        {
            logger.LogDebug("No title found in HTML for {Url}", url);
            return null;
        }

        var logoUrl = FirstMatch(OgImageRegex(), OgImageAltRegex(), html);
        var description = FirstMatch(DescriptionRegex(), DescriptionAltRegex(), html);
        var faviconUrl = ResolveFavicon(
            FirstMatch(FaviconRegex(), FaviconAltRegex(), html), url);

        return new UrlMetadataDto(
            Truncate(HtmlDecode(siteName), 300),
            Truncate(logoUrl, 2048),
            Truncate(HtmlDecode(description), 1000),
            Truncate(faviconUrl, 2048));
    }

    private async Task<UrlMetadataDto> GetFallbackMetadata(string url)
    {
        // Extract domain name as fallback title
        try
        {
            if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
            {
                var domain = uri.Host;
                // Remove www. prefix for cleaner display
                if (domain.StartsWith("www.", StringComparison.OrdinalIgnoreCase))
                    domain = domain[4..];

                var favicon = BuildFaviconFallback(url);

                return new UrlMetadataDto(
                    domain, 
                    null, 
                    $"Website: {domain}", 
                    favicon);
            }
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Failed to create fallback metadata for {Url}", url);
        }

        return new UrlMetadataDto(null, null, null, null);
    }

    private static string GetBaseUrl(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return $"{uri.Scheme}://{uri.Host}";
        }
        return url;
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private static string? FirstMatch(Regex primary, Regex? secondary, string html)
    {
        var m = primary.Match(html);
        if (m.Success) return m.Groups[1].Value.Trim();
        if (secondary is null) return null;
        m = secondary.Match(html);
        return m.Success ? m.Groups[1].Value.Trim() : null;
    }

    private static string ResolveFavicon(string? faviconHref, string pageUrl)
    {
        if (Uri.TryCreate(pageUrl, UriKind.Absolute, out var pageUri))
        {
            var origin = $"{pageUri.Scheme}://{pageUri.Host}";
            if (!string.IsNullOrWhiteSpace(faviconHref))
            {
                if (faviconHref.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                    return faviconHref;
                return origin + (faviconHref.StartsWith('/') ? faviconHref : "/" + faviconHref);
            }
            return $"{origin}/favicon.ico";
        }
        return string.Empty;
    }

    private static string BuildFaviconFallback(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u)
            ? $"{u.Scheme}://{u.Host}/favicon.ico"
            : string.Empty;

    private static string? Canonicalize(string rawUrl)
    {
        var v = rawUrl.Trim();
        if (string.IsNullOrEmpty(v)) return null;
        if (!v.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !v.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            v = "https://" + v;
        }
        return Uri.TryCreate(v, UriKind.Absolute, out _) ? v : null;
    }

    private static string? Truncate(string? value, int maxLength) =>
        value is null ? null : (value.Length <= maxLength ? value : value[..maxLength]);

    private static string? HtmlDecode(string? value) =>
        value is null ? null : System.Net.WebUtility.HtmlDecode(value);
}
