# Leaderboard Card URL Bug Investigation

## Summary

**Root cause:** Product URLs are stored in the database without a protocol prefix (e.g., `zcoder.in` instead of `https://zcoder.in`). When `window.open('zcoder.in', '_blank')` is called, the browser interprets the protocol-less string as a *relative path*, appending it to the current page origin — resulting in `https://rankup.cyou/zcoder.in` instead of `https://zcoder.in`.

This is a **frontend URL normalization bug** in `openListing()` (and in `[href]` bindings). The `category-directory` component already has the correct fix pattern (`resolveUrl()`). It was simply never applied to the leaderboard components.

---

## Evidence

### 1. Where the bug manifests — `openListing()` in global-leaderboard

**File:** `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts`
**Lines 1183–1189:**

```typescript
openListing(row: FeedRow): void {
  window.open(row.listingUrl, '_blank', 'noopener,noreferrer');  // ← no protocol check
  this.listingService.recordClick(row.listingId).subscribe((count) => {
    this.clickCounts.update((map) => ({ ...map, [row.listingId]: count }));
  });
}
```

`row.listingUrl` is passed directly. If it is `zcoder.in`, the browser resolves it relative to the current origin (`https://rankup.cyou`), producing `https://rankup.cyou/zcoder.in`.

### 2. Same bug in the anchor `[href]` bindings

In the same HTML template (`global-leaderboard.component.html`), every rank card also has anchor links bound directly to the raw URL:

```html
<a [href]="row.listingUrl" target="_blank" rel="noopener" class="payload-title" ...>
<a [href]="row.listingUrl" target="_blank" rel="noopener" class="meta-chip meta-chip--link" ...>
```

Because `[href]` bindings in Angular set the href attribute directly, a protocol-less URL like `zcoder.in` is again treated as a relative path by the browser.

### 3. The same bug exists in the category leaderboard and daily listings

**`ranker.ui/src/app/features/leaderboard/leaderboard.component.ts` — line 700:**
```typescript
openListing(entry: LeaderboardEntryDto): void {
  window.open(entry.listingUrl, '_blank', 'noopener,noreferrer');  // ← same issue
  ...
}
```

**`ranker.ui/src/app/features/leaderboard/leaderboard.component.html`** — contains multiple `[href]="entry.listingUrl"` bindings.

**`ranker.ui/src/app/features/daily-listings/daily-listings.component.ts` — line 103:**
```typescript
openListing(entry: DailyListingEntryDto): void {
  window.open(entry.listingUrl, '_blank', 'noopener,noreferrer');  // ← same issue
  ...
}
```

**`ranker.ui/src/app/features/website-profile/website-profile.component.ts` — line 139:**
```typescript
openExternalUrl(url: string, id: number): void {
  window.open(url, '_blank', 'noopener');  // ← same issue
  ...
}
```

### 4. Root cause: no protocol normalization when URLs are stored

**`ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts` — `proceedToCheckout()` (~line 415):**

When a user submits a claim, `domainUrl().trim()` is sent as `listingUrl` to the backend without any `https://` normalization:

```typescript
const metadata: Record<string, string> = {
  ...
  listingUrl: domain,   // domain = this.domainUrl().trim() — no protocol check
  ...
};
```

**`ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts` — `isHeroUrlValid()` (~line 598):**

The `isHeroUrlValid()` computed accepts bare domain names as valid (via a regex fallback):

```typescript
return /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}(\/\S*)?$/.test(v);
```

So `zcoder.in` is accepted, submitted as-is to the backend, and stored in the database without a protocol prefix.

**`ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts` — `claimRank()` (~line 1159):**

```typescript
this.modalService.openClaimModal({
  ...
  listingUrl: url,   // url = this.heroUrl().trim() — protocol not guaranteed
  ...
});
```

**Backend — `PlaceClaimCommandHandler.cs` line 166:**

```csharp
Url = command.ListingUrl!,  // stored verbatim — no normalization
```

