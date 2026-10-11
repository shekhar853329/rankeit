# Global Leaderboard – Unmasked Payment ID Investigation

## Summary Answer

The full unmasked Payment ID appearing in the Global Leaderboard chart tooltip comes from **`GetPlatformStatsQueryHandler.cs`** (Application/Leaderboards/GetPlatformStatsQuery.cs, ~line 196–204).

The handler builds a `ClaimTimelinePointDto` list for the "Recent Claims Timeline" chart series and passes `x.Claim.PaymentReference` **raw** — without calling `PaymentIdMasker.Mask()`. That unmasked reference flows into `PlatformStatsDto.RecentClaimsTimeline`, is returned by the `/api/leaderboard/stats` and `/api/leaderboard/category/{slug}/stats` endpoints, and is then rendered verbatim inside the ECharts tooltip HTML in the frontend.

The same bug exists on the **Category Leaderboard** page (`leaderboard.component.ts`), which consumes the same `/stats` endpoint — so both pages are affected.

---

## Evidence

### 1. Backend – where the unmasked reference is set

**File:** `c:\Users\shekh\source\repos\rankeit\backend\ranker\Application\Leaderboards\GetPlatformStatsQuery.cs`

```csharp
// Lines ~196–204 (inside GetPlatformStatsQueryHandler.Handle)
var recentTimeline = timelineSource
    .OrderBy(x => x.Claim.CreatedAt)
    .Take(150)
    .Select(x => new ClaimTimelinePointDto(
        x.Claim.Id,
        x.Claim.ListingId,
        x.Claim.Listing?.Name ?? "Listing",
        x.Claim.Listing?.Category?.Name ?? (category?.Name ?? "General"),
        x.ActualPaid,
        x.Claim.CreatedAt,
        x.Claim.PaymentReference,   // ← RAW, unmasked PaymentReference
        x.Claim.Amount))
    .ToList();
```

The field `x.Claim.PaymentReference` is the raw value from the `Claim` entity's `PaymentReference` column. There is no call to `PaymentIdMasker.Mask()` here.

### 2. Backend – the DTO that carries it out

**File:** `c:\Users\shekh\source\repos\rankeit\backend\ranker\Dtos\PlatformStatsDto.cs`

```csharp
public sealed record ClaimTimelinePointDto(
    int Id,
    int ListingId,
    string ListingName,
    string CategoryName,
    decimal Amount,
    DateTime CreatedAt,
    string? PaymentReference,   // ← unmasked value stored here
    decimal CurrentClaimLevel = 0m);
```

### 3. Backend – the API endpoints that expose it

**File:** `c:\Users\shekh\source\repos\rankeit\backend\ranker\Controllers\LeaderboardController.cs`

```
GET /api/leaderboard/stats?categorySlug=&timeMode=
GET /api/leaderboard/category/{categorySlug}/stats?timeMode=
```

Both endpoints call `GetPlatformStatsQuery` and return the full `PlatformStatsDto`, which includes `recentClaimsTimeline` with the unmasked `paymentReference` on every entry.

### 4. Frontend – Global Leaderboard tooltip rendering

**File:** `c:\Users\shekh\source\repos\rankeit\ranker.ui\src\app\features\global-leaderboard\global-leaderboard.component.ts`

Line ~1682:
```typescript
${raw.paymentReference
  ? `<div>💳 <b>Payment ID:</b> <code ...>${raw.paymentReference}</code></div>`
  : ''}
```

The `raw` object here is a `ClaimTimelinePointDto` from the chart series data. `raw.paymentReference` is the full, unmasked value returned by the API — exactly matching what the screenshot shows (e.g. `pay_0NpVc4vS6qd61rV4lVFU8`).

### 5. Frontend – Category Leaderboard tooltip rendering (same pattern)

**File:** `c:\Users\shekh\source\repos\rankeit\ranker.ui\src\app\features\leaderboard\leaderboard.component.ts`

Line ~982:
```typescript
${raw.paymentReference
  ? `<div>💳 <b>Payment ID:</b> <code ...>${raw.paymentReference}</code></div>`
  : ''}
```

Identical pattern — this page is **also** affected.

### 6. What is already masked (for context)

The `PaymentIdMasker.Mask()` utility was already applied correctly in:
- `GetPaymentTransactionsQueryHandler.cs` — masks `PaymentId`, `SessionId`, `OrderId`
- `GetListingDetailQueryHandler.cs` — masks `PaymentReference` in claim history (line 57)
- `GetDodoSessionStatusQueryHandler.cs` — masks session IDs
- `VerifyDodoPaymentCommandHandler.cs` — masks IDs in response DTOs

The `GetPlatformStatsQueryHandler.cs` was missed.

---

## Root Cause

`GetPlatformStatsQueryHandler` was added (or modified) after the masking policy was implemented for other handlers. The developer who wired up the `ClaimTimelinePointDto` series did not apply `PaymentIdMasker.Mask()` to the `PaymentReference` field before populating the DTO.

---

## Conclusions

| Item | Status |
|---|---|
| `GetGlobalLeaderboardQueryHandler.cs` | ✅ Clean — no payment IDs in `GlobalLeaderboardEntryDto` |
| `GetCategoryLeaderboardQueryHandler.cs` | ✅ Clean — no payment IDs in `LeaderboardEntryDto` |
| `GetSpotRankQueryHandler.cs` | ✅ Clean — no payment IDs |
| `GetDailyListingsQueryHandler.cs` | ✅ Clean — no payment IDs |
| `GetRecentClaimsQueryHandler.cs` | ✅ Clean — no payment IDs in `LiveClaimEventDto` |
| `PlaceClaimCommandHandler.cs` | ✅ Clean — result DTO has no payment IDs |
| **`GetPlatformStatsQueryHandler.cs`** | ❌ **LEAKS full `PaymentReference` via `ClaimTimelinePointDto.PaymentReference`** |

---

## Recommended Fix

**One-line fix in the backend — no frontend changes required.**

In `GetPlatformStatsQuery.cs`, change the `ClaimTimelinePointDto` construction to mask the reference before assigning it:

```csharp
// Before (line ~202):
x.Claim.PaymentReference,

// After:
PaymentIdMasker.Mask(x.Claim.PaymentReference),
```

This requires adding `using Ranker.Application.Common;` at the top of the file if not already present.

**Add a `using` statement:**
```csharp
using Ranker.Application.Common;
```

After this fix, the frontend will receive e.g. `****lVFU8` instead of `pay_0NpVc4vS6qd61rV4lVFU8` — matching the masking behaviour already applied to other handlers. No frontend changes are needed because the tooltip already conditionally renders the `paymentReference` field; it will just show the masked value automatically.

**Files to change:**
- `c:\Users\shekh\source\repos\rankeit\backend\ranker\Application\Leaderboards\GetPlatformStatsQuery.cs` — apply `PaymentIdMasker.Mask()` at the one assignment site.

**Files that do NOT need changes:**
- `global-leaderboard.component.ts` — the tooltip HTML is fine; it just needs masked data from the API.
- `leaderboard.component.ts` — same as above; both will be fixed by the single backend change.
