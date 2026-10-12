# Implementation Plan: Transaction Amount > 0 Validation

## Context Summary

The payment flow works as follows:
1. User opens `ConfirmClaimModalComponent` (frontend), enters a target amount, and clicks "Checkout".
2. Frontend calls `POST /api/claims/calculate` → `CalculateClaimQuoteQueryHandler` for a server quote.
3. Frontend calls `POST /api/payments/dodo/create-session` → `CreateDodoSessionCommandHandler` to create a Dodo Payments session. The `AmountInMinorUnits` field carries the payable amount.
4. User is redirected to Dodo Payments checkout. On return, the frontend calls `POST /api/payments/dodo/verify` → `VerifyDodoPaymentCommandHandler` → `PlaceClaimCommandHandler`.

The rule to enforce everywhere: **amount must be > 0** (no zero, no negative). "Amount" means:
- On the **frontend**: `targetAmount` (the raw claim target) and `payableAmount` (what Dodo will charge, i.e., `targetAmount` minus any credit). Both must be > 0 before checkout proceeds.
- On the **backend**: `TargetClaimAmount` and `ConfirmedPaymentAmount` on `PlaceClaimCommand`; `TargetClaimAmount` on `CalculateClaimQuoteQuery`; `AmountInMinorUnits` on `CreateDodoSessionCommand`.

**No FluentValidation is in the project.** The project uses inline guard checks in controllers and handler constructors (e.g., `if (command.AmountInMinorUnits < MinAmountInMinorUnits) throw new ArgumentOutOfRangeException(...)` in `CreateDodoSessionCommandHandler`, and `if (request.AmountInMinorUnits < 100) return BadRequest(...)` in `PaymentsController`). All new validation follows that same inline-guard pattern.

**Do NOT commit any changes.**

---

## Implementation Plan

- [ ] 1. Add a zero/negative guard in `CalculateClaimQuoteQueryHandler.Handle()`.
      The handler already checks `TargetClaimAmount < 1m`, but does not catch zero or negative inputs
      explicitly with a clear error message. Add a dedicated early-return check before the category lookup
      so that `TargetClaimAmount <= 0` returns a structured failure response immediately.

      **Where:** `backend/ranker/Application/Claims/CalculateClaimQuoteQuery.cs`, inside
      `CalculateClaimQuoteQueryHandler.Handle()`, right after `if (category is null)` early return.

      **What to add:**
      ```csharp
      if (request.TargetClaimAmount <= 0)
      {
          return Failure(
              request.CategoryId,
              "InvalidAmount",
              "Target claim amount must be greater than zero.");
      }
      ```

      **Verify:** `dotnet test backend/ranker.Tests/ranker.Tests.csproj` — all existing tests still pass.

- [ ] 2. Add a zero/negative guard in `PlaceClaimCommandHandler.Handle()`.
      This handler is the final gate before a claim is written to the database. It currently has no
      early-out for zero/negative amounts. Add two guards at the very top of `Handle()`, before the
      category lookup, to reject obviously invalid inputs and prevent any accidental database writes.

      **Where:** `backend/ranker/Application/Claims/PlaceClaimCommandHandler.cs`, at the start of
      `Handle()`, before `var category = await categoryRepository.GetByIdAsync(...)`.

      **What to add:**
      ```csharp
      if (command.TargetClaimAmount <= 0)
      {
          return Failure(ClaimFailureReason.InvalidAmount, "Target claim amount must be greater than zero.");
      }

      if (command.ConfirmedPaymentAmount <= 0)
      {
          return Failure(ClaimFailureReason.InvalidAmount, "Confirmed payment amount must be greater than zero.");
      }
      ```

      Because `ClaimFailureReason` is an enum, you must also add `InvalidAmount` to it. Find the enum
      definition by searching for `ClaimFailureReason` in the backend — it will be a `.cs` file in the
      Domain or Services folder.

      **Verify:** `dotnet test backend/ranker.Tests/ranker.Tests.csproj` — all existing tests still pass.

- [ ] 3. Add a zero/negative guard in `PaymentsController.CreateDodoSession()`.
      The controller already rejects `AmountInMinorUnits < 100` (i.e., less than $1.00). The fix is to
      tighten the existing check so it also explicitly rejects zero and negative values with a clear
      message. Replace the existing check with one that covers both cases:

      **Where:** `backend/ranker/Controllers/PaymentsController.cs`, inside `CreateDodoSession()`.

      Change:
      ```csharp
      if (request.AmountInMinorUnits < 100)
          return BadRequest(new { error = "Amount must be at least 100 minor units (1.00)." });
      ```
      To:
      ```csharp
      if (request.AmountInMinorUnits <= 0)
          return BadRequest(new { error = "Amount must be greater than zero." });
      if (request.AmountInMinorUnits < 100)
          return BadRequest(new { error = "Amount must be at least 100 minor units (1.00)." });
      ```

      **Verify:** `dotnet build backend/ranker/ranker.csproj` — builds without errors.

