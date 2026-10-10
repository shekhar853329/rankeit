# Implementation Plan — Payments Flow Improvements

**Project root:** `c:\Users\shekh\source\repos\rankeit`
**Based on:** investigation report at `.agents/tasks/payments-flow-investigation.md`

---

## Ordering rationale

- Tasks 1 & 2 are security-critical (P0); they must be done first and in order — Task 1 hardens the webhook before Task 2 locks down the direct claims bypass.
- Tasks 3 & 4 are dead-code removal (P1); do them before the frontend UX tasks so later tasks work against a clean baseline.
- Task 5 (P1 backend) is independent of all frontend tasks — can be done any time after Task 1.
- Tasks 6, 7, 8, 9, 10, 11 are all frontend (P1/P2/P3); order them 6→7→8→9→10→11 because Task 7 adds a `from` param that Task 6 reads on the result page.
- Task 12 (P3 backend) is a standalone backend config fix, independent of everything else.

---

- [ ] 1. **Implement webhook signature verification in `ProcessDodoWebhookCommandHandler.cs`**

  Add a private `VerifyWebhookSignature(string? webhookId, string? timestamp, string? signatureHeader, string rawBody, string webhookKey)` → `bool` method to `ProcessDodoWebhookCommandHandler`. Inject `IConfiguration` via the primary constructor. At the start of `Handle()`, read `WebhookKey` from config (`configuration["DodoPayments:WebhookKey"]`). If key is null/empty, log a warning (`"WebhookKey not configured — skipping signature verification (dev mode)"`) and skip. If key is present, call `VerifyWebhookSignature`. If it returns `false`, log a warning and return `false` immediately (do not process the event).

  **Standard Webhooks algorithm to implement:**
  1. Parse `timestamp` as a Unix long. If missing or unparseable, return `false`.
  2. Check `|DateTimeOffset.UtcNow.ToUnixTimeSeconds() - timestamp| > 300`. If so, return `false` (replay attack).
  3. Build signed content string: `$"{webhookId}.{timestamp}.{rawBody}"` using UTF-8 bytes.
  4. Decode `webhookKey` from base64: `Convert.FromBase64String(webhookKey)`. Wrap in try/catch; if decode fails, return `false`.
  5. Compute `HMACSHA256(decodedKey, signedContentBytes)`.
  6. Base64-encode the result.
  7. Split `signatureHeader` on comma. For each part strip the `"v1,"` prefix. If any part equals the computed base64 signature, return `true`. Otherwise `false`.

  Add `using System.Security.Cryptography;` to the file.

  In `appsettings.json`, set `"WebhookKey": ""` (placeholder — value comes from secrets).
  In `appsettings.Development.json`, add the entire `DodoPayments` section with `"WebhookKey": ""` to match (empty means dev-skip will trigger).

  **Risk:** If the real production `WebhookKey` is blank, every webhook will be skipped. This is safe — the verify endpoint still runs from the return URL. Populate `WebhookKey` via environment variable or secrets manager before production.

  **Files:**
  - `backend/ranker/Application/Payments/ProcessDodoWebhookCommandHandler.cs`
  - `backend/ranker/appsettings.json`
  - `backend/ranker/appsettings.Development.json`

  **Verify:** `cd backend/ranker && dotnet build` → zero errors/warnings. Manual: POST to webhook endpoint with a fake payload and confirm the handler logs "skipping signature verification" in dev (WebhookKey empty) and processes the event.

---

