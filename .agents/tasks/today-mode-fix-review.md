# Today-mode claim amount deduction fix

The leaderboard has two time modes. All-Time mode treats `CurrentClaimAmount` as a cumulative running total and charges only the delta above what a listing has already paid. Today mode treats each payment independently — the user pays the full target amount, no previous payment is credited. The bug was that Today mode was applying the same delta-deduction logic as All-Time mode. This fix adds an `isAllTimeMode` boolean that gates the credit deduction, the lower-claim guard, and the credit-notice UI component.

Watch for: (1) **confirmed** — dead code in `ClaimDecisionEngine.cs`: the second `ClaimTooLow` guard (line 67) is unreachable because the `AllTimeCumulativeTooLow` guard immediately above it already catches all cases where `target <= existingClaim`. (2) **confirmed** — `PlaceClaimCommandHandler` only updates `CurrentClaimAmount` when `IsAllTimeMode || newAmount > existingAmount`, meaning a Today-mode payment below the all-time high silently leaves the rank score unchanged despite money being captured — intentional or a data-loss bug, needs resolution.

**Verdict**: NEEDS_CHANGES

---

## High-level view

The mode switch is a single `isAllTimeMode` boolean that propagates from the Angular `timeMode()` signal through the modal payload, the quote API, the Dodo session metadata, and the webhook verification handler to `ClaimDecisionEngine.Evaluate`. The full chain is correctly wired.

`ClaimDecisionEngine` has a confirmed dead-code path: the `ClaimTooLow` guard at line 67 (`target < existingClaim`) can never execute because the `AllTimeCumulativeTooLow` guard at line 61 already returns for any `target <= existingClaim`. The engine still produces correct outcomes — the dead block cannot fire — but it adds confusion about intent.

`PlaceClaimCommandHandler` deliberately avoids overwriting `CurrentClaimAmount` when a Today-mode payment does not exceed the listing's all-time high. This is defensible — `CurrentClaimAmount` doubles as the all-time rank score — but the column is now semantically overloaded in a way that will surprise the next developer. The comment in the handler explains the decision but the schema has no corresponding annotation.

The UI wiring is correct end-to-end: `initiateClaim()` passes `isAllTimeMode: this.timeMode() === 'alltime'`; `creditedAmount` returns 0 when `!isAllTimeMode`; `absoluteMinimumClaim` and `isNotHigherThanExisting` both skip their all-time guards in Today mode; and the credit notice in the template is gated on `modal.claimModal()?.isAllTimeMode`.

Test coverage in `ClaimDecisionEngineTests` directly exercises the two Today-mode scenarios (full charge, no lower-claim guard) and the two All-Time reclaim scenarios (delta charge, mismatch rejection). The `CalculateClaimQuoteCalculationTests` mirror the same two Today-mode cases at the query layer. No test covers the `PlaceClaimCommandHandler` Today-mode path where `newAmount < existingAmount` — the branch that silently skips the `CurrentClaimAmount` update.

<details>
<summary>Issues (3)</summary>

1. **Dead code in ClaimDecisionEngine** — The `ClaimTooLow` guard at line 67 (`isAllTimeMode && existingListingId.HasValue && targetClaimAmount < existingListingCurrentClaim`) is unreachable: the `AllTimeCumulativeTooLow` guard at line 61 uses `<=` so it has already returned for any `target < existingClaim`. Remove the second guard or widen the first to `<` and remove `AllTimeCumulativeTooLow` as a separate case.

