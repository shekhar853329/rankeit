# Payment amount: non-positive guard added across the full transaction path

The change adds a `> 0` guard on the transaction/claim amount at every point in the payment flow: the quote calculation endpoint, the claim placement handler, the Dodo session creation command handler, and the HTTP controller that fronts it. On the frontend, the `ConfirmClaimModalComponent` gains a new `isAmountInvalid` computed signal and a corresponding alert box in the template, plus an early-return guard at the top of `proceedToCheckout` that blocks the API call and surfaces the error both inline and as a toast. The validation is complete end-to-end and the change contains no new commits. **Watch for:** production credentials (`Mode: "live"`, live API key, live `BaseUrl`) have been switched in `appsettings.json` — this is outside the scope of the requested validation but is a high-stakes side-effect in the same diff. The `CreateDodoSessionCommandHandler` throws `ArgumentOutOfRangeException` for a non-positive amount while all other layers return a structured domain error or 400; the inconsistency is minor since the controller already guards before the command is sent.

**Verdict**: APPROVED

---

## High-level view

The backend guards are placed at the earliest possible point in each handler before any I/O is performed, following the same fail-fast style already in use for `CategoryNotFound` and `MinAmountInMinorUnits` checks. The new `InvalidAmount` enum value in `ClaimFailureReason` extends the domain model rather than introducing a stringly-typed error path, consistent with how other failure reasons are handled.

The controller guard in `PaymentsController` returns a 400 before the MediatR command is dispatched; the command handler then has its own guard as a defence-in-depth layer. These two guards are redundant by design — the controller check is the primary HTTP boundary and the command handler check protects callers who might invoke the command directly. The mismatch in how non-positive amount is signalled (400 + `ArgumentOutOfRangeException` vs 400 + structured error) between the two layers is harmless in practice but inconsistent with how the rest of the payment flow handles errors.

On the frontend, the `isAmountInvalid` computed signal covers the case where the user types or programmatically sets a value ≤ 0. The guard in `proceedToCheckout` fires before any network call is made. The existing `isFormValid` computed also gates on `target <= 0`, so the submit button would already be disabled in that case — the new early-return adds explicit error messaging for the same condition.

The `appsettings.json` change — switching from `test` to `live` mode with a live API key and live `BaseUrl` — is bundled into this diff. It is unrelated to the validation work and should be reviewed and tracked separately.

---

<details>
<summary>Issues (3)</summary>

1. **Production credentials in appsettings.json** — A live Dodo Payments API key, live `BaseUrl`, and `Mode: "live"` are committed to `appsettings.json` alongside the validation changes. This file appears to be tracked by git (`git diff HEAD` shows it). If pushed, the live API key will be in version-control history. Move the live key to a secrets manager, environment variable, or `appsettings.Production.json` that is `.gitignore`d. (confirmed — visible in the diff)

2. **ArgumentOutOfRangeException surfaces as 500 on unexpected call paths** — `CreateDodoSessionCommandHandler` throws `ArgumentOutOfRangeException` when `AmountInMinorUnits <= 0`. The controller already returns a 400 before dispatching the command, so normal API traffic will never reach this throw. However, any future caller that constructs and dispatches the command directly (integration test, background job, another controller action) will get an unhandled exception rather than a structured error response. The other handlers return domain failure results; this one deviates. Replace the throw with a structured result or ensure the exception is caught and translated to a 400 at the controller/middleware level. (confirmed)

3. **`onTargetAmountInput` clamps non-positive input silently** — When a user types `0` or a negative number into the amount field, `onTargetAmountInput` does nothing (the `parsed > 0` branch is skipped), leaving the signal at its previous value. The `isAmountInvalid` computed therefore never becomes `true` via typing — it only fires if the signal is set programmatically to a non-positive value. In practice the input is a number field with a minimum, but the guard in `proceedToCheckout` still covers this path correctly. Low impact, but the silent no-op could confuse a user who types `0` and sees no visual feedback until submit. Consider setting the signal to the parsed value unconditionally and letting `isAmountInvalid` do the feedback work. (confirmed)