- [ ] 2. **Lock down `POST /api/claims` in `ClaimsController.cs`**

  The endpoint is live and unauthenticated. It accepts any `PaymentReference` string and places a claim without verifying the payment exists. Since `handleDodoPaymentSuccess()` in the modal (its only caller) is dead code that will be removed in Task 3, this endpoint is no longer needed by the frontend. Mark it obsolete and return 410:

  Replace the `[HttpPost]` `PlaceClaim` action body with:
  ```csharp
  [HttpPost]
  [Obsolete("Use POST /api/payments/dodo/verify instead. This endpoint is no longer supported.")]
  public IActionResult PlaceClaim([FromBody] PlaceClaimRequestDto request)
  {
      return StatusCode(410, new
      {
          error = "This endpoint is no longer supported.",
          detail = "Use POST /api/payments/dodo/verify to complete a claim after a Dodo Payments checkout."
      });
  }
  ```
  Keep `POST /api/claims/calculate` untouched — it is still actively used by the modal for quote calculation.

  **Risk:** If any other caller (script, integration test, external tool) still POSTs to `/api/claims`, it will break. The investigation confirms the only frontend caller is dead code. Search the codebase for any other references before applying.

  **Files:**
  - `backend/ranker/Controllers/ClaimsController.cs`

  **Verify:** `dotnet build` → zero errors. `curl -X POST http://localhost:5000/api/claims -H "Content-Type: application/json" -d '{}'` → 410 response.

---

- [ ] 3. **Remove dead code from `confirm-claim-modal.component.ts` and its template**

  **In `confirm-claim-modal.component.ts`:**
  - Delete the entire `handleDodoPaymentSuccess()` private method (lines ~527–620 per investigation report — verify exact range by reading the file before editing).
  - Delete the `handlePaymentFailure()` private method — it is only called by `handleDodoPaymentSuccess()`.
  - Remove the signals `currentStep`, `terminalLoading`, `activeSessionId`, `activeCheckoutUrl` from the class fields — they were only used by the dead terminal flow and `goToStep1()`/`retryPayment()`.
  - Remove the `goToStep1()` method — it calls `dodoPayments.closeTerminal()` and sets `currentStep`. Once step signals are removed it has no purpose.
  - Remove the `retryPayment()` method — it resets state back to step 1, which is now irrelevant.
  - Keep `finishSuccess()`, `copyPaymentId()`, `close()`, `onKeydown()`, `transactionStatus`, `transactionDetails`, `copied` — they are used by the success/failed states in the template.
  - In the `constructor` effect, remove the `this.currentStep.set(1)` and `this.terminalLoading.set(false)` lines.

  **In `confirm-claim-modal.component.html`:**
  - The `success` and `failed` transaction states in the template reference `retryPayment()` in the failed state's "Try Again" button. Change that button to call `close()` instead (the user will re-open the modal from the listing page). Update the button label to "Close & Try Again" with `(click)="close()"`.
  - No step-2 payment terminal section exists in the HTML (the terminal redirect replaced it) — confirm no `@if (currentStep() === 2)` block exists before removing.

  **Risk:** Confirm `handlePaymentFailure` is not called from anywhere other than `handleDodoPaymentSuccess` before deleting it.

  **Files:**
  - `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts`
  - `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.html`

  **Verify:** `cd ranker.ui && ng build --configuration production` → zero TypeScript/template errors.

---

- [ ] 4. **Remove dead `openTerminal()` method from `dodo-payments.service.ts`**

  `openTerminal()`, `closeTerminal()`, `isTerminalOpen()`, and `pollUntilPaid()` are all part of the old inline-terminal flow. After Task 3 removes the callers in the modal, verify there are no other callers:
  - Search the codebase for `openTerminal`, `closeTerminal`, `isTerminalOpen`, `pollUntilPaid` across all `.ts` files. If any active caller is found, do not remove that method.
  - If `closeTerminal()` is still called from `confirm-claim-modal.component.ts` (in `close()` and `finishSuccess()`), remove those two call sites from the modal as well, then remove the method from the service.
  - Remove the `TerminalEventCallbacks` interface export from the service file if nothing imports it after the cleanup.
  - Remove the `currentDisplayType` private field.
  - Keep the `DodoPayments`, `CheckoutEvent`, `CheckoutBreakdownData` imports only if they are still referenced; otherwise remove them.
  - Keep `createSession()`, `getSessionStatus()`, `verifyPayment()`, `verifyPaymentPost()`, `describeHttpError()`.

  **Files:**
  - `ranker.ui/src/app/core/services/dodo-payments.service.ts`
  - `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts` (remove `closeTerminal()` call sites if present)

  **Verify:** `ng build --configuration production` → zero errors. No `openTerminal` references remain in any `.ts` file (run `grep -r "openTerminal" ranker.ui/src` to confirm).

