# Today-mode CurrentClaimAmount stacking and dead guard removal

These two fixes correct the cumulative claim amount logic for today mode and remove a dead guard that was never reachable. Both changes are in `ClaimDecisionEngine.cs`; one flows through into `PlaceClaimCommandHandler.cs`. The core behavioral change: in today mode, a payment of $50 against a listing with an all-time total of $100 now produces a `CurrentClaimAmount` of $150, matching the intended "stack on top of history" semantics. The dead `ClaimTooLow` guard that could never fire after `AllTimeCumulativeTooLow` has been removed.

Watch for: *(none — both fixes are confirmed correct; see details below)*

**Verdict**: APPROVED

---

## High-level view

The `ClaimDecisionEngine` now branches on `isAllTimeMode` when computing `newCurrentClaimAmount`. All-time mode keeps the existing delta-charge model (`targetClaimAmount` becomes the new cumulative total). Today mode adds `existingListingCurrentClaim + targetClaimAmount`, meaning every today-mode payment permanently raises the all-time rank score by the full amount paid. `PlaceClaimCommandHandler` applies `decision.NewCurrentClaimAmount` unconditionally — no mode-conditional skip exists — and the `Claim.Amount` field receives the same value.

The dead guard removal is clean. The absolute-floor check (`targetClaimAmount < 1m`) fires for any mode and stays. The second `ClaimTooLow` guard that appeared after `AllTimeCumulativeTooLow` — which could never be reached because `AllTimeCumulativeTooLow` exits first for all-time mode, and today mode skips that branch entirely — has been deleted. No other logic was touched.

---

<details>
<summary>Issues (0)</summary>

No blocking issues found.

</details>

<details>
<summary>Details</summary>

### Today-mode stacking in ClaimDecisionEngine

The fix is at lines 77–80 of `ClaimDecisionEngine.cs`:

```csharp
var newCurrentClaimAmount = isAllTimeMode
    ? targetClaimAmount
    : existingListingCurrentClaim + targetClaimAmount;
```

This is exactly the required formula. For a new listing (`existingListingCurrentClaim = 0`), today mode and all-time mode produce the same result for the first claim, which is correct. For a reclaiming listing, today mode always stacks — the all-time rank score grows by the full payment amount regardless of what the listing previously accumulated. The `becameTop` comparison downstream uses `newCurrentClaimAmount` against the category's current top, so the rank promotion logic automatically sees the stacked value.

### Unconditional application in PlaceClaimCommandHandler

`listing.CurrentClaimAmount = decision.NewCurrentClaimAmount` is unconditional for both new and existing listings. For new listings it's set in the constructor; for existing listings it's the first assignment in the update block with no mode guard around it. `Claim.Amount` is also set to `decision.NewCurrentClaimAmount`, so the claim history row matches the listing's updated rank score.

### Dead guard removal

Before the fix, the engine had two guards that could block a claim as `ClaimTooLow`. The first (`targetClaimAmount < absoluteFloor`) is an absolute minimum applied in all modes. The second appeared after the `AllTimeCumulativeTooLow` block and was unreachable: in all-time mode, any claim that passed the `AllTimeCumulativeTooLow` check had already proven `targetClaimAmount > existingListingCurrentClaim ≥ 0`, so it could never be below the floor; in today mode, the `isAllTimeMode` branch was skipped entirely. The second guard is gone. The absolute-floor check remains and is not dead.

### Build and test evidence

From `remaining-fixes-verification.md`: `dotnet build` — zero compile errors; `dotnet test` — 37/37 pass, 0 failures; `npm run build` — zero errors. The file-lock note on `dotnet build`/`dotnet test` is a dev-environment artifact (running process holds the output DLL), not a compilation issue.

</details>

---

<details>
<summary>File map</summary>

- `backend/ranker/Services/Claiming/ClaimDecisionEngine.cs` — today-mode `newCurrentClaimAmount` now stacks payment on top of existing total; dead second `ClaimTooLow` guard removed.
- `backend/ranker/Application/Claims/PlaceClaimCommandHandler.cs` — `listing.CurrentClaimAmount` and `Claim.Amount` unconditionally assigned from `decision.NewCurrentClaimAmount` in both modes.

</details>