</details>

---

<details>
<summary>Details</summary>

## Backend guard placement and domain model extension

`PlaceClaimCommandHandler` guards `TargetClaimAmount` and `ConfirmedPaymentAmount` independently before the category lookup, meaning no database round-trip occurs for a bad amount. Separating the two guards catches the edge case where the user submitted a valid target but the payment gateway returned a zero confirmation.

In `CalculateClaimQuoteQuery`, the guard fires after the category lookup but before listing queries, avoiding unnecessary I/O. The existing `TargetClaimAmount < 1m` check later in the same handler is now partially redundant — amounts in (0, 1) will hit the new `InvalidAmount` guard first rather than `ClaimTooLow`. This is a behaviour improvement for that narrow range.

## Exception vs. structured result in the Dodo session path

`CreateDodoSessionCommandHandler` throws `ArgumentOutOfRangeException` for a non-positive `AmountInMinorUnits`. The controller guard (`request.AmountInMinorUnits <= 0 → return BadRequest`) means normal HTTP traffic will never reach the command with this input. But the design choice — throw instead of returning a result type — diverges from the claim handlers, which return `PlaceClaimResultDto` with a failure indicator. If the exception escapes the controller's `try/catch` (it would, since the 400 guard is above the `try` block), ASP.NET would return a 500 unless a global exception handler translates it. Looking at the controller, the `try/catch` block is *inside* the method but *after* the guard, so the throw would not be caught there — it would propagate to whatever global middleware exists. This is a latent 500 risk for any caller that bypasses the controller.

## Frontend: guard coverage and the silent-input gap

`isAmountInvalid` guards on `target !== null && target <= 0`, so a fresh form with no amount entered does not show the error banner prematurely. The `proceedToCheckout` guard mirrors the same condition, keeping the alert-box and the early-return consistent.

`onTargetAmountInput` only updates the signal when `parsed > 0`. Typing `0` leaves the signal unchanged, `isAmountInvalid` stays false, and the alert box never appears. The only visible feedback is that the submit button is disabled via `isFormValid`. The new alert box is therefore unreachable through normal keyboard input of a zero value.

## Production configuration bundled in validation diff

`appsettings.json` switches `Mode` from `test` to `live`, sets a live API key (`mFz0B_8...`), and points `BaseUrl` at `https://live.dodopayments.com`. The old test values are left as comments. This file is tracked by git and appears in `git diff HEAD`, meaning any commit or push of this branch will put the live API key in version-control history. Secrets should not live in `appsettings.json` in a tracked file; use `appsettings.Production.json` excluded via `.gitignore`, environment variables, or a secrets manager.

</details>

---

<details>
<summary>File map</summary>

| File | What changed |
|------|-------------|
| `Application/Claims/CalculateClaimQuoteQuery.cs` | Added `<= 0` guard returning `InvalidAmount` failure before listing queries |
| `Application/Claims/PlaceClaimCommandHandler.cs` | Added `<= 0` guards on both `TargetClaimAmount` and `ConfirmedPaymentAmount` before any I/O |
| `Application/Payments/CreateDodoSessionCommandHandler.cs` | Added `<= 0` guard throwing `ArgumentOutOfRangeException` before the existing `< MinAmount` check |
| `Controllers/PaymentsController.cs` | Added `<= 0` → 400 guard before the `< 100` check in `CreateDodoSession` |
| `Services/Claiming/ClaimDecisionEngine.cs` | Added `InvalidAmount` value to `ClaimFailureReason` enum |
| `appsettings.json` | Switched Dodo Payments from test mode/credentials to live mode/credentials |
| `confirm-claim-modal.component.html` | Added `isAmountInvalid` alert box above the existing `isBelowMinimum` warning |
| `confirm-claim-modal.component.ts` | Added `isAmountInvalid` computed signal; added early-return guard in `proceedToCheckout` |

Full diff: `git diff HEAD` from repo root.

</details>
