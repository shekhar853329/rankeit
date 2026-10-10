# Metadata Fetch Workflow — Investigation Report

## Summary

Website metadata (site name, logo/OG image, description, favicon) is fetched **on the frontend** via a debounced HTTP call to a dedicated backend endpoint whenever a user types a URL into a claim form. The backend performs a raw HTML scrape using an `IHttpClientFactory`-managed client with browser-mimicking headers — **no headless browser, no third-party scraping library** (no HtmlAgilityPack, no Puppeteer, no AngleSharp). The scraped data is **never cached on the server**; it is returned to the frontend, shown in the UI preview, and then passed along as part of the claim payload, where it is written once to the `Listing` row in PostgreSQL.

---

## End-to-End Workflow

### Step 1 — User types a URL (Frontend)

Three places trigger the metadata fetch:

| Component | File | Trigger |
|---|---|---|
| Leaderboard claim sidebar | `ranker.ui/src/app/features/leaderboard/leaderboard.component.ts` | `onSidebarUrlChange()` → pushes to `urlChange$` Subject |
| Global leaderboard hero | `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts` | `onHeroUrlChange()` → pushes to `urlChange$` Subject |
| Confirm Claim Modal (new listing only) | `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts` | Inside `domainChange$` switchMap, after `LookupListing` returns `found: false` |

All three validate the URL client-side first (checking for a valid HTTP/HTTPS URL or bare domain). Only if valid is the metadata fetch issued.

### Step 2 — Debounce + switchMap (Frontend)

The `leaderboard` and `global-leaderboard` components debounce 500 ms using `urlChange$.pipe(debounceTime(500), distinctUntilChanged(), switchMap(...))`. The confirm-claim-modal fires it directly inside the `domainChange$` pipe (which already debounces 350 ms) but only when the lookup result says the listing is brand-new.

```typescript
// leaderboard.component.ts (lines ~698-714)
this.urlChange$
  .pipe(
    debounceTime(500),
    distinctUntilChanged(),
    switchMap((url) => {
      this.metadataLoading.set(true);
      return this.urlMetadataService.fetch(url);
    }),
    takeUntilDestroyed(this.destroyRef),
  )
  .subscribe((meta) => {
    this.urlMetadata.set(meta);
    // Auto-fill site name into productTitle if returned
    const dynamicTitle = meta?.siteName?.trim();
    if (dynamicTitle) this.productTitle.set(dynamicTitle);
    else this.productTitle.set(this.sidebarUrl().trim());
    this.metadataLoading.set(false);
  });
```

### Step 3 — UrlMetadataService.fetch() (Frontend → Backend)

`ranker.ui/src/app/core/services/url-metadata.service.ts`

A simple Angular service that calls `GET /api/url-metadata?url=<url>`. Any error is swallowed and mapped to an all-null `UrlMetadataDto`:

```typescript
fetch(url: string): Observable<UrlMetadataDto> {
  return this.http
    .get<UrlMetadataDto>(`${API_BASE_URL}/api/url-metadata`, { params: { url } })
    .pipe(catchError(() => of({ siteName: null, logoUrl: null, description: null, faviconUrl: null })));
}
```

### Step 4 — UrlMetadataController (Backend)

`backend/ranker/Controllers/UrlMetadataController.cs`

Minimal controller. Validates that `url` is non-empty, delegates everything to `IUrlMetadataService.FetchAsync()`, and always returns 200 (even on scrape failure — returns nulls, not an error):

```csharp
[HttpGet]
public async Task<IActionResult> Get([FromQuery] string url, CancellationToken ct)
{
    if (string.IsNullOrWhiteSpace(url))
        return BadRequest("url query parameter is required.");
    var result = await urlMetadata.FetchAsync(url, ct);
    return Ok(result);
}
```

### Step 5 — UrlMetadataService.FetchAsync() (Backend scraping logic)

`backend/ranker/Services/UrlMetadata/UrlMetadataService.cs`

This is where the actual work happens. Three sequential strategies are tried, all using the same named `HttpClient` (`"UrlMetadataDirect"`) registered in `Program.cs`:

```
Strategy 1: Default client headers (Chrome UA)
  ↓ fail (non-2xx or no title found)
Strategy 2: Enhanced "browser-like" headers (Referer, Sec-Fetch-*, Cache-Control)
  ↓ fail
Strategy 3: Mobile Safari user agent
  ↓ fail
Fallback: Extract domain name, synthesize /favicon.ico URL
```

