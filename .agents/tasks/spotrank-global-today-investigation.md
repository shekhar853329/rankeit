# Investigation: GetSpotRank — Global Leaderboard Today Mode Category Slug Bug

## Summary Answer

**There is a confirmed asymmetry between how the global leaderboard sends `categorySlug` to `GetSpotRank` for `today` vs `alltime` mode.**

- In **alltime** mode: `categorySlug` is **explicitly forced to `null`** — the backend ranks globally across all listings.
- In **today** mode: `categorySlug` is **passed as `claimSlug`** (the user's currently selected claim category, which may be non-null) — this scopes the rank to a specific category instead of ranking globally across today's listings.

This means that when a user is on the **global leaderboard** with **today time mode** and has selected a claim category (via the category dropdown), `GetSpotRank` scopes the rank to that category rather than computing a global today rank. The user sees a rank that appears lower (or incorrect) because it is only counting listings within that category, not all of today's listings globally.

The fix, as described in the original request, is to also send `null` as `categorySlug` when `timeMode === 'today'` on the **global leaderboard** — matching the `alltime` behavior.

---

## Evidence

### 1. Global Leaderboard `spotRank` Signal — `global-leaderboard.component.ts`

**File:** `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts`  
**Lines ~507–530**

```typescript
readonly spotRank = toSignal(
  toObservable(this.effectiveClaimAmount).pipe(
    combineLatestWith(
      toObservable(this.timeMode),
      toObservable(this.claimSlug),
    ),
    map(([amount, timeMode, claimSlug]) => ({
      amount: amount ?? 0,
      timeMode,
      categorySlug: timeMode === 'alltime' ? null : claimSlug,  // <-- BUG HERE
    })),
    ...
    switchMap(({ amount, timeMode, categorySlug }) => {
      if (amount <= 0) return of(null);
      return this.leaderboardService.getSpotRank(amount, timeMode, categorySlug).pipe(...);
    }),
```

**The bug is on this line:**
```typescript
categorySlug: timeMode === 'alltime' ? null : claimSlug,
```

When `timeMode === 'today'`, it passes `claimSlug` — which is the user's currently selected claim category (a non-null string like `"electronics"`). This scopes `GetSpotRank` to that category's today listings only, not the global today feed.

When `timeMode === 'alltime'`, it correctly passes `null`, so the backend ranks globally.

The correct behavior for the global leaderboard in **both** modes is to send `null` for `categorySlug`, so that `GetSpotRank` always computes the rank across the full dataset (global scope).

---

### 2. Category-Specific Leaderboard `spotRank` Signal — `leaderboard.component.ts`

**File:** `ranker.ui/src/app/features/leaderboard/leaderboard.component.ts`  
**Lines ~271–296**

```typescript
readonly spotRank = toSignal(
  toObservable(this.effectiveClaimAmount).pipe(
    combineLatestWith(
      toObservable(this.timeMode),
      toObservable(this.categorySlug),
    ),
    map(([amount, timeMode, categorySlug]) => ({
      amount: amount ?? 0,
      timeMode,
      categorySlug,                // Always passes the category slug (correct for category page)
    })),
    ...
    switchMap(({ amount, timeMode, categorySlug }) => {
      if (amount <= 0 || !categorySlug) return of(null);
      return this.leaderboardService.getSpotRank(amount, timeMode, categorySlug).pipe(...);
    }),
```

On the **category leaderboard page**, `categorySlug` is always passed (for both `today` and `alltime`) — this is **correct** because this page is scoped to a single category. This is not the bug; it is working as intended.

---

### 3. `LeaderboardService.getSpotRank` — `leaderboard.service.ts`

**File:** `ranker.ui/src/app/core/services/leaderboard.service.ts`  
**Lines ~65–83**

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
  if (categorySlug?.trim()) {           // Only adds categorySlug param if non-null/non-empty
    params['categorySlug'] = categorySlug.trim();
  }
  ...
  return this.http.get<SpotRankDto>(`${API_BASE_URL}/api/leaderboard/spot-rank`, { params });
}
```

The service correctly omits the `categorySlug` query parameter when the value is `null` or empty. So if `null` is passed from the component, the backend receives no `categorySlug` parameter, and the rank is computed globally.

---

### 4. Backend Controller — `LeaderboardController.cs`

**File:** `backend/ranker/Controllers/LeaderboardController.cs`  
**Lines ~68–76**

```csharp
[HttpGet("spot-rank")]
public async Task<ActionResult<SpotRankDto>> GetSpotRank(
    [FromQuery] decimal amount,
    [FromQuery] string timeMode = "today",
    [FromQuery] string? categorySlug = null,    // Nullable — defaults to null (global scope)
    [FromQuery] int? listingId = null,
    CancellationToken ct = default) =>
    Ok(await sender.Send(new GetSpotRankQuery(amount, timeMode, categorySlug, listingId), ct));