2. **`CurrentClaimAmount` silent no-op in Today mode** — When `IsAllTimeMode == false` and `targetClaimAmount <= existingListing.CurrentClaimAmount`, the handler skips the update (`if (command.IsAllTimeMode || decision.NewCurrentClaimAmount > existingListing.CurrentClaimAmount)`). The `Claim` row is still written with `Amount = decision.NewCurrentClaimAmount` (today's payment), but the listing's visible rank score does not change. A user who pays $80 on a listing with a $150 all-time score sees no rank movement despite having paid. If that is intentional, it needs a comment and ideally a distinct column; if not, it is a silent data-loss bug.

3. **Missing test: Today-mode payment below all-time high in PlaceClaimCommandHandler** — No integration or unit test covers the code path where `IsAllTimeMode = false` and `targetClaimAmount < existingListing.CurrentClaimAmount`. This is the exact path where the silent no-op from issue #2 fires.

</details>

<details>
<summary>Details</summary>

### Dead code in ClaimDecisionEngine

The engine contains two sequential guards for the all-time mode re-claim case:

```csharp
// Guard A (line 61)
if (isAllTimeMode && existingListingId.HasValue && targetClaimAmount <= existingListingCurrentClaim)
    return ClaimDecision.Fail(ClaimFailureReason.AllTimeCumulativeTooLow, ...);

// Guard B (line 67) — UNREACHABLE
if (isAllTimeMode && existingListingId.HasValue && targetClaimAmount < existingListingCurrentClaim)
    return ClaimDecision.Fail(ClaimFailureReason.ClaimTooLow, existingListingCurrentClaim);
```

Guard A uses `<=`. Any input where `targetClaimAmount < existingListingCurrentClaim` is a strict subset of `<=`, so Guard B can never be reached. This is confirmed by inspection — no test exercises `ClaimTooLow` from guard B, and the `AllTimeCumulativeTooLow` test case (`target = 150, existing = 150`) covers the equal case. The correct fix is either to collapse both guards into one or to remove guard B entirely (guard A is the one with the right error code for the UI).

### Today-mode `CurrentClaimAmount` update semantics

In `PlaceClaimCommandHandler`, when updating an existing listing:

```csharp
if (command.IsAllTimeMode || decision.NewCurrentClaimAmount > existingListing.CurrentClaimAmount)
{
    listing.CurrentClaimAmount = decision.NewCurrentClaimAmount;
}
```

This means a Today-mode payment of $80 on a listing with a $150 all-time score writes a `Claim` record with `Amount = 80` and `PaymentAmount = 80` (correct — the daily payment is recorded) but leaves `listing.CurrentClaimAmount = 150`. The listing's leaderboard position is unchanged despite money changing hands. Whether that is the intended design — "Today-mode payments compete on daily volume, not rank score" — is not stated anywhere accessible to a reviewer. If Today-mode payments are expected to move the rank score when below the all-time high, this is a silent data-loss bug. If they are not, the `Claim.Amount` column's meaning diverges from `Listing.CurrentClaimAmount` in a way that will surprise anyone reading the schema.


</details>

---

<details>
<summary>File map</summary>

| File | What changed |
|---|---|
| `backend/ranker/Services/Claiming/ClaimDecisionEngine.cs` | New pure engine: mode-conditional credit, AllTimeCumulativeTooLow guard, Today-mode no-op guard |
| `backend/ranker/Application/Claims/CalculateClaimQuoteQuery.cs` | New query handler: mode-aware `existingCredit`, `AllTimeCumulativeTooLow` only in all-time mode |
| `backend/ranker/Application/Claims/PlaceClaimCommand.cs` | New command record with `IsAllTimeMode` parameter |
| `backend/ranker/Application/Claims/PlaceClaimCommandHandler.cs` | New handler: forwards `IsAllTimeMode` to engine, skips `CurrentClaimAmount` update in today mode when below all-time high |
| `backend/ranker/Application/Payments/VerifyDodoPaymentCommandHandler.cs` | Recovers `isAllTimeMode` from Dodo payment metadata, forwards to `PlaceClaimCommand` |
| `backend/ranker/Controllers/ClaimsController.cs` | `/api/claims` marked obsolete (HTTP 410); `/api/claims/calculate` forwards `IsAllTimeMode` |
| `backend/ranker/Dtos/PlaceClaimDtos.cs` | DTOs updated with `IsAllTimeMode` on request and quote records |
| `ranker.ui/…/leaderboard.component.ts` | `initiateClaim()` passes `isAllTimeMode: this.timeMode() === 'alltime'` to modal payload |
| `ranker.ui/…/confirm-claim-modal.component.ts` | `creditedAmount`, `absoluteMinimumClaim`, `isNotHigherThanExisting` all gate on `isAllTimeMode`; checkout passes mode to quote and session metadata |
| `ranker.ui/…/confirm-claim-modal.component.html` | Credit notice and credit ledger row gated on `modal.claimModal()?.isAllTimeMode` |
| `ranker.ui/…/modal.service.ts` | `ClaimModalPayload` gains `isAllTimeMode?: boolean` field |
| `ranker.ui/…/claim.model.ts` | New file: `isAllTimeMode` on both request DTOs |
| `backend/ranker.tests/…/ClaimDecisionEngineTests.cs` | New: today-mode full-charge and no-lower-guard tests |
| `backend/ranker.tests/…/CalculateClaimQuoteCalculationTests.cs` | New: today-mode quote calculation tests |

Full diff: `git diff main`
</details>