---

- [ ] 5. **Handle `payment.failed` and `payment.cancelled` webhooks in `ProcessDodoWebhookCommandHandler.cs`**

  After the existing `if (payment.succeeded)` block, add two more branches:

  ```csharp
  else if (string.Equals(eventType, "payment.failed", StringComparison.OrdinalIgnoreCase))
  {
      string? paymentId = ExtractPaymentId(root);
      logger.LogWarning("Webhook payment.failed received. PaymentId={PaymentId}. No action taken — claim not reversed.", paymentId);
  }
  else if (string.Equals(eventType, "payment.cancelled", StringComparison.OrdinalIgnoreCase))
  {
      string? paymentId = ExtractPaymentId(root);
      logger.LogInformation("Webhook payment.cancelled received. PaymentId={PaymentId}. No action taken.", paymentId);
  }
  ```

  Extract the repeated `payment_id`/`id` parsing into a private helper `ExtractPaymentId(JsonElement root) → string?` to avoid duplication with the existing `payment.succeeded` block.

  Update the audit log `Action` field to use the event type for clarity: instead of hardcoded `"Webhook"`, use `eventType ?? "Webhook"`.

  **Files:**
  - `backend/ranker/Application/Payments/ProcessDodoWebhookCommandHandler.cs`

  **Verify:** `dotnet build` → zero errors.

---

- [ ] 6. **Improve payment result page UX in `payment-success.component.ts` and `.html`**

  This is the most involved frontend task. Work through it in four sub-steps:

  **6a — Dynamic status branching (TypeScript):**
  In `PaymentSuccessComponent.ngOnInit()`, when reading params also read `from` param:
  ```typescript
  readonly fromUrl = signal<string | null>(null);
  readonly categorySlug = signal<string | null>(null);
  ```
  Capture `params.get('from')` and store in `fromUrl`. Sanitize: only set if value starts with `/` and does not contain `//` or `javascript:`.
  Only call `this.verify(pid, sid)` when `st === 'succeeded'` or when `st` is absent (backward-compat). When `st === 'cancelled'` or `st === 'failed'`, set `loading(false)` immediately without calling verify.

  **6b — Dynamic browser title (TypeScript):**
  Inject `Title` from `@angular/platform-browser`. In `ngOnInit`, after reading `status`, call `this.title.setTitle(...)`:
  - `succeeded` → `"Payment Confirmed — RankUp"`
  - `cancelled` → `"Payment Cancelled — RankUp"`
  - `failed` → `"Payment Failed — RankUp"`
  - default → `"Payment — RankUp"`

  **6c — Fix "View on Leaderboard" link (TypeScript):**
  After a successful verify response, extract `categorySlug` from the verify response. The `VerifyDodoPaymentResponseDto` has `ListingId` — but not `categorySlug` directly. Check the `VerifyPaymentResponse` model in `ranker.ui/src/app/core/models/payment.model.ts`. If `categoryId` is available, build a computed route. The leaderboard route is `/leaderboard/:categorySlug` (from `app.routes.ts`). The verify response returns `listingId` but not `categorySlug`. Use `listingId` to construct `/listings/{listingId}` as the "View your listing" link instead (this is correct and available). If neither is present, fall back to `/`.

  Store in signal: `readonly leaderboardUrl = signal<string>('/')`.
  After `verification.set(res)`, set: `this.leaderboardUrl.set(res.listingId ? '/listings/' + res.listingId : '/');`

  **6d — Dynamic template (`payment-success.component.html`):**

  Replace the single `@else` success block with three distinct blocks keyed on `status()`:

  ```
  @if (loading()) {
    <!-- existing loading spinner -->
  } @else if (status() === 'cancelled') {
    <!-- CANCELLED block -->
    <h2>Payment Cancelled</h2>
    <p>You cancelled the payment. No charge was made.</p>
    <a [routerLink]="fromUrl() ?? '/'" class="btn btn-primary">Try Again</a>
    <a routerLink="/" class="btn btn-ghost">Go to Home</a>
  } @else if (status() === 'failed') {
    <!-- FAILED block -->
    <h2>Payment Failed</h2>
    <p>Your payment could not be processed. Please try again or contact support.</p>
    <a [routerLink]="fromUrl() ?? '/'" class="btn btn-primary">Try Again</a>
    <a routerLink="/" class="btn btn-ghost">Go to Home</a>
  } @else if (error()) {
    <!-- existing error card — keep as-is -->
  } @else {
    <!-- existing success card, but update "View on Leaderboard" link -->
    <a [routerLink]="leaderboardUrl()" class="btn btn-primary btn--block">
      <span>View on Leaderboard 🚀</span>
    </a>
  }
  ```

  Add appropriate icon circles for cancelled (e.g. `cancel` icon, yellow/orange) and failed (e.g. `error` icon, red) matching the existing `icon-circle--error` CSS class already present.

  **Files:**
  - `ranker.ui/src/app/features/payment-success/payment-success.component.ts`
  - `ranker.ui/src/app/features/payment-success/payment-success.component.html`
  - `ranker.ui/src/app/core/models/payment.model.ts` (read first — check if `listingId` is already on `VerifyPaymentResponse`)

  **Verify:** `ng build --configuration production` → zero errors. Manual: navigate to `/payment-success?status=cancelled` → page shows "Payment Cancelled" heading and "Try Again" button. Navigate to `/payment-success?status=succeeded&payment_id=test` → loading spinner appears, then error state (since `test` is invalid).

