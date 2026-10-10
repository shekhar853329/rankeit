# Global Leaderboard — Default Time Mode Investigation

## Summary Answer

The global leaderboard currently defaults to **`'today'`** mode. The fix is a one-line change on **line 107** of:

```
ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts
```

Change `'today'` → `'alltime'` in the `timeMode` signal initializer.

---

## Evidence

### 1. Component Location

```
ranker.ui/src/app/features/global-leaderboard/
  global-leaderboard.component.ts   ← TypeScript logic
  global-leaderboard.component.html ← Template
  global-leaderboard.component.scss ← Styles
```

### 2. Default Time Mode Signal (the root cause)

**File:** `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts`  
**Line 106–107:**

```typescript
/* ── Time & Currency Controls ── */
readonly timeMode = signal<'today' | 'alltime'>('today');   // ← DEFAULT IS 'today'
```

This is an Angular `signal` — a reactive state primitive. Its constructor argument `'today'` is the initial/default value rendered on first load. There is **no URL query-param handling** in this component (`ActivatedRoute` is not injected and `queryParams` is not read), so no external parameter can override this default.

### 3. Possible Time Mode Values

The TypeScript type literal enforces exactly two valid values:

| Value | Meaning |
|-------|---------|
| `'today'` | Shows today's live leaderboard (resets at midnight UTC) |
| `'alltime'` | Shows the all-time global pantheon |

### 4. How `timeMode` Drives the UI

The signal is consumed throughout the template and component:

- **Template title** (`line ~163 of .html`): `{{ timeMode() === 'today' ? "Today's Live Leaderboard" : "All-Time Global Pantheon" }}`
- **Hero section label** (`line ~11 of .html`): `{{ timeMode() === 'today' ? "Today's" : "Global" }} Claim`
- **Time pill active state** (`.html`): `[class.time-pill--active]="timeMode() === 'today'"` / `[class.time-pill--active]="timeMode() === 'alltime'"`
- **API call** (`line 1225 of .ts`): `this.leaderboardService.getGlobalLeaderboard(count + 1, this.timeMode(), query)`
- **Category count display** (`line 256–266 of .ts`): computes counts based on `timeMode()`
- **Hall of Fame inversion** (`line 347 of .ts`): `this.timeMode() === 'today' ? 'alltime' : 'today'`
- **All-time validation** (`line 1133 of .ts`): `isAllTimeMode: this.timeMode() === 'alltime'`

### 5. `setTimeMode` Method (for reference)

When a user clicks the Today/All-Time pill, this method is called:

```typescript
setTimeMode(mode: 'today' | 'alltime'): void {
  this.timeMode.set(mode);
  this.allTimeValidationError.set(null);
  this.chartTimePreset.set(mode === 'today' ? 'today' : 'all');
  this.visibleCount.set(10);
  this.hasMoreProducts.set(true);
  this.loading.set(true);
  this.loadSelection(10);
  this.loadPlatformStats(undefined, mode);
  this.updateChart();
  // ...
}
```

Note the `chartTimePreset` is also changed when the mode changes. This means the **initial `chartTimePreset`** signal also needs to be reviewed — it is currently initialized to `'today'`:

```typescript
readonly chartTimePreset = signal<'1h' | '6h' | 'today' | 'all'>('today');
```

---

## Conclusions

### Root Cause

A single signal initializer sets the default mode to `'today'`:

```typescript
// Line 107, global-leaderboard.component.ts
readonly timeMode = signal<'today' | 'alltime'>('today');
```

### Side-Effect: Chart Preset

The chart's time preset (`chartTimePreset`) defaults to `'today'` as well. When `setTimeMode` is called interactively with `'alltime'`, it sets `chartTimePreset` to `'all'`. For consistency, the chart preset default should also be updated.

---

## Recommended Fix

**File:** `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts`

### Change 1 — Default time mode (line 107)

```diff
- readonly timeMode = signal<'today' | 'alltime'>('today');
+ readonly timeMode = signal<'today' | 'alltime'>('alltime');
```

### Change 2 — Default chart time preset (line 104)

```diff
- readonly chartTimePreset = signal<'1h' | '6h' | 'today' | 'all'>('today');
+ readonly chartTimePreset = signal<'1h' | '6h' | 'today' | 'all'>('all');
```

These are the only two lines that need to change. No other files are involved — the component handles all derived state reactively from `timeMode`.