Each strategy calls `TryFetchWithClient()` which:
1. Creates the named client from `IHttpClientFactory`
2. Sends a `GET` request
3. Reads the full HTML body as a string
4. Calls `ParseHtmlMetadata(html, url)` — pure regex parsing

**No third-party HTML parser is used.** The project's `ranker.csproj` only references `Google.Apis.AnalyticsData.v1beta`, `MediatR`, EF Core, and Npgsql. The parsing is done by **13 source-generated `[GeneratedRegex]` static partial methods** covering attribute-order variations of each OG/meta tag:

| Field | Parsed from |
|---|---|
| `SiteName` | `og:site_name` → `og:title` → `<title>` (priority order) |
| `LogoUrl` | `og:image` |
| `Description` | `og:description` or `<meta name="description">` |
| `FaviconUrl` | `<link rel="icon">` → falls back to `origin/favicon.ico` |

Each regex has a "primary" and "alt" variant to handle both `property="..." content="..."` and `content="..." property="..."` attribute orderings.

### Step 6 — HTTP client configuration (Program.cs)

`backend/ranker/Program.cs` (lines ~52-70)

```csharp
builder.Services.AddHttpClient("UrlMetadataDirect", client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/131.0.0.0 ...");
    client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en-US,en;q=0.9");
    client.DefaultRequestHeaders.AcceptEncoding.ParseAdd("gzip, deflate, br");
})
.ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
{
    AutomaticDecompression = System.Net.DecompressionMethods.All,
    AllowAutoRedirect = true,
    MaxAutomaticRedirections = 5,
    UseCookies = true
});
```

### Step 7 — Return to frontend: UI preview

The `UrlMetadataDto` returned from the backend (`SiteName`, `LogoUrl`, `Description`, `FaviconUrl`) is stored in a Signal (`urlMetadata`). The leaderboard/global-leaderboard components render a live preview. `SiteName` is auto-populated into the `productTitle` field.

The confirm-claim-modal component also has a separate path: when opening the modal, if the passed `listingUrl` was already in the DB (`LookupListing` returns `found: true`), the **stored** metadata from the DB is used directly (no re-scrape). Only for brand-new listings does it call `urlMetadataService.fetch()`.

### Step 8 — Metadata travels into PlaceClaimCommand (Backend)

When the user submits the claim, the scraped metadata (`SiteName`, `LogoUrl`, `Description`, `FaviconUrl`) is bundled into the `PlaceClaimCommand` record:

```csharp
// Application/Claims/PlaceClaimCommand.cs
public sealed record PlaceClaimCommand(
    ...
    string? SiteName,
    string? LogoUrl,
    string? Description,
    string? FaviconUrl,
    ...
) : IRequest<PlaceClaimResultDto>;
```

`PlaceClaimCommandHandler` writes this to the `Listing` entity. For **new listings**, all four fields are set on construction. For **reclaims**, they are only updated if the incoming value is non-null/non-empty (existing values are preserved otherwise).

### Step 9 — Stored on the Listing entity (Domain)

`backend/ranker/Domain/Entities/Listing.cs`

The `Listing` entity has four nullable metadata properties: `SiteName`, `LogoUrl`, `Description`, `FaviconUrl`. These are **written once at claim time** and never refreshed automatically unless the owner re-claims and provides new metadata.

### Step 10 — Read back via query handlers

Three read paths surface this stored metadata:
- `GetListingDetailQueryHandler` — `/api/listings/{id}` → `ListingDetailDto`
- `LookupListingQueryHandler` — `/api/listings/lookup?categoryId=&url=` → `ListingLookupResultDto`
- `GetWebsiteProfileQueryHandler` — `/api/listings/profile/{slug}` → `WebsiteProfileDto`

None of these re-fetch from the web. They return whatever is stored in the DB.

---

## Data Flow Diagram

```
User types URL
     │ (500ms debounce, distinctUntilChanged)
     ▼
UrlMetadataService.fetch(url)          [Frontend Angular service]
     │ GET /api/url-metadata?url=...
     ▼
UrlMetadataController.Get()            [Backend controller]
     │
     ▼
UrlMetadataService.FetchAsync()        [Backend scraper]
     │
     ├─ Strategy 1: UrlMetadataDirect HttpClient (Chrome UA)
     ├─ Strategy 2: + Enhanced browser headers
     ├─ Strategy 3: + Mobile Safari UA
     │    (each → ParseHtmlMetadata → regex on raw HTML)
     └─ Fallback: domain name + /favicon.ico
     │
     ▼
UrlMetadataDto { SiteName, LogoUrl, Description, FaviconUrl }
     │
     ▼
Frontend: urlMetadata Signal (live preview in UI)
     │
     ▼ (on claim submit)
PlaceClaimCommand { ..., SiteName, LogoUrl, Description, FaviconUrl }
     │
     ▼
PlaceClaimCommandHandler → Listing.SiteName / LogoUrl / Description / FaviconUrl
     │
     ▼
PostgreSQL Listings table  (persisted, never auto-refreshed)
     │
     ▼
Read by: GetListingDetail / LookupListing / GetWebsiteProfile
```

