# YouTube Channel Profile Link Bug — Investigation Report

## Summary Answer

**All YouTube channels share the same profile slug (`youtube-com`)** because the slug is generated from the URL's *hostname only*, ignoring the path. Every YouTube channel URL (`youtube.com/@ChannelA`, `youtube.com/@ChannelB`, `youtube.com/channel/UCxxx`) resolves to the same slug. The backend's `FirstOrDefault` query then returns whichever listing happens to come first from the database — in practice the last-added channel, because EF Core typically returns rows in insertion order when no ORDER BY is specified.

---

## Evidence

### 1. Slug generation — frontend (three copies of the same bug)

All three components that build profile links use `hostname`-only slug generation:

**`ranker.ui/src/app/features/leaderboard/leaderboard.component.ts` lines ~711–720**
```ts
slugifyUrl(url: string): string {
  // ...
  return new URL(clean).hostname.replace(/^www\./, '').replace(/\./g, '-');
}
```

**`ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts` lines ~1210–1219**
```ts
slugifyUrl(url: string): string {
  // ...
  return new URL(clean).hostname.replace(/^www\./, '').replace(/\./g, '-');
}
```

**`ranker.ui/src/app/features/website-profile/website-profile.component.ts` lines ~196–202** (`getProfileSlug`, used for "related listings")
```ts
getProfileSlug(url: string): string {
  const host = new URL(url.includes('://') ? url : 'https://' + url).hostname
    .replace(/^www\./, '')
    .replace(/\./g, '-');
  return host;
}
```

Same logic in `ranker.ui/src/app/features/listing-detail/listing-detail.component.ts` line ~211.

For `https://youtube.com/@ChannelA` and `https://youtube.com/@ChannelB`, all four functions produce **`youtube-com`**. The path (`/@ChannelA`, `/@ChannelB`) is discarded entirely.

### 2. Slug-to-profile lookup — backend

**`backend/ranker/Application/Listings/GetWebsiteProfileQueryHandler.cs`** — the `Handle` method:

```csharp
var listing = allListings.FirstOrDefault(l => SlugifyUrl(l.Url) == slugLower);
```

And `SlugifyUrl` (same file, lines ~107–120):

```csharp
internal static string SlugifyUrl(string url)
{
    var uri = new Uri(url.Contains("://") ? url : "https://" + url);
    var host = uri.Host.ToLowerInvariant();
    if (host.StartsWith("www."))
        host = host[4..];
    return host.Replace('.', '-');   // ← path not included
}
```

When called with the slug `youtube-com`, `SlugifyUrl` on each stored listing URL produces:
- `youtube.com/@ChannelA` → `youtube-com` ✓ matches
- `youtube.com/@ChannelB` → `youtube-com` ✓ also matches
- `youtube.com/@ChannelC` → `youtube-com` ✓ also matches

`FirstOrDefault` stops at the **first match in the in-memory list**, which is the first row returned by EF Core. Since there is no `ORDER BY` on the `allListings` query, the database is free to return rows in any order — typically the most recently inserted row comes first via PostgreSQL's sequential scan, explaining the "always the last added channel" observation.

### 3. Slug field propagated to the DTO

`WebsiteProfileDto` (`backend/ranker/Dtos/WebsiteProfileDto.cs`) carries a `Slug` field. It is set to `slugLower` — so the response itself is consistent, but the slug is still `youtube-com` regardless of which channel was meant.

### 4. Route definition

`ranker.ui/src/app/app.routes.ts` line 41: the route is `/website/:slug`. All YouTube channels route to the same Angular URL, which calls the same API endpoint, which returns the first match.

### 5. Sitemap also collapses duplicates

`backend/ranker/Controllers/SitemapController.cs` uses `seenSlugs.Add(slug)` to skip duplicates — so only the first YouTube channel ever makes it into the sitemap. This is a secondary symptom of the same root cause.

---

## Root Cause

The `SlugifyUrl` function in both frontend and backend was designed for **websites** (one listing per domain), where `hostname` is a sufficient unique identifier. It was never adapted for **social-media channels that share a host** (YouTube, Instagram, TikTok, Twitter, LinkedIn, etc.), where the *path* is the unique identifier.

The complete causal chain:

```
User clicks "Profile" on YouTube Channel B
  → slugifyUrl("youtube.com/@ChannelB") = "youtube-com"    [frontend]
  → GET /api/listings/profile/youtube-com                   [API call]
  → allListings.FirstOrDefault(l => SlugifyUrl(l.Url) == "youtube-com")
      matches ChannelA (first in list) instead of ChannelB  [backend]
  → Returns ChannelA's profile                              [wrong result]
```

---

## Recommendations (do not implement — investigation only)

### Option A — Path-aware slug (recommended, minimal change)

Extend `SlugifyUrl` to append a sanitised version of the URL path when the host is a known social-media domain (or always, since it is harmless for regular websites):

```
youtube.com/@ChannelA  →  youtube-com-@channela
youtube.com/@ChannelB  →  youtube-com-@channelb
youtube.com/channel/UCxxx  →  youtube-com-channel-ucxxx
example.com  →  example-com   (unchanged for regular sites)
```

This change must be applied **identically** in:
1. `backend/ranker/Application/Listings/GetWebsiteProfileQueryHandler.cs` — `SlugifyUrl` (static method, also called from `SitemapController`)
2. `ranker.ui/src/app/features/leaderboard/leaderboard.component.ts` — `slugifyUrl`
3. `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts` — `slugifyUrl`
4. `ranker.ui/src/app/features/listing-detail/listing-detail.component.ts` — `getProfileSlug`
5. `ranker.ui/src/app/features/website-profile/website-profile.component.ts` — `getProfileSlug`

There is no DB migration needed; the slug is computed on-the-fly, never stored.

### Option B — Route by listing ID

Use the numeric `listingId` in the profile URL (`/website/:id`) instead of a slug. This is collision-free by definition. Downside: loses the SEO-friendly slug format.

### Shared utility (code quality, not a fix by itself)

`slugifyUrl` is duplicated across at least four TypeScript files with identical logic. It should be extracted to `ranker.ui/src/app/core/utils/url.utils.ts` (where `resolveUrl` already lives) so there is one source of truth to fix.

---

## Files Involved

| File | Role |
|------|------|
| `backend/ranker/Application/Listings/GetWebsiteProfileQueryHandler.cs` | Backend slug-to-profile lookup + `SlugifyUrl` definition |
| `backend/ranker/Controllers/SitemapController.cs` | Also calls `SlugifyUrl`; deduplicates by slug (secondary symptom) |
| `ranker.ui/src/app/features/leaderboard/leaderboard.component.ts` | `slugifyUrl` — builds profile link in category leaderboard |
| `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts` | `slugifyUrl` — builds profile link in global leaderboard |
| `ranker.ui/src/app/features/listing-detail/listing-detail.component.ts` | `getProfileSlug` — builds profile link on listing detail page |
| `ranker.ui/src/app/features/website-profile/website-profile.component.ts` | `getProfileSlug` — builds profile links for related listings |
| `ranker.ui/src/app/app.routes.ts` | Route definition `/website/:slug` |
| `backend/ranker/Domain/Entities/Listing.cs` | Listing entity — `Url` is the stored field; no separate slug column |