---

- [ ] 7. **Pass `from` context through return URL**

  **In `confirm-claim-modal.component.ts` `proceedToCheckout()`:**
  Inject `Location` from `@angular/common`. Where `returnUrl` is built:
  ```typescript
  const currentPath = this.location.path(); // e.g. "/leaderboard/saas"
  const safePath = currentPath && currentPath.startsWith('/') ? currentPath : '/';
  const returnUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/payment-success?from=${encodeURIComponent(safePath)}`
    : `http://localhost:4200/payment-success?from=${encodeURIComponent(safePath)}`;
  ```
  This passes `from` to the payment-success page, which Task 6 already reads and sanitizes.

  **Files:**
  - `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts`

  **Verify:** `ng build --configuration production` → zero errors. Manual: open the modal from `/leaderboard/saas`, click checkout, check that the `returnUrl` sent to `create-session` includes `?from=%2Fleaderboard%2Fsaas`.

---

- [ ] 8. **Email validation before checkout in `proceedToCheckout()`**

  At the start of `proceedToCheckout()`, after the null check block, add:
  ```typescript
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    this.quoteError.set('Please enter a valid email address.');
    this.toast.show('Please enter a valid email address.', 'error');
    return;
  }
  ```
  Place this check after the `!target || !email || !domain` guard and before `this.submitting.set(true)`.

  **Files:**
  - `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts`

  **Verify:** `ng build --configuration production` → zero errors. Manual: enter `notanemail` in the email field and click Checkout — the error message appears and no API call is made.

---

- [ ] 9. **Add numeric text input for target amount in the modal template**

  **In `confirm-claim-modal.component.ts`:** Add a new protected method:
  ```typescript
  protected onTargetAmountInput(val: string): void {
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      const floor = this.absoluteMinimumClaim();
      const inc = this.minClaimIncrement();
      // Snap to nearest valid increment above floor
      const snapped = Math.max(floor, Math.round(parsed / inc) * inc);
      this.targetAmount.set(Math.round(snapped * 100) / 100);
    }
    this.quoteError.set(null);
  }
  ```

  **In `confirm-claim-modal.component.html`:** Find the Target Placement Amount row in the `calc-ledger`. Currently it shows `₹{{ (targetAmount() ?? 0) | number: '1.2-2' }}` as a static value. Locate the `±` increment buttons in the template (search for `addIncrement` and `subtractIncrement` — these may be outside the ledger, look for them in the full template). Add a numeric input adjacent to the existing `±` buttons:
  ```html
  <input
    type="number"
    class="amount-input"
    [ngModel]="targetAmount()"
    (ngModelChange)="onTargetAmountInput($event)"
    [min]="absoluteMinimumClaim()"
    [step]="minClaimIncrement()"
    [disabled]="submitting()"
    aria-label="Target placement amount in rupees"
  />
  ```
  Style it consistently with existing inputs (reuse existing `input` styles from the component's SCSS). Place it between the `−` and `+` buttons replacing or supplementing the static display.

  **Note:** Read the full HTML template carefully before editing to find the exact location of the ± buttons — they were not visible in the portion rendered above (they may be in the summary row or a separate control block not shown).

  **Files:**
  - `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts`
  - `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.html`
  - `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.scss` (add `.amount-input` styles if needed)

  **Verify:** `ng build --configuration production` → zero errors. Manual: type `500` in the amount input and confirm `targetAmount()` updates and payable amount recalculates.

---

- [ ] 10. **Improve loading copy during session creation**

  **In `confirm-claim-modal.component.ts`:** Add a new signal:
  ```typescript
  protected readonly checkoutStage = signal<'idle' | 'quoting' | 'creating' | 'redirecting'>('idle');
  ```
  In `proceedToCheckout()`:
  - When `this.submitting.set(true)` is called, also call `this.checkoutStage.set('quoting')`.
  - After `this.quoteValidating.set(false)` (quote succeeded), call `this.checkoutStage.set('creating')`.
  - Just before `window.location.href = session.checkoutUrl`, call `this.checkoutStage.set('redirecting')` and add a 300ms delay: `await new Promise(r => setTimeout(r, 300))`.
  - In the catch block and early returns, call `this.checkoutStage.set('idle')`.
  - In the constructor effect (modal reset), call `this.checkoutStage.set('idle')`.

  **In `confirm-claim-modal.component.html`:** In the submit button, replace the existing `@if (submitting())` block:
  ```html
  @if (submitting()) {
    @if (checkoutStage() === 'quoting') {
      <span>Validating Quote...</span>
    } @else if (checkoutStage() === 'creating') {
      <span>Creating secure checkout...</span>
    } @else if (checkoutStage() === 'redirecting') {
      <span>Redirecting you now...</span>
    } @else {
      <span>Processing...</span>
    }
  } @else {
    <span>💳 Checkout with Dodo Payments • ₹{{ payableAmount() | number: '1.2-2' }}</span>
  }
  ```
  Remove the now-redundant `quoteValidating` signal display (it is replaced by `checkoutStage`). Keep `quoteValidating` signal itself until confirming no other template reference uses it.

  **Files:**
  - `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts`
  - `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.html`

  **Verify:** `ng build --configuration production` → zero errors.

---

- [ ] 11. **Rename "Previous Payment Credited" label**

  In `confirm-claim-modal.component.html`, find the `calc-ledger__item-title` that reads `"Previous Payment Credited"`. Replace with `"Credit from your active placement"`. The surrounding `@if (isReclaim())` context and `credit-pill` badge can stay.

  The description line below it currently reads `'Paid previously on this domain'` — change to `'Your existing rank score carries forward'` to complete the reframe.

  **Files:**
  - `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.html`

  **Verify:** `ng build --configuration production` → zero errors. Manual: open claim modal for an existing listing — confirm the updated label appears.

---

- [ ] 12. **Fix `returnUrl` fallback in `PaymentsController.cs` using config**

  Inject `IConfiguration` into `PaymentsController`:
  ```csharp
  public class PaymentsController(
      ISender sender,
      ILogger<PaymentsController> logger,
      IConfiguration configuration) : ControllerBase
  ```

  In `CreateDodoSession`, replace the fallback origin logic:
  ```csharp
  if (string.IsNullOrWhiteSpace(returnUrl))
  {
      var frontendBase = configuration["DodoPayments:FrontendBaseUrl"]
          ?? Request.Headers.Origin.FirstOrDefault()
          ?? Request.Headers.Referer.FirstOrDefault()
          ?? "http://localhost:4200";
      returnUrl = $"{frontendBase.TrimEnd('/')}/payment-success";
  }
  ```

  In `appsettings.json`, add under `DodoPayments`:
  ```json
  "FrontendBaseUrl": "http://localhost:4200"
  ```

  In `appsettings.Production.json`, add under `DodoPayments`:
  ```json
  "FrontendBaseUrl": "https://rankup.so"
  ```
  (Use the production domain. Check `appsettings.Production.json` for any existing domain hints — the CORS `AllowedOrigins` array is currently empty, but `BaseUrl` is `https://live.dodopayments.com` which is the Dodo API, not the frontend. Use `https://rankup.so` as a placeholder — the deployer must confirm the actual production frontend URL.)

  **Files:**
  - `backend/ranker/Controllers/PaymentsController.cs`
  - `backend/ranker/appsettings.json`
  - `backend/ranker/appsettings.Production.json`

  **Verify:** `dotnet build` → zero errors. Manual: POST to `/api/payments/dodo/create-session` without a `returnUrl` field and confirm the returned session's `returnUrl` uses `http://localhost:4200/payment-success` (dev) rather than whatever the `Origin` header happens to be.