```

`categorySlug` defaults to `null`. When absent from the query string, the handler operates globally.

---

### 5. Backend Query Handler — `GetSpotRankQueryHandler.cs`

**File:** `backend/ranker/Application/Leaderboards/GetSpotRankQueryHandler.cs`  
**Lines ~12–57 (full handler)**

```csharp
public async Task<SpotRankDto> Handle(GetSpotRankQuery request, CancellationToken ct)
{
    var timeMode = request.TimeMode?.ToLowerInvariant() == "alltime" ? "alltime" : "today";
    var query = dbContext.Listings.AsNoTracking();

    // Scope to category only if categorySlug is provided
    if (!string.IsNullOrWhiteSpace(request.CategorySlug))
    {
        var category = await categoryRepository.GetBySlugAsync(request.CategorySlug.Trim(), ct);
        if (category != null)
        {
            query = query.Where(l => l.CategoryId == category.Id);
        }
    }

    ...

    if (timeMode == "today")
    {
        var todayUtc = DateTime.UtcNow.Date;
        query = query.Where(l => l.LastClaimAt >= todayUtc);
        higherOrEqualCount = await query.CountAsync(
            l => (l.Claims
                .Where(c => c.CreatedAt >= todayUtc)
                .Sum(c => ...) ?? 0m) >= targetAmount,
            ct);
    }
    else
    {
        // All-time: count listings where CurrentClaimAmount >= targetAmount.
        higherOrEqualCount = await query.CountAsync(l => l.CurrentClaimAmount >= targetAmount, ct);
    }

    var rank = higherOrEqualCount + 1;
    return new SpotRankDto(rank, request.Amount, timeMode, request.CategorySlug);
}
```

**Key behavior:** When `categorySlug` is non-null, the handler filters `query` to only that category's listings — for **both** time modes. When `categorySlug` is null, it runs against all listings (global scope) — for **both** time modes. This is the correct and desired backend logic. The problem is entirely in what the frontend sends.

---

## Root Cause

In `global-leaderboard.component.ts`, the `spotRank` computed observable has this logic:

```typescript
categorySlug: timeMode === 'alltime' ? null : claimSlug,
```

**This only nulls out the slug for `alltime` mode.** For `today` mode, it passes `claimSlug` — the user's selected claim-category dropdown value (e.g. `"electronics"`). This causes the backend to scope the today rank to that category instead of computing a global today rank.

The **intended behavior for the global leaderboard** is that spot rank is always computed globally (no category scoping), regardless of which time mode is active. The category dropdown is for choosing where to *submit a claim*, not for filtering the rank calculation.

---

## Conclusions

| Context | Today Mode categorySlug | Alltime Mode categorySlug | Correct? |
|---|---|---|---|
| **Global leaderboard** (`global-leaderboard.component.ts`) | `claimSlug` (non-null if user picked a category) | `null` | ❌ Today mode is wrong |
| **Category leaderboard** (`leaderboard.component.ts`) | `categorySlug` (the page's category) | `categorySlug` (same) | ✅ Both correct |

---

## Recommended Fix

In `global-leaderboard.component.ts`, change the `map` inside the `spotRank` observable from:

```typescript
map(([amount, timeMode, claimSlug]) => ({
  amount: amount ?? 0,
  timeMode,
  categorySlug: timeMode === 'alltime' ? null : claimSlug,  // WRONG
})),
```

To:

```typescript
map(([amount, timeMode, claimSlug]) => ({
  amount: amount ?? 0,
  timeMode,
  categorySlug: null,  // Always null for global leaderboard — rank is global regardless of mode
})),
```

Since `claimSlug` is no longer used in the map, the `combineLatestWith(toObservable(this.claimSlug))` dependency can also be removed — though it is harmless to leave it in.

**No backend changes are required.** The backend already handles `null` categorySlug correctly for both time modes (global scope).

---

## Files Involved

| File | Role |
|---|---|
| `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts` | **Bug location** — line with `categorySlug: timeMode === 'alltime' ? null : claimSlug` |
| `ranker.ui/src/app/features/leaderboard/leaderboard.component.ts` | Reference implementation (correct for category page, not affected) |
| `ranker.ui/src/app/core/services/leaderboard.service.ts` | Frontend service — correctly omits `categorySlug` param when null |
| `backend/ranker/Controllers/LeaderboardController.cs` | Backend endpoint — correctly accepts optional `categorySlug` |
| `backend/ranker/Application/Leaderboards/GetSpotRankQueryHandler.cs` | Backend handler — correctly scopes by category only when slug is non-null |
| `backend/ranker/Application/Leaderboards/GetSpotRankQuery.cs` | Backend query record — `CategorySlug` is nullable |