### 5. The correct fix pattern already exists in `category-directory`

**File:** `ranker.ui/src/app/features/category-directory/category-directory.component.ts`
**Lines 122–132:**

```typescript
resolveUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('@')) {
    return `https://x.com/${trimmed.substring(1)}`;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
```

The `category-directory.component.html` uses `[href]="resolveUrl(entry.listingUrl)"` instead of `[href]="entry.listingUrl"`, which correctly handles protocol-less URLs.

### 6. `formatDomain()` and `slugifyUrl()` already handle this — but `openListing()` does not

Both `formatDomain()` and `slugifyUrl()` add `https://` before parsing the URL for display. Only `openListing()` and the `[href]` bindings are missing this guard.

---

## Affected Files

| File | Issue |
|---|---|
| `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts` | `openListing()` and `openListingDirect()` pass raw URL to `window.open()` |
| `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.html` | Multiple `[href]="row.listingUrl"` bindings |
| `ranker.ui/src/app/features/leaderboard/leaderboard.component.ts` | `openListing()` and `openChampionUrl()` pass raw URL |
| `ranker.ui/src/app/features/leaderboard/leaderboard.component.html` | Multiple `[href]="entry.listingUrl"` bindings |
| `ranker.ui/src/app/features/daily-listings/daily-listings.component.ts` | `openListing()` passes raw URL |
| `ranker.ui/src/app/features/daily-listings/daily-listings.component.html` | `[href]="entry.listingUrl"` binding |
| `ranker.ui/src/app/features/website-profile/website-profile.component.ts` | `openExternalUrl()` passes raw URL |
| `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts` | URL sent to backend without `https://` prefix (root storage cause) |
| `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts` | `claimRank()` passes raw `heroUrl()` to modal |

---

## Recommended Fixes

### Fix A — Normalize at display/open time (fixes the symptom immediately, minimal risk)

Add a shared `resolveUrl()` helper (extract from category-directory or add to a shared utility) and apply it:

1. In every `openListing()` / `openListingDirect()` / `openExternalUrl()` method:
   ```typescript
   openListing(row: FeedRow): void {
     const url = this.resolveUrl(row.listingUrl);
     window.open(url, '_blank', 'noopener,noreferrer');
     ...
   }
   ```

2. In every `[href]` binding in the HTML templates, replace:
   ```html
   [href]="row.listingUrl"
   ```
   with:
   ```html
   [href]="resolveUrl(row.listingUrl)"
   ```
   (following the existing pattern in `category-directory.component.html`)

The `resolveUrl()` helper is already well-written in `category-directory.component.ts`. It can be extracted to a shared utility (`ranker.ui/src/app/core/utils/url.utils.ts`) and reused across components.

### Fix B — Normalize at submission time (fixes the root cause in storage)

In `confirm-claim-modal.component.ts`, `proceedToCheckout()`, normalize `domain` before submitting:

```typescript
const domain = this.resolveUrl(this.domainUrl().trim());
```

Similarly, in `global-leaderboard.component.ts`, `claimRank()`:

```typescript
const url = this.heroUrl().trim();
const normalizedUrl = !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('@')
  ? 'https://' + url
  : url;
```

Then pass `normalizedUrl` instead of `url` to `openClaimModal()`.

**Recommendation:** Apply both fixes. Fix A is the safest immediate patch (handles existing malformed data in the DB). Fix B prevents new protocol-less URLs from being stored going forward. Together they provide defense in depth.

---

## Conclusion

The bug is a missing `https://` protocol prefix on the `listingUrl` field. When stored without a protocol and used as-is in `window.open()` or `[href]`, the browser treats it as a relative URL and prepends the app's own origin (`https://rankup.cyou`). The fix is to normalize the URL to include `https://` at both storage time (Fix B) and display/open time (Fix A). The correct pattern is already implemented in `category-directory.component.ts`'s `resolveUrl()` method and can be reused directly.
