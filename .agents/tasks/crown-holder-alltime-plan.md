# Implementation Plan: Global Crown Holder Always Shows All-Time #1

## Context

Two platforms need fixing. Both derive the "Global Crown Holder" card from the same
leaderboard array that changes with `timeMode`, so in "Today" mode the card shows
today's #1 instead of the all-time #1. The fix is to add a dedicated one-off
`getGlobalLeaderboard(1, 'alltime')` call on mount in each platform, independent of
the user's current tab, and wire the crown holder card to that dedicated data.

Key files:
- Web TS:  `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts`
- Web HTML: `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.html`
- Mobile screen: `rankup-mob/src/app/(tabs)/index.tsx`
- Mobile component: `rankup-mob/src/components/ReigningSpotlightCard.tsx` (already correct, just not rendered)

Build commands:
- Web: `ng build` (from `ranker.ui/`)
- Web typecheck: `npx tsc --noEmit` (from `ranker.ui/`)
- Mobile lint: `npx expo lint` (from `rankup-mob/`)
- Mobile typecheck: `npx tsc --noEmit` (from `rankup-mob/`)

---

## Plan

- [ ] 1. **Web TS — add `allTimeChampion` signal and load it once on `ngOnInit`**

      In `global-leaderboard.component.ts`:

      a. Add a new private signal after the existing `leadChampion` declaration (line ~466):
         ```typescript
         private readonly allTimeChampion = signal<FeedRow | null>(null);
         ```

      b. In `ngOnInit`, right after `this.loadTop3Sponsors()` and `this.loadSelection()`,
         add a dedicated call that fetches `topN=1, timeMode='alltime'` and is never
         re-run on mode/search changes:
         ```typescript
         this.leaderboardService.getGlobalLeaderboard(1, 'alltime').subscribe({
           next: (entries) => {
             if (entries.length > 0) {
               const e = entries[0];
               this.allTimeChampion.set({
                 rank: 1,
                 listingId: e.listingId,
                 listingName: e.listingName,
                 listingUrl: e.listingUrl,
                 currentClaimAmount: e.currentClaimAmount,
                 categoryName: e.categoryName,
                 categorySlug: e.categorySlug,
                 categoryIcon: e.categoryIcon ?? this.categoryIcon(e.categorySlug),
                 clickCount: e.clickCount,
                 claimCount: e.claimCount ?? 1,
                 siteName: e.siteName,
                 logoUrl: e.logoUrl,
                 description: e.description,
                 faviconUrl: e.faviconUrl,
               });
             }
           },
           error: () => {},
         });
         ```
         This call uses no `takeUntilDestroyed` pipe beyond Angular's default cleanup —
         it is a fire-and-forget on init, analogous to `loadTop3Sponsors()`.

      c. Replace the `reigningChampion` computed signal body (currently lines ~469–475)
         so it always returns `allTimeChampion()`, falling back to `null` during loading:
         ```typescript
         readonly reigningChampion = computed<FeedRow | null>(() => {
           return this.allTimeChampion();
         });
         ```
         The old search-query guard (`if searchQuery && leadChampion()`) is no longer
         needed for the crown holder; `leadChampion` still exists and is still updated by
         `loadGlobal` / `loadCategory` — it just no longer drives the spotlight card.

      Files: `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.ts`

      Verify: `cd ranker.ui && npx tsc --noEmit` — must emit zero errors.

- [ ] 2. **Web HTML — fix the inverted crown holder title**

      In `global-leaderboard.component.html`, locate the spotlight card badge (search for
      `"Global": "Today's"` — it is the `hallOfFameMode()` ternary inside `.spotlight-card__top`).
      Replace the entire ternary expression with the static string:
      ```html
      <!-- BEFORE -->
      {{hallOfFameMode() === 'alltime'? "Global": "Today's"}} Crown Holder

      <!-- AFTER -->
      Global Crown Holder
      ```
      The `hallOfFameMode()` signal and the CARD 2 complementary list below the spotlight
      are not changed — that list correctly flips between "All-Time" and "Today" views.
      Only the spotlight card badge line changes.

      Files: `ranker.ui/src/app/features/global-leaderboard/global-leaderboard.component.html`

      Verify: `cd ranker.ui && ng build` — build must succeed with no errors.
      Additionally, open the app in dev mode, switch to "Today" mode and confirm the
      spotlight card still reads "Global Crown Holder" and shows the all-time #1.

- [ ] 3. **Mobile — add `allTimeChampion` state with a dedicated mount-only fetch**

      In `rankup-mob/src/app/(tabs)/index.tsx`:

      a. Add a new state variable after the existing `platformStats` state declaration:
         ```typescript
         const [allTimeChampion, setAllTimeChampion] =
           useState<GlobalLeaderboardEntryDto | null>(null);
         ```

      b. Add a `useEffect` that runs exactly once on mount (empty dependency array).
         Place it after the existing countdown `useEffect`:
         ```typescript
         useEffect(() => {
           getGlobalLeaderboard(1, 'alltime').then((entries) => {
             if (entries && entries.length > 0) {
               setAllTimeChampion(entries[0]);
             }
           }).catch(() => {});
         }, []);
         ```
         This is intentionally separate from `loadData` so it never re-fires when
         `timeMode` or `searchQuery` changes.

      Files: `rankup-mob/src/app/(tabs)/index.tsx`

      Verify: `cd rankup-mob && npx tsc --noEmit` — zero TypeScript errors.

- [ ] 4. **Mobile — render `ReigningSpotlightCard` above the time-mode filter bar**

      In `rankup-mob/src/app/(tabs)/index.tsx`, `ReigningSpotlightCard` is already imported
      at the top of the file (confirm; if missing, add the import from
      `../../components/ReigningSpotlightCard`). Render the component in the JSX, placed
      between the `CategoryPills` block and the `stageHeader` View — i.e., just before the
      time-mode switcher section (search for the comment
      `LEADERBOARD STAGE HEADER: Mode Switcher & Search`):
      ```tsx
      {/* ═══════════════════════════════════════════════════════════
           GLOBAL CROWN HOLDER — always shows all-time #1
           ═══════════════════════════════════════════════════════════ */}
      <ReigningSpotlightCard champion={allTimeChampion} />
      ```
      No extra props are needed; `ReigningSpotlightCard` already handles `null` gracefully
      (shows "No Leader Yet" placeholder). The existing gold rank-1 card inside `feedList`
      is left untouched — it correctly shows whichever mode's #1 the user has selected.

      Files: `rankup-mob/src/app/(tabs)/index.tsx`

      Verify:
      - `cd rankup-mob && npx expo lint` — no lint errors.
      - `cd rankup-mob && npx tsc --noEmit` — zero TypeScript errors.
      - In the running app (Expo Go or dev build), switch to "Today" mode and confirm the
        `ReigningSpotlightCard` above the filter bar consistently shows the all-time #1,
        while the gold feed card below it shows today's #1.

---

## Dependency Order

Items 1 and 3 are independent of each other (web vs mobile) and can be implemented in
either order. Item 2 depends on item 1 (the signal must exist before the HTML label
change is meaningful). Item 4 depends on item 3 (state must exist before JSX render).

Recommended sequence: 1 → 2 (web, then verify `ng build`), then 3 → 4 (mobile, then
verify lint + typecheck).