- [ ] 4. Add a zero/negative guard in `CreateDodoSessionCommandHandler.Handle()`.
      The handler already throws `ArgumentOutOfRangeException` for `AmountInMinorUnits < 100`.
      Extend the existing check to also cover zero and negative values:

      **Where:** `backend/ranker/Application/Payments/CreateDodoSessionCommandHandler.cs`, inside
      `Handle()`.

      Change:
      ```csharp
      if (command.AmountInMinorUnits < MinAmountInMinorUnits)
      {
          throw new ArgumentOutOfRangeException(
              nameof(command.AmountInMinorUnits),
              command.AmountInMinorUnits,
              $"Amount must be at least {MinAmountInMinorUnits} minor units (1.00).");
      }
      ```
      To:
      ```csharp
      if (command.AmountInMinorUnits <= 0)
      {
          throw new ArgumentOutOfRangeException(
              nameof(command.AmountInMinorUnits),
              command.AmountInMinorUnits,
              "Amount must be greater than zero.");
      }
      if (command.AmountInMinorUnits < MinAmountInMinorUnits)
      {
          throw new ArgumentOutOfRangeException(
              nameof(command.AmountInMinorUnits),
              command.AmountInMinorUnits,
              $"Amount must be at least {MinAmountInMinorUnits} minor units (1.00).");
      }
      ```

      **Verify:** `dotnet build backend/ranker/ranker.csproj` — builds without errors.

- [ ] 5. Add `InvalidAmount` to the `ClaimFailureReason` enum (required by item 2).
      The enum lives in `backend/ranker/Services/Claiming/ClaimDecisionEngine.cs`. Add `InvalidAmount`
      as a new member after `AllTimeCumulativeTooLow`.

      **Where:** `backend/ranker/Services/Claiming/ClaimDecisionEngine.cs`

      **What to add** (append after `AllTimeCumulativeTooLow`):
      ```csharp
      /// <summary>
      /// The transaction amount is zero or negative, which is never valid.
      /// </summary>
      InvalidAmount,
      ```

      **Verify:** `dotnet build backend/ranker/ranker.csproj` — builds without errors.
      `dotnet test backend/ranker.Tests/ranker.Tests.csproj` — all existing tests still pass.

      > Note: Do item 5 before or at the same time as item 2 — the `PlaceClaimCommandHandler` won't
      > compile until `ClaimFailureReason.InvalidAmount` exists.

- [ ] 6. Add frontend validation: show an error and block checkout when `targetAmount` ≤ 0 or
      `payableAmount` ≤ 0.

      **Context:** `ConfirmClaimModalComponent` already has:
      - `isFormValid()` computed signal that returns `false` when `target === null || target <= 0` or
        `payableAmount() < 1`. This already disables the checkout button.
      - `isBelowMinimum()` computed that shows a warning banner when target is below the category
        minimum (which is always ≥ $1).
      - `quoteError` signal bound to an error banner in the template.

      The gap: there is **no dedicated error banner** that fires when `targetAmount` is exactly 0 or
      negative and the user hasn't clicked anything yet — `isBelowMinimum()` covers sub-minimum cases
      but its label says "must be at least $X.XX" which is misleading for zero/negative entry. Also,
      `proceedToCheckout()` does not have an explicit guard that shows a clear message for zero/negative
      — it just silently returns if `!isFormValid()`.

      **Changes in `confirm-claim-modal.component.ts`:**

      a. Add a new computed signal `isAmountInvalid`:
      ```typescript
      protected readonly isAmountInvalid = computed(() => {
        const target = this.targetAmount();
        return target !== null && target <= 0;
      });
      ```

      b. Add a guard at the start of `proceedToCheckout()`, right before the existing `if (!target || !email || !domain)` check:
      ```typescript
      const target = this.targetAmount();
      if (target === null || target <= 0) {
        this.quoteError.set('Transaction amount must be greater than zero.');
        this.toast.show('Transaction amount must be greater than zero.', 'error');
        return;
      }
      ```
      (The existing `const target = this.targetAmount()` line later in the method can be removed since
      it is now declared at the top. Be careful to update references accordingly.)

      **Changes in `confirm-claim-modal.component.html`:**

      Add a new `@if` block for the zero/negative case, positioned in the "Validation Warnings / Errors"
      section, **above** the existing `@if (isBelowMinimum())` block:

      ```html
      @if (isAmountInvalid()) {
      <div class="alert-box alert-box--error">
        <span class="material-symbols-outlined icon-sm">error</span>
        <span>Transaction amount must be greater than zero.</span>
      </div>
      }
      ```

      **Verify:** `cd ranker.ui && ng build` — Angular build completes without errors or type errors.

---

## Verification Summary (run in order after all changes)

1. **Backend build:**
   ```
   cd backend/ranker
   dotnet build
   ```
   Expected: `Build succeeded. 0 Error(s).`

2. **Backend tests:**
   ```
   cd backend/ranker.Tests
   dotnet test
   ```
   Expected: all existing tests pass; no new failures.

3. **Frontend build:**
   ```
   cd ranker.ui
   ng build
   ```
   Expected: `Application bundle generation complete.` with no errors.

---

## Files Changed

| File | Change |
|------|--------|
| `backend/ranker/Application/Claims/CalculateClaimQuoteQuery.cs` | Add `TargetClaimAmount <= 0` early return in handler |
| `backend/ranker/Application/Claims/PlaceClaimCommandHandler.cs` | Add `TargetClaimAmount <= 0` and `ConfirmedPaymentAmount <= 0` early returns |
| `backend/ranker/Controllers/PaymentsController.cs` | Add `AmountInMinorUnits <= 0` guard before the `< 100` guard |
| `backend/ranker/Application/Payments/CreateDodoSessionCommandHandler.cs` | Add `AmountInMinorUnits <= 0` throw before the `< MinAmountInMinorUnits` throw |
| `backend/ranker/Services/Claiming/ClaimDecisionEngine.cs` | Add `InvalidAmount` enum member to `ClaimFailureReason` |
| `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts` | Add `isAmountInvalid` computed + early guard in `proceedToCheckout()` |
| `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.html` | Add error banner for zero/negative amount |

> **Reminder:** Do NOT commit these changes.