---

## No Caching

There is **zero server-side caching** of metadata. Every time a user types a new URL, a fresh HTTP scrape is performed. `Program.cs` registers `AddMemoryCache()` but `UrlMetadataService` does not inject `IMemoryCache`. Each call incurs a live network request to the target site.

---

## Duplication: `MaskEmail` in Two Places

`MaskEmail` is a private static method defined identically in both `LookupListingQueryHandler` and `GetWebsiteProfileQueryHandler`. This is a copy-paste that could live in a shared helper or extension method.

---

## Conclusions and Recommendations

### 1. No caching — repeated scrapes for the same URL
**Problem:** Every keystroke (after debounce) fires a fresh HTTP scrape to the target site. If two users type the same URL within minutes, it scrapes twice.  
**Recommendation:** Add a short-lived `IMemoryCache` entry in `UrlMetadataService.FetchAsync()` keyed by the canonicalized URL, with a TTL of 5–15 minutes. The service already injects `ILogger`; just add `IMemoryCache`.

### 2. Three retry strategies are silently tried on every failure
**Problem:** When a site blocks the default Chrome UA, the service transparently retries with enhanced headers and then mobile UA. Three HTTP round-trips happen before falling back. This can add 3 × 15 s = 45 s latency in the worst case (though `TaskCanceledException` caps it per attempt).  
**Recommendation:** This is intentional resilience, but the 15 s timeout per attempt means worst-case latency is high. Consider reducing per-attempt timeout (e.g. 8 s) and relying on the three-strategy fan-out for coverage rather than long individual waits.

### 3. Metadata is scraped client-triggered but stored only at claim time
**Problem:** If the scrape succeeds during the URL-preview phase but fails later (e.g. network blip before claim submit), the claim is placed with null metadata because the frontend re-evaluates. The metadata stored at first keypress is not "locked" until submit.  
**Recommendation:** This is acceptable UX for now, but worth noting. The frontend already passes whatever it has in `urlMetadata()` at submit time, so it's only a problem if the Signal is cleared between preview and submit.

### 4. Duplicated `MaskEmail` helper
**Files:** `LookupListingQueryHandler.cs` and `GetWebsiteProfileQueryHandler.cs`  
**Recommendation:** Extract to a shared static helper class (e.g. `EmailHelpers.cs` in `Application/Common/`).

### 5. `IUrlMetadataService` interface is defined in the same file as the implementation
**File:** `UrlMetadataService.cs` contains both `IUrlMetadataService` and `UrlMetadataService`.  
**Recommendation:** This is a minor code smell. Consider moving the interface to its own file `IUrlMetadataService.cs` in the same folder, consistent with the `IGoogleAnalyticsService`/`GoogleAnalyticsService` and `IIndexNowService`/`IndexNowService` pairs in `Services/`.

### 6. Regex duplication: primary + alt variant for each tag attribute order
**Problem:** Each meta tag has two compiled regexes (forward and reverse attribute order). Six tags × 2 = 12 compiled patterns, plus one for `<title>` and one for favicon = 14 total.  
**Recommendation:** This is functional and zero-allocation thanks to `[GeneratedRegex]`. The main cleanup opportunity is extracting `ParseHtmlMetadata` to a separate file or at least grouping the regex declarations with their usage via a private record/struct. It is readable as-is, but the duplication adds noise.

### 7. `faviconDisplayUrl()` in leaderboard component duplicates favicon logic
**File:** `leaderboard.component.ts` has its own `faviconDisplayUrl()` method that builds a Google Favicon API URL (`https://www.google.com/s2/favicons?domain=...`) — this is completely separate from the backend's favicon scraping. The component shows the Google-sourced favicon as a quick preview, while the backend stores the scraped `<link rel="icon">` href. These two paths will sometimes disagree on what favicon is displayed.  
**Recommendation:** Decide on one canonical source. The Google S2 API is more reliable for previews since it doesn't require scraping. Consider always using it for display and only storing the scraped favicon for completeness.
