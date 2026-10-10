# Investigation Report: Global Leaderboard Rank & Claim Section Label

## Summary

**Bug 1 – Global spot-rank includes category filter (wrong):**  
In `GlobalLeaderboardComponent`, the `spotRank` signal uses `selectedSlug` (the tab/category filter for the leaderboard display) as the `categorySlug` parameter sent to `GET /api/leaderboard/spot-rank`. When the user is on the global leaderboard view (`selectedSlug === null`) the parameter is `null`, which is correct. But when the user has clicked a category tab to filter the display (e.g., "SaaS"), that category slug is also sent to the spot-rank API — so the rank shown in the "Claim #X Spot for…" headline is filtered to that category, not the global rank. The fix: the `categorySlug` passed to `getSpotRank` should be taken from `claimSlug` (the category chosen in the claim form) rather than `selectedSlug` (the leaderboard view tab).

**Bug 2 – Claim section headline has no Today's / Global prefix:**  
The `<h1>` in the global-leaderboard template reads a static `Claim #X Spot for ₹…` with no mode prefix. There is no conditional logic to prepend "Today's" or "Global" based on `timeMode`. The fix: conditionally render `Today's Claim #X …` when `timeMode() === 'today'` and `Global Claim #X …` when `timeMode() === 'alltime'`.

---

## Evidence

### 1. Global Leaderboard Component

**File:** `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts`

#### `selectedSlug` vs `claimSlug` signals (lines ~215, ~260)

```typescript
// Line ~215 – tracks the leaderboard TAB currently selected by the user
readonly selectedSlug = signal<string | null>(null);

// Line ~260 – tracks the category chosen in the CLAIM FORM
readonly claimSlug = signal<string | null>(null);
```

These are two distinct signals. `selectedSlug` controls which leaderboard data is displayed; `claimSlug` controls which category the user wants to claim a rank in. They are independent: the user can be browsing "SaaS" entries while having "Tools" selected in the claim form.

#### `spotRank` computed signal (lines 507–532)

```typescript
readonly spotRank = toSignal(
  toObservable(this.effectiveClaimAmount).pipe(
    combineLatestWith(
      toObservable(this.timeMode),
      toObservable(this.selectedSlug),   // ← BUG: uses leaderboard tab slug
    ),
    map(([amount, timeMode, selectedSlug]) => ({
      amount: amount ?? 0,
      timeMode,
      categorySlug: selectedSlug,        // ← forwarded as categorySlug
    })),
    // ...
    switchMap(({ amount, timeMode, categorySlug }) => {
      if (amount <= 0) return of(null);
      return this.leaderboardService.getSpotRank(amount, timeMode, categorySlug).pipe(
        catchError(() => of(null))
      );
    }),
    map((res) => res?.rank ?? null),
  ),
  { initialValue: null },
);
```

When `selectedSlug` is non-null (user has a category tab active), the spot-rank request becomes a **category-scoped** rank, not a global rank. The headline then shows a misleading category rank as if it were global.

**Fix:** Replace `toObservable(this.selectedSlug)` with `toObservable(this.claimSlug)` in this pipeline, so spot-rank reflects the category the user actually intends to claim in (or global when no category is chosen in the form).

---

### 2. Claim Rank Section Headline (Global Leaderboard)

**File:** `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.html`

#### Line 16–17

```html
<h1 class="headline-title">
  Claim <span class="headline-rank-tag">{{ spotRank() !== null ? '#' + spotRank() : '#…' }}</span> Spot for
</h1>
```

The text is static: **"Claim #X Spot for"** — no conditional prefix. There is no reference to `timeMode()` in this element.

The `timeMode` signal is declared in the component:

```typescript
// global-leaderboard.component.ts, line ~109
readonly timeMode = signal<'today' | 'alltime'>('today');
```

And it is used in other parts of the template (e.g. the leaderboard stage title at line ~178):

```html
{{ timeMode() === 'today' ? "Today's Live Leaderboard" : "All-Time Global Pantheon" }}
```

…but **not** in the claim headline. The fix should apply the same pattern to line 17:

```html
<h1 class="headline-title">
  {{ timeMode() === 'today' ? "Today's" : "Global" }} Claim
  <span class="headline-rank-tag">{{ spotRank() !== null ? '#' + spotRank() : '#…' }}</span> for
</h1>
```

