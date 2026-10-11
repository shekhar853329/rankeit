# URL normalization for leaderboard card navigation

Bare domain strings like `zcoder.in` were being passed raw to `window.open()` and Angular `[href]` bindings, causing the browser to resolve them relative to the app's origin and producing URLs like `https://rankup.cyou/zcoder.in`. The fix introduces a shared `resolveUrl()` utility that prefixes bare domains with `https://`, passes through already-prefixed URLs unchanged, and converts `@handle` strings to `https://x.com/handle`. All affected components were updated to use it at both `window.open()` call sites and template `[href]` bindings.

Watch for: `listing-detail.component.ts` does **not** expose `resolveUrl` as a class property (confirmed) — safe today because its template uses `(click)="openExternalUrl()"` rather than a direct `[href]` binding. A future `[href]` addition would silently bind to `undefined`.

**Verdict**: APPROVED

---

## High-level view

`resolveUrl()` handles null/undefined/empty input by returning `''`, which is safe for Angular `[href]` — the anchor renders inert rather than navigating to a relative path. One input class is not covered: protocol-relative strings like `//cdn.example.com` would become `https:////cdn.example.com`. This is unlikely in the listing URL dataset (user-supplied domains, not CDN paths) but is a possible edge case to watch if input validation is ever loosened.

Every `window.open()` call across global-leaderboard, leaderboard, daily-listings, website-profile, and listing-detail now passes through `resolveUrl`. All `[href]` bindings in the corresponding templates are confirmed wrapped. The category-directory component uses a thin delegating method rather than a bare class property, which is equivalent and valid.

`listing-detail` is the only component that imports `resolveUrl` without exposing it as a class property. The template there uses a button rather than an anchor, so no property is needed today. The asymmetry with every other component is a forward trap: a developer adding `[href]="resolveUrl(l.listingUrl)"` following the established pattern would get `undefined` at runtime with no compile error.

---

<details>
<summary>Issues (2)</summary>

1. **Missing `resolveUrl` property in `listing-detail`** — `listing-detail.component.ts` imports `resolveUrl` and uses it in `openExternalUrl()` but never exposes it as `readonly resolveUrl = resolveUrl`. The template currently uses a button click handler so this doesn't break anything, but it diverges from every other component in this change and creates a silent failure trap for any future `[href]` addition. Add the property declaration to match the pattern. (confirmed)

2. **Protocol-relative URL edge case in `resolveUrl()`** — A value like `//example.com` will be prepended with `https://` and produce `https:////example.com`. Production listing data is unlikely to include protocol-relative strings, but if input validation rules are ever relaxed, this case would silently produce a broken URL instead of the expected `https://example.com`. (possible)

</details>

---

<details>
<summary>Details</summary>

### `listing-detail` property exposure gap

`listing-detail.component.ts` imports `resolveUrl` at the module level and calls it inside `openExternalUrl()`, but does not declare `readonly resolveUrl = resolveUrl`. The template uses `<button (click)="openExternalUrl(l.listingUrl, l.listingId)">` rather than `[href]`, so the template property is not currently needed.

The risk is pattern divergence. All six other components in this change expose `readonly resolveUrl = resolveUrl` as a class property. A developer copying that pattern into `listing-detail.html` would write `[href]="resolveUrl(l.listingUrl)"`, which Angular would evaluate at runtime and find `undefined` — TypeScript won't catch it because `resolveUrl` isn't in the component's type but also isn't an error. The resulting `[href]="undefined"` silently navigates to `/undefined` or is dropped by the browser. Adding `readonly resolveUrl = resolveUrl;` to the class costs nothing and makes the component consistent.

### Protocol-relative URL edge case

`resolveUrl()` checks for `http://` and `https://` prefixes and falls through to prepending `https://` for everything else. A protocol-relative URL like `//example.com` doesn't start with either prefix, so it receives the `https://` prepend and becomes `https:////example.com` — a malformed URL that the browser will reject.

This is marked **possible** rather than confirmed because listing URLs in the current dataset are expected to be either bare domains or fully-qualified URLs. If a user submits `//example.com` the URL would be stored as-is and then broken at display time. A guard of `trimmed.startsWith('//')` returning `https:${trimmed}` would close this without other side effects.

</details>

---

<details>
<summary>File map</summary>

| File | What changed |
|---|---|
| `core/utils/url.utils.ts` | New shared `resolveUrl()` utility function |
| `global-leaderboard.component.ts` | Import + class property + `openListing()` + `openListingDirect()` use `resolveUrl` |
| `global-leaderboard.component.html` | 5 `[href]` bindings wrapped in `resolveUrl()` |
| `leaderboard.component.ts` | Import + class property + `openListing()` + `openChampionUrl()` use `resolveUrl` |
| `leaderboard.component.html` | 7 `[href]` bindings wrapped in `resolveUrl()` |
| `daily-listings.component.ts` | Import + class property + `openListing()` uses `resolveUrl` |
| `daily-listings.component.html` | 1 `[href]` binding wrapped in `resolveUrl()` |
| `website-profile.component.ts` | Import + class property + `openExternalUrl()` uses `resolveUrl` |
| `website-profile.component.html` | 3 `[href]` bindings wrapped in `resolveUrl()` |
| `category-directory.component.ts` | Import aliased as `resolveUrlUtil`; delegating `resolveUrl()` method added |
| `category-directory.component.html` | 2 `[href]` bindings wrapped via `resolveUrl()` method |
| `listing-detail.component.ts` | Import + `openExternalUrl()` uses `resolveUrl`; no class property exposed |

Full diff: `git diff main` from workspace root.

</details>
