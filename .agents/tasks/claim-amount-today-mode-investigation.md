# Investigation: Claim Amount Today-Mode Deduction Bug

## Summary Answer

**The bug exists in two separate layers — backend and frontend — and they compound each other.**

### Root cause (backend)
In `CalculateClaimQuoteQuery.cs` and `ClaimDecisionEngine.cs`, the `expectedCharge` / `ExpectedChargeAmount` is **always** calculated as:

```
expectedCharge = targetClaimAmount − existingListingCurrentClaim
```

`existingListingCurrentClaim` is `Listing.CurrentClaimAmount`, which is the **all-time cumulative total** paid by that listing. This deduction is correct for All-Time mode (the listing's score builds on what was already paid). In **Today mode** the leaderboard shows and ranks by today-only payment (`Claim.PaymentAmount` for today), but the `CalculateClaimQuote` / `PlaceClaimCommand` backends still deduct the **all-time cumulative** from the target — so a user who paid $100 historically and wants to claim rank today for $30 is told they owe $0 (or even less), or conversely if they type $30 target and the all-time was $100, they get an error saying target is below existing. Neither is correct for today mode.

### Root cause (frontend — confirm-claim-modal)
The modal's `creditedAmount` computed signal is:

```typescript
// confirm-claim-modal.component.ts line 107-109
protected readonly creditedAmount = computed(() =>
  this.isReclaim() ? this.existingClaimAmount() : 0,
);
```

`existingClaimAmount` is populated from `payload.currentClaimAmount` (line 179). In today mode the leaderboard opens the modal with `currentClaimAmount: existing?.currentClaimAmount ?? 0`, but because the leaderboard entries in today mode use `TodayPaidAmount` (from `GetCategoryLeaderboardQueryHandler`), the `currentClaimAmount` field in the `LeaderboardEntryDto` holds the **today-paid amount**, not the all-time cumulative.

**However**, when the user types a URL in the modal and the lookup resolves the listing via `listingService.lookupListing()`, the listing lookup returns `currentClaimAmount` from `Listing.CurrentClaimAmount` (the all-time total), so `existingClaimAmount` reverts to the all-time total regardless of mode.

### Root cause (frontend — leaderboard initiateClaim)
In `leaderboard.component.ts`, the `initiateClaim()` method calls `this.modalService.openClaimModal({...})` and **never passes `isAllTimeMode`** (line 666–685). The field is simply absent from the payload. `ClaimModalPayload.isAllTimeMode` defaults to `undefined`, so in `confirm-claim-modal.component.ts` it falls back to `payload?.isAllTimeMode ?? false` — always `false`.

This means when a user is in **all-time mode on the category leaderboard** and opens the claim modal, `isAllTimeMode` is sent as `false` to the backend quote API, so the all-time-specific validation (`AllTimeCumulativeTooLow`) is never triggered. Conversely when in today mode the deduction still happens unconditionally.

---

## Evidence with File/Symbol Citations

### 1. Where the quote calculation lives

**Backend:**
- `backend/ranker/Application/Claims/CalculateClaimQuoteQuery.cs` — `CalculateClaimQuoteQueryHandler.Handle()`
- `backend/ranker/Services/Claiming/ClaimDecisionEngine.cs` — `ClaimDecisionEngine.Evaluate()`

**Frontend:**
- `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts` — `payableAmount` computed and `proceedToCheckout()`
- `ranker.ui/src/app/core/services/claim.service.ts` — `calculateClaimQuote()`

### 2. Data model

**`Listing.CurrentClaimAmount`** (`Domain/Entities/Listing.cs`):
- A single `decimal` field that is the **running all-time cumulative total** of all `PaymentAmount` deltas.  
- There is no "today amount" column on `Listing`. Today-amount is computed on the fly by summing `Claim.PaymentAmount` where `Claim.CreatedAt >= todayUtc`.

**`Claim`** (`Domain/Entities/Claim.cs`):
- `Amount`: the listing's new `CurrentClaimAmount` snapshot at time of claim.
- `PaymentAmount`: the actual cash charged for this specific transaction (the delta).
- `CreatedAt`: timestamp.
- No `Mode` column — there is no all-time vs. today flag stored on a claim.

### 3. How the leaderboard passes amounts in Today mode

`GetCategoryLeaderboardQueryHandler.cs` (lines 49–80): in today mode it projects `TodayPaidAmount = l.Claims.Where(c => c.CreatedAt >= todayUtc).Sum(c => c.PaymentAmount)`. This value is placed in `LeaderboardEntryDto.CurrentClaimAmount`. So in today mode, `entry.currentClaimAmount` on the frontend means **today's total paid** for that listing, not the all-time total.

### 4. How the frontend opens the claim modal (leaderboard)

`leaderboard.component.ts` `initiateClaim()` method (around line 640–685):
```typescript
this.modalService.openClaimModal({
  rank,
  categoryName: this.categoryName(),
  amount,
  categoryId,
  // ... other fields ...
  currentClaimAmount: existing?.currentClaimAmount ?? 0,  // ← today-paid amount when in today mode
  listingId: existing?.listingId ?? null,
  // isAllTimeMode is NEVER PASSED HERE — missing from payload
  onSuccess: () => this.refresh(),
});
```

`isAllTimeMode` is absent. The global leaderboard (`global-leaderboard.component.ts` line 1142) does pass it correctly: `isAllTimeMode: this.timeMode() === 'alltime'`.

### 5. Frontend modal: payableAmount deduction

`confirm-claim-modal.component.ts`:
```typescript
// Line 107-109 — creditedAmount always deducts, regardless of mode
protected readonly creditedAmount = computed(() =>
  this.isReclaim() ? this.existingClaimAmount() : 0,
);

// Line 127-132 — payableAmount shown in UI
protected readonly payableAmount = computed(() => {
  const target = this.targetAmount() ?? 0;
  const credit = this.creditedAmount();
  return Math.max(0, Math.round((target - credit) * 100) / 100);
});
```

There is no check for `payload?.isAllTimeMode`. The deduction always happens for a reclaim.

**But the real problem is what `existingClaimAmount` holds:**
- Populated from `payload.currentClaimAmount` on modal open (line 179).
- Overwritten by the listing-lookup stream (line 245): `this.existingClaimAmount.set(lookup.currentClaimAmount)` where `lookup.currentClaimAmount` comes from `listingService.lookupListing()`, which queries `Listing.CurrentClaimAmount` — always the **all-time total**, even in today mode.

So even if the leaderboard opened the modal with today's amount, the moment the listing is resolved by URL lookup, `existingClaimAmount` becomes the all-time cumulative.

### 6. Backend: deduction always applies regardless of mode

`CalculateClaimQuoteQuery.cs` line 83:
```csharp
var expectedCharge = Math.Max(0m, request.TargetClaimAmount - existingListingCurrentClaim);
```

`ClaimDecisionEngine.cs` line 76:
```csharp
var expectedCharge = targetClaimAmount - existingListingCurrentClaim;
```

`existingListingCurrentClaim` is always `Listing.CurrentClaimAmount` (the all-time total). There is no code path that uses today's paid total when computing the charge. The `isAllTimeMode` flag is checked only for **validation** (AllTimeCumulativeTooLow error), never for adjusting the charge amount.

### 7. PlaceClaimCommand confirms the same issue

`PlaceClaimCommandHandler.cs` (line 95): it calls `ClaimDecisionEngine.Evaluate(...)` which also calculates `expectedCharge = targetClaimAmount - existingListingCurrentClaim` unconditionally.

When a user in today mode places a claim:
- They see on the leaderboard: "your today score is $30"
- The modal shows: payable = target − $30 (today amount from leaderboard payload)
- BUT when URL lookup fires, `existingClaimAmount` becomes the all-time total (e.g. $100)
- The modal then shows: payable = target − $100
- The backend independently also deducts $100 (the all-time total)
- If target is $30, the backend returns `expectedCharge = $30 − $100 = −$70 → clamped to $0`
- Then the backend `confirmedPaymentAmount != expectedCharge` check fails (frontend sends $30 − $30 = $0, backend expects $0 too in this case, but it's accidental for certain values)

The mismatch becomes critical when target > $100: backend charges $target − $100 but frontend displays $target − $30, so the user sees a different number than what they're actually charged.

---

## Conclusions

### What the correct behaviour should be

| Mode       | `existingListingCurrentClaim` to use for charge deduction | Rationale |
|------------|-----------------------------------------------------------|-----------|
| All-Time   | `Listing.CurrentClaimAmount` (all-time cumulative)        | Score is cumulative; user pays only the increment above their existing all-time total |
| Today      | **0** (or sum of today's payments — but conceptually 0)  | Today's rank is a fresh daily competition; user pays the full target amount |

The user's request states: "in today's mode the amount that I will pay would be what I display on claim Rank section, I will not deduct the previous credited amount unlike all time mode."

This confirms: **in Today mode, no credit deduction should happen**. The user pays `targetClaimAmount` in full.

### Summary of bugs to fix

**Bug 1 (backend — primary): `expectedCharge` ignores mode**  
`CalculateClaimQuoteQuery.cs` line 83 and `ClaimDecisionEngine.cs` line 76 unconditionally deduct `existingListingCurrentClaim`. In Today mode, `existingListingCurrentClaim` should be treated as `0` (no credit):

```csharp
// Fix in CalculateClaimQuoteQuery.cs
var existingCredit = request.IsAllTimeMode ? existingListingCurrentClaim : 0m;
var expectedCharge = Math.Max(0m, request.TargetClaimAmount - existingCredit);
```

```csharp
// Fix in ClaimDecisionEngine.Evaluate()
var credit = isAllTimeMode ? existingListingCurrentClaim : 0m;
var expectedCharge = targetClaimAmount - credit;
```

**Bug 2 (backend — secondary): validation guard also uses all-time total in Today mode**  
The "cannot lower claim" check at line 69 of `ClaimDecisionEngine.cs` compares against `existingListingCurrentClaim` (the all-time total). In today mode this is wrong — the listing could have paid $100 all-time but only $30 today; the user should be able to claim $31 today (not be forced to exceed $100). The guard should compare against the today-paid total in today mode, but since the backend currently has no today-paid total on the request, the simplest correct fix is to skip the "cannot lower" guard in today mode (the user always pays full amount; no score is being "lowered" since it's a fresh daily competition).

**Bug 3 (frontend — `leaderboard.component.ts`): `isAllTimeMode` never passed to modal**  
`initiateClaim()` (line 666) must pass `isAllTimeMode: this.timeMode() === 'alltime'`. Without this, the `calculateClaimQuote` call inside `proceedToCheckout()` always sends `isAllTimeMode: false`, bypassing the all-time validation on the backend.

**Bug 4 (frontend — `confirm-claim-modal.component.ts`): `creditedAmount` ignores mode**  
`creditedAmount` should return 0 when mode is today. The payload's `isAllTimeMode` field needs to be checked:

```typescript
protected readonly creditedAmount = computed(() => {
  if (!this.isReclaim()) return 0;
  const payload = this.modal.claimModal();
  if (!payload?.isAllTimeMode) return 0; // today mode: no credit
  return this.existingClaimAmount();
});
```

**Bug 5 (frontend — `confirm-claim-modal.component.ts`): `absoluteMinimumClaim` and `isNotHigherThanExisting` use all-time total in today mode**  
Both computed signals use `existingClaimAmount()` as the floor. In today mode the floor should be 1 (or the category minimum), not the all-time total. These should also be conditioned on `isAllTimeMode`.

---

## Recommended Fix Sequence

1. **Backend: `ClaimDecisionEngine.Evaluate()`** — change `expectedCharge` and the "cannot lower claim" check to be mode-aware (today mode: credit = 0, no lower-claim guard against all-time total).
2. **Backend: `CalculateClaimQuoteQuery.cs`** — apply the same `isAllTimeMode`-conditional to `expectedCharge` and the validation messages.
3. **Frontend: `leaderboard.component.ts` `initiateClaim()`** — add `isAllTimeMode: this.timeMode() === 'alltime'` to the `openClaimModal` call.
4. **Frontend: `confirm-claim-modal.component.ts`** — gate `creditedAmount`, `absoluteMinimumClaim`, and `isNotHigherThanExisting` on `payload?.isAllTimeMode`.
5. **HTML template** — the "Your previous payment of $X will be credited 100%" notice should only appear when `payload?.isAllTimeMode` is true.

No schema or data migration changes are required — `Listing.CurrentClaimAmount` remains the all-time cumulative total. The fix is purely logic: today mode simply doesn't use the credit deduction.