---

### 3. Category-Specific Leaderboard Component (for comparison)

**File:** `ranker.ui/src/app/features/leaderboard/leaderboard.component.ts` (lines 271–293)

```typescript
readonly spotRank = toSignal(
  toObservable(this.effectiveClaimAmount).pipe(
    combineLatestWith(
      toObservable(this.timeMode),
      toObservable(this.categorySlug),  // ← category page slug (always set)
    ),
    // ...
    switchMap(({ amount, timeMode, categorySlug }) => {
      if (amount <= 0 || !categorySlug) return of(null);   // guards null
      return this.leaderboardService.getSpotRank(amount, timeMode, categorySlug).pipe(
        catchError(() => of(null))
      );
    }),
```

**File:** `ranker.ui/src/app/features/leaderboard/leaderboard.component.html` (line 28)

```html
Top {{ categoryName() }} Rankings: Claim <span class="headline-rank-tag">{{ spotRank() !== null ? '#' + spotRank() : '#…' }}</span> Spot for
```

The category leaderboard page does not need the Today's/Global prefix because its headline already names the category. The global leaderboard is the one that needs the fix.

---

### 4. `LeaderboardService.getSpotRank` API Call

**File:** `ranker.ui/src/app/core/services/leaderboard.service.ts` (lines 65–83)

```typescript
getSpotRank(
  amount: number,
  timeMode = 'today',
  categorySlug?: string | null,
  listingId?: number | null,
): Observable<SpotRankDto> {
  const params: Record<string, string> = {
    amount: String(amount),
    timeMode,
  };
  if (categorySlug?.trim()) {
    params['categorySlug'] = categorySlug.trim();
  }
  // ...
  return this.http.get<SpotRankDto>(`${API_BASE_URL}/api/leaderboard/spot-rank`, { params });
}
```

When `categorySlug` is `null` or empty, the parameter is omitted — the backend then computes the **global** rank. When a non-null `categorySlug` is sent, the backend computes a **category** rank. So the API design is correct; the frontend just passes the wrong slug.

---

## Conclusions & Recommended Fixes

### Fix 1 — Use `claimSlug` (not `selectedSlug`) for spot-rank

**File to change:** `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts`

**Lines 507–532** — the `spotRank` signal pipeline.

Change:
```typescript
combineLatestWith(
  toObservable(this.timeMode),
  toObservable(this.selectedSlug),   // ← remove this
),
map(([amount, timeMode, selectedSlug]) => ({
  amount: amount ?? 0,
  timeMode,
  categorySlug: selectedSlug,        // ← remove this
})),
```

To:
```typescript
combineLatestWith(
  toObservable(this.timeMode),
  toObservable(this.claimSlug),      // ← use claim form's category
),
map(([amount, timeMode, claimSlug]) => ({
  amount: amount ?? 0,
  timeMode,
  categorySlug: claimSlug,           // ← global when null, category when chosen
})),
```

This makes `spotRank` reflect:
- A **global** rank when the user hasn't selected a claim category (null).
- A **category** rank only when the user explicitly picks a category in the claim form — which is the correct and useful behavior.

---

### Fix 2 — Prefix claim headline with Today's / Global

**File to change:** `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.html`

**Line 16–17** — the `<h1>` element.

Change:
```html
<h1 class="headline-title">
  Claim <span class="headline-rank-tag">{{ spotRank() !== null ? '#' + spotRank() : '#…' }}</span> Spot for
</h1>
```

To:
```html
<h1 class="headline-title">
  {{ timeMode() === 'today' ? "Today's" : "Global" }} Claim
  <span class="headline-rank-tag">{{ spotRank() !== null ? '#' + spotRank() : '#…' }}</span> for
</h1>
```

This produces:
- **Today mode:** `Today's Claim #3 for ₹…`
- **All-time mode:** `Global Claim #3 for ₹…`

---

## Files Affected

| File | Change |
|------|--------|
| `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts` | Lines 507–532: replace `selectedSlug` with `claimSlug` in `spotRank` pipeline |
| `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.html` | Line 16–17: add conditional `Today's` / `Global` prefix to the `<h1>` headline |
