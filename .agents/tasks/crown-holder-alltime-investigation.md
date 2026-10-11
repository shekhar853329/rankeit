# Crown Holder All-Time Investigation Report

## Summary Answer

**The bug exists in both the web frontend and the mobile app.** The "Global Crown Holder" (or "Today's Crown Holder") card feeds from the same `getGlobalLeaderboard` call that powers the main leaderboard list — it uses whatever `timeMode` the user has currently selected. When the user is in "Today" mode, the card shows the today #1 ranker, not the all-time #1. The fix is to make a **separate, dedicated call** for the crown holder card that always passes `timeMode = 'alltime'`, independent of the user's current tab selection.

---

## Evidence

### 1. Web Frontend — `global-leaderboard.component.ts`

**File:** `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts`

#### The crown holder is computed from `rows()` which reflects the current time mode

```
Line 469: readonly reigningChampion = computed<FeedRow | null>(() => {
Line 470:   if (this.searchQuery().trim() && this.leadChampion()) {
Line 471:     return this.leadChampion();
Line 472:   }
Line 473:   const r = this.rows();
Line 474:   return r.length > 0 ? r[0] : null;
Line 475: });
```

`rows()` is the computed signal for the full leaderboard list. It is populated by `loadGlobal()`:

```
Line 1233: this.leaderboardService.getGlobalLeaderboard(count + 1, this.timeMode(), query)
```

`this.timeMode()` is a signal that the user controls (`'today'` or `'alltime'`). So when the user is in "Today" mode, `reigningChampion()` returns the today #1 — not the all-time #1.

Additionally, `leadChampion` (the private signal at line 466) is **also** set from the same `loadGlobal()` call (lines 1244–1260), so even the search-query fallback path uses the time-mode-scoped data.

#### The card title is conditionally "Today's" vs "Global"

**File:** `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.html`

```
Line 708: {{hallOfFameMode() === 'alltime'? "Global": "Today's"}} Crown Holder
```

`hallOfFameMode` is an **inverted** view of `timeMode`:

```
Line 346: readonly hallOfFameMode = computed<'today' | 'alltime'>(() =>
Line 347:   this.timeMode() === 'today' ? 'alltime' : 'today'
Line 348: );
```

This means:
- User is in **Today** mode → `hallOfFameMode = 'alltime'` → title shows **"Global" Crown Holder** — but the *data* is from `timeMode = 'today'`. **Title says "Global" but data is today's.**
- User is in **All-Time** mode → `hallOfFameMode = 'today'` → title shows **"Today's" Crown Holder** — but the *data* is from `timeMode = 'alltime'`. **Title says "Today's" but data is all-time.**

So the title logic is inverted relative to the data — both are wrong when the modes don't match.

The user's screenshot showing "Today's Crown Holder" maps to the user being in **All-Time** mode in the leaderboard, where `hallOfFameMode` flips to `'today'`.

#### Note: web does have a separate `loadAllTimeHallOfFame()` helper

```
Line 1328: private loadAllTimeHallOfFame(): void {
Line 1336:   this.leaderboardService.getGlobalLeaderboard(5, 'alltime')
```

But this feeds `allTimeHallOfFame` (the Hall of Fame list panel), **not** `reigningChampion`. The crown holder spotlight card (`reigningChampion`) still derives from `rows()`.

---

### 2. Mobile App — `rankup-mob/src/app/(tabs)/index.tsx`

#### The single `getGlobalLeaderboard` call drives everything

```
Line 141: const globalRes = await getGlobalLeaderboard(30, timeMode, searchQuery);
Line 142: setGlobalEntries(globalRes || []);
```

`timeMode` is the user-controlled state variable:

```
Line 59: const [timeMode, setTimeMode] = useState<'today' | 'alltime'>('today');
```

#### The crown holder is derived from this same array

```
Line 217: const reigningChamp = globalEntries.length > 0 ? globalEntries[0] : null;
```

This variable is computed but **never rendered** — `ReigningSpotlightCard` is not used in this screen's JSX. The rank #1 display is the inline gold champion card, which also comes from `globalEntries[0]` (line ~623 in the JSX, the `isGold` branch). So:
- When `timeMode = 'today'`, the gold champion card shows today's #1.
- When `timeMode = 'alltime'`, the gold champion card shows the all-time #1.