---

## Dependency Map

```
Task 1 (webhook security)        — no deps
Task 2 (lock /api/claims)        — after Task 1 (conceptually aligned; Task 3 removes the only FE caller)
Task 3 (remove modal dead code)  — after Task 2 (removes the caller of the locked endpoint)
Task 4 (remove openTerminal)     — after Task 3 (Task 3 removes closeTerminal call sites)
Task 5 (failed/cancelled webhooks) — after Task 1 (shares the same handler file)
Task 6 (payment result page UX)  — after Task 7's from-param is wired (but can be done in same pass)
Task 7 (pass `from` param)       — independent; do before Task 6 so they can be tested together
Task 8 (email validation)        — independent; needs clean modal baseline (after Task 3)
Task 9 (numeric amount input)    — independent; needs clean modal baseline (after Task 3)
Task 10 (loading copy)           — independent; needs clean modal baseline (after Task 3)
Task 11 (label rename)           — fully independent; purely cosmetic
Task 12 (returnUrl config)       — fully independent; backend-only
```

## Verification

**Date:** 2026-10-08

**Backend build (`dotnet build`):** Passed — zero C# compile errors. Only MSB3026/3027 file-lock warnings were emitted because the running dev server process had the exe locked; these are not compilation errors.

**Frontend build (`npx ng build --configuration production`):** Passed — exit code 0, zero TypeScript/template errors. Bundle generation complete in 12.4s.

**Notes:**
- `appsettings.Production.json` changes could not be committed (file is gitignored in this repo). The `FrontendBaseUrl: "https://rankup.so"` value should be applied manually or via environment variable `DodoPayments__FrontendBaseUrl` in production.

## Files changed summary

| File | Tasks |
|------|-------|
| `backend/ranker/Application/Payments/ProcessDodoWebhookCommandHandler.cs` | 1, 5 |
| `backend/ranker/Controllers/PaymentsController.cs` | 12 |
| `backend/ranker/Controllers/ClaimsController.cs` | 2 |
| `backend/ranker/appsettings.json` | 1, 12 |
| `backend/ranker/appsettings.Development.json` | 1 |
| `backend/ranker/appsettings.Production.json` | 12 |
| `ranker.ui/src/app/core/services/dodo-payments.service.ts` | 4 |
| `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts` | 3, 7, 8, 9, 10 |
| `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.html` | 3, 9, 10, 11 |
| `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.scss` | 9 (if needed) |
| `ranker.ui/src/app/features/payment-success/payment-success.component.ts` | 6 |
| `ranker.ui/src/app/features/payment-success/payment-success.component.html` | 6 |
