# URL Fix Verification

## Summary

Fixed leaderboard card URL bug: bare domains like `zcoder.in` were being passed raw
to `window.open()` and `[href]` bindings, causing the browser to resolve them as
relative paths and produce `https://rankup.cyou/zcoder.in` instead of `https://zcoder.in`.

## Changes Made

### New Shared Utility
- `ranker.ui/src/app/core/utils/url.utils.ts` — `resolveUrl()` function that normalises
  bare domains, `@`-handles, and passes through already-prefixed URLs unchanged.

### Components Updated
| File | Changes |
|------|---------|
| `global-leaderboard.component.ts` | Import `resolveUrl`; fix `openListing()`, `openListingDirect()`; expose `resolveUrl` as class property |
| `global-leaderboard.component.html` | Wrap all 6 `[href]="row.listingUrl"` with `resolveUrl()` |
| `leaderboard.component.ts` | Import `resolveUrl`; fix `openListing()`, `openChampionUrl()`; expose `resolveUrl` as class property |
| `leaderboard.component.html` | Wrap all 7 `[href]="entry.listingUrl"` with `resolveUrl()` |
| `daily-listings.component.ts` | Import `resolveUrl`; fix `openListing()`; expose `resolveUrl` as class property |
| `daily-listings.component.html` | Wrap the `[href]="entry.listingUrl"` with `resolveUrl()` |
| `website-profile.component.ts` | Import `resolveUrl`; fix `openExternalUrl()`; expose `resolveUrl` as class property |
| `website-profile.component.html` | Wrap all 3 `[href]="p.listingUrl"` with `resolveUrl()` |
| `category-directory.component.ts` | Import `resolveUrl as resolveUrlUtil`; delegate local `resolveUrl()` method to the shared util |
| `listing-detail.component.ts` | Import `resolveUrl`; fix `openExternalUrl()` — was missing from initial pass (review finding `listing-detail-bare-window-open`) |

## Verification Result

`npx tsc --noEmit` — **0 errors** (confirmed after review-iteration fix)