The `ReigningSpotlightCard` component exists at `rankup-mob/src/components/ReigningSpotlightCard.tsx` with the correct "Global Crown Holder" badge text (line 55), but is currently **not rendered anywhere in the screen**.

---

### 3. Backend API

**File:** `backend/ranker/Controllers/LeaderboardController.cs`

```csharp
// Line ~27
[HttpGet("global")]
public async Task<ActionResult<IReadOnlyList<GlobalLeaderboardEntryDto>>> GetGlobalLeaderboard(
    [FromQuery] int topN = 20,
    [FromQuery] string timeMode = "today",  // ← defaults to today
    [FromQuery] string? query = null,
    ...)
```

**File:** `backend/ranker/Application/Leaderboards/GetGlobalLeaderboardQueryHandler.cs`

The handler branches on `timeMode`:
- `"today"` → filters `LastClaimAt >= todayUtc`, orders by today's paid amount.
- `"alltime"` → orders by `CurrentClaimAmount` globally across all time.

There is **no dedicated "all-time #1" endpoint** — the same `/api/leaderboard/global` endpoint is used for both modes. Passing `timeMode=alltime&topN=1` gives the all-time #1 entry.

**File:** `rankup-mob/src/services/api.ts`

```typescript
// Lines 196-201
export async function getGlobalLeaderboard(
  topN = 20,
  timeMode = 'today',   // ← defaults to today
  query?: string,
): Promise<GlobalLeaderboardEntryDto[]> {
  const params = new URLSearchParams({ topN: String(topN), timeMode });
  return request<GlobalLeaderboardEntryDto[]>(`/api/leaderboard/global?${params.toString()}`);
}
```

The API function already supports passing `'alltime'` — no backend changes are needed.

---

## Conclusions

| Platform | Component/File | Bug |
|----------|---------------|-----|
| Web (Angular) | `global-leaderboard.component.ts` lines 469–475, 1233 | `reigningChampion` computed from `rows()` which uses current `timeMode` |
| Web (Angular) | `global-leaderboard.component.html` line 708 | Title logic inverted (`hallOfFameMode` is the complement of `timeMode`) |
| Mobile (RN) | `(tabs)/index.tsx` line 141, 217 | `reigningChamp` derived from `globalEntries[0]` loaded with current `timeMode`; `ReigningSpotlightCard` not rendered |

---

## Recommendations

### Fix 1 — Web: add a dedicated `alltimeChampion` signal that always fetches `alltime`

In `global-leaderboard.component.ts`:

1. Add a private signal `readonly allTimeChampion = signal<FeedRow | null>(null)`.
2. In `ngOnInit` (or the existing data-load flow), call `getGlobalLeaderboard(1, 'alltime')` once and set `allTimeChampion` from `entries[0]`. This call never changes with `timeMode`.
3. Change `reigningChampion` to return `allTimeChampion()` (or fall back to it when no search query is active). Do not derive it from `rows()`.
4. Fix the title to always read **"Global Crown Holder"** — remove the `hallOfFameMode()` ternary on line 708 of the HTML, or change it to always use `"Global"`.

The extra API call fetches only `topN=1`, so the cost is one tiny request on page load.

### Fix 2 — Mobile: render `ReigningSpotlightCard` with a separate all-time fetch

In `rankup-mob/src/app/(tabs)/index.tsx`:

1. Add a new state: `const [allTimeChampion, setAllTimeChampion] = useState<GlobalLeaderboardEntryDto | null>(null)`.
2. In `loadData` (or a separate `useEffect` that runs once on mount), call `getGlobalLeaderboard(1, 'alltime')` and set `allTimeChampion` from `result[0]`. This call should **not** depend on `timeMode` or `searchQuery`.
3. Render `<ReigningSpotlightCard champion={allTimeChampion} />` above or near the time-mode filter bar, before the main `feedList`. It is already imported and fully implemented — it just needs to be placed in the JSX.
4. The gold #1 card in the feed list can remain driven by `globalEntries[0]` (today vs all-time per the current mode), since that's the main leaderboard behaviour.

### No Backend Changes Needed

The existing `/api/leaderboard/global?topN=1&timeMode=alltime` call returns exactly what is needed. No new endpoint or query handler is required.
