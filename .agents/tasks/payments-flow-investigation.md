# Payments Flow Investigation Report
**RankIt / RankUp — DoDo Payments Integration Review**

---

## Executive Summary

The current implementation is **mostly correct** in its backend architecture and aligns well with DoDo Payments' recommended checkout-session pattern. The frontend recently changed from an inline/overlay terminal approach to a **full-page redirect** — which is the right direction — but the migration left behind dead code, a hardcoded `mode: 'test'` in the SDK initialization, and a missing payment-failure page. The biggest gaps are:

1. **Webhook signature verification is not implemented** — the webhook endpoint accepts any payload without verifying its authenticity.
2. **Hardcoded `mode: 'test'`** in the frontend DoDo SDK initialization regardless of environment.
3. **`handleDodoPaymentSuccess` is dead code** — it was the old terminal-based post-payment flow and is never called.
4. **No dedicated failure/cancel return page** — the payment-success page handles both success and errors, which creates a confusing UX for failed payments.
5. **`WebhookKey` is empty string** in `appsettings.json`, so even if verification were implemented it would fail.
6. **`PlaceClaim` is called directly from the frontend** (`ClaimsController`) in the old path — that endpoint remains open and unauthenticated, creating a potential bypass route.
7. **Minor:** `DodoPayments.Initialize` / `openTerminal` in the service file are never used in the current live flow but are still initialized with `mode: 'test'`.

---

## 1. Current Backend Payment Flow (Step by Step)

### A. Session Creation
**Endpoint:** `POST /api/payments/dodo/create-session`
**File:** `Controllers/PaymentsController.cs`, `Application/Payments/CreateDodoSessionCommandHandler.cs`

1. Frontend POSTs a `CreateDodoSessionRequestDto` (amount in minor units, email, listingId, categoryId, metadata, etc.).
2. Controller validates minimum amount (≥100 minor units) and fills `returnUrl` from request origin if not provided (defaults to `{origin}/payment-success`).
3. CQRS command dispatched to `CreateDodoSessionCommandHandler`.
4. Handler enriches metadata with `listingName`, `listingId`, `categoryId`, `ownerContactEmail`, `targetClaimAmount`, `chargeAmount`, etc.
5. Calls `DodoPaymentsService.CreateCheckoutSessionAsync()` → POSTs to Dodo API `POST /checkouts`.
   - Always sends `minimal_address: true` with a hardcoded fallback Bengaluru address.
   - Sets `customization.theme: "dark"`.
   - Passes `billing_currency` and `customer` fields.
6. Dodo returns `session_id` + `checkout_url`.
7. Audit log record created (`PaymentAuditLog`, Action=`"CreateSession"`).
8. Returns `{ sessionId, checkoutUrl }` to the frontend.

### B. Customer Checkout (Hosted at Dodo)
- Customer is redirected to Dodo's hosted checkout page (`checkout_url`).
- Dodo collects payment details, processes payment.
- After completion, Dodo redirects customer back to the `return_url` with query params: `payment_id`, `status`, `email`.

### C. Webhook (Server-Side Confirmation)
**Endpoint:** `POST /api/payments/dodo/webhook`
**File:** `Application/Payments/ProcessDodoWebhookCommandHandler.cs`

1. Controller reads raw body and headers (`webhook-id`, `webhook-signature`, `webhook-timestamp`).
2. Passes all to `ProcessDodoWebhookCommand` — **but the handler never verifies the signature**. It proceeds immediately to parse the JSON payload.
3. If `event.type == "payment.succeeded"`, extracts `payment_id` from `data.payment_id` or `data.id`.
4. Dispatches `VerifyDodoPaymentCommand` with the payment ID → triggers full claim placement.
5. Logs audit record.
6. Returns `{ received: true }`.

**Critical gap:** The `Signature`, `WebhookId`, and `Timestamp` fields are received and forwarded but never used for verification. Anyone who knows the endpoint URL can POST a fake `payment.succeeded` event and trigger a free claim placement.

### D. Payment Verification + Claim Placement
**Endpoint:** `GET /api/payments/dodo/verify/{paymentId}` or `POST /api/payments/dodo/verify`
**File:** `Application/Payments/VerifyDodoPaymentCommandHandler.cs`

1. If only `sessionId` provided, calls `GetSessionStatusAsync` to resolve `paymentId`.
2. Checks DB for existing claim with this `PaymentReference` (idempotency guard — prevents double-fulfillment).
3. Calls `DodoPaymentsService.GetPaymentAsync(paymentId)` → `GET /payments/{id}` on Dodo API.
4. Validates `payment.Status == "succeeded"`.
5. Extracts metadata fields: `categoryId`, `listingId`, `listingName`, `listingUrl`, `ownerContactEmail`, `targetClaimAmount`, `chargeAmount`.
6. Validates `categoryId` is present (returns error if missing).
7. Dispatches `PlaceClaimCommand` → runs serializable DB transaction to place the claim.
8. Returns `VerifyDodoPaymentResponseDto` with `Verified`, `Amount`, `ListingId`, `NewClaimAmount`.

### E. Session Status Check
**Endpoint:** `GET /api/payments/dodo/status/{sessionId}`

Calls `DodoPaymentsService.GetSessionStatusAsync()` → `GET /checkouts/{sessionId}` on Dodo, returns `paymentId`, `paymentStatus`, `isPaid`.

### F. Direct Claim Placement (Legacy Bypass Route)
**Endpoint:** `POST /api/claims`
**File:** `Controllers/ClaimsController.cs`

This endpoint is entirely unauthenticated and accepts a `PlaceClaimRequestDto` with any `PaymentReference` string. The frontend `ClaimService.placeClaim()` still calls this directly in `handleDodoPaymentSuccess` — but that method is now dead code (see Section 3). However the endpoint still exists open on the server.

---

## 2. Current Frontend Payment Flow (Step by Step)

### A. Claim Initiation (Three Entry Points)
1. **Leaderboard page** (`features/leaderboard/leaderboard.component.ts`): User enters URL + picks category → calls `modalService.openClaimModal(payload)`.
2. **Global Leaderboard** (`features/global-leaderboard/global-leaderboard.component.ts`): Same pattern.
3. **Listing Detail** (`features/listing-detail/listing-detail.component.ts`): "Claim" button → `openClaimModal()`.

### B. Claim Modal (Step 1 — Confirmation Screen)
**File:** `shared/confirm-claim-modal/confirm-claim-modal.component.ts`

1. Modal opens with `ClaimModalPayload` — pre-filled with listingUrl, categoryId, currentClaimAmount, etc.
2. User enters their **owner contact email**.
3. Domain lookup: reactive stream debounces URL changes → calls `ListingService.lookupListing()` → identifies existing listing (reclaim) or new listing.
4. Metadata scraping via `UrlMetadataService` for new listings (siteName, logoUrl, etc.).
5. Category benchmarks loaded from `LeaderboardService`.
6. User adjusts **target claim amount** (± increment buttons, "Set Rank #1" shortcut).
7. **Payment breakdown** shows: Target Amount → minus credited previous payment → = Net Due Now.
8. User checks ToS checkbox.
9. Clicks **"Checkout with Dodo Payments • ₹X"**.

### C. Checkout Flow (`proceedToCheckout()`)
1. Calls `ClaimService.calculateClaimQuote()` → `POST /api/claims/calculate` to get server-authoritative charge amount.
2. Validates quote success, charge ≥ ₹1.
3. Builds metadata dictionary with all claim context.
4. Calls `DodoPaymentsService.createSession()` → `POST /api/payments/dodo/create-session`.
5. Receives `{ sessionId, checkoutUrl }`.
6. Closes the modal.
7. **`window.location.href = session.checkoutUrl`** — full-page redirect to DoDo hosted checkout.

### D. Return from DoDo Checkout
DoDo redirects to `/payment-success?payment_id=XXX&status=succeeded&email=user@example.com`.

**File:** `features/payment-success/payment-success.component.ts`

1. `ngOnInit()` reads query params: `payment_id`, `status`, `email`, `session_id`.
2. If `payment_id` or `session_id` present, calls `DodoPaymentsService.verifyPaymentPost()` → `POST /api/payments/dodo/verify`.
3. Shows loading spinner while verifying.
4. On success: renders confirmation card with amount paid, leaderboard score, payment reference, timestamp.
5. On error: renders error card with payment reference and "Go to Home" button.

**Note:** If payment was cancelled or failed, DoDo still redirects to the same `return_url` with `status=failed` or `status=cancelled`. The payment-success page calls verify anyway — which will return `Verified: false` with an error message — and shows the error state. There is no dedicated failure/cancel page.

### E. Dead Code: `handleDodoPaymentSuccess`
The method `handleDodoPaymentSuccess()` in `confirm-claim-modal.component.ts` (lines 527–620) is defined but **never called**. It contains the old inline-terminal flow: poll for payment → call `ClaimService.placeClaim()` directly → render success/failure in the modal. This entire code path was the pre-redirect implementation and should be removed.

### F. SignalR — Not Used in Payments
The `SignalrService` handles `RankUpdated`, `OnlineUsersUpdated`, `ListingClicked`, and `VisitsTodayUpdated` events. There are no payment-related SignalR events. After a successful `PlaceClaim`, a `ClaimPlacedEvent` is published server-side (via MediatR), which likely triggers the `RankUpdated` push — so the leaderboard updates live after payment. But the payment-success page does not subscribe to any SignalR events; it relies purely on the verify API call.

---

## 3. Comparison Against DoDo Payments Standard Flow

| Step | DoDo Standard | Current Implementation | Status |
|------|--------------|----------------------|--------|
| Create session server-side | ✅ Required | ✅ Done via `POST /api/payments/dodo/create-session` | ✅ Correct |
| Redirect to checkout_url | ✅ Required | ✅ `window.location.href = checkoutUrl` | ✅ Correct |
| Return URL with `payment_id` + `status` | ✅ Expected | ✅ Handled in `PaymentSuccessComponent` | ✅ Correct |
| Webhook `payment.succeeded` fulfillment | ✅ Recommended as source of truth | ⚠️ Handler exists but **signature NOT verified** | ❌ Bug |
| Webhook signature verification (Standard Webhooks spec) | ✅ Required | ❌ Headers received but never verified | ❌ Missing |
| Idempotency (prevent double-fulfillment) | ✅ Required | ✅ DB check on `PaymentReference` before re-placing | ✅ Correct |
| Checkout URL single-use | ✅ DoDo generates single-use URLs | ✅ Always creates fresh session per attempt | ✅ Correct |
| `mode` in SDK init | Should match environment | ❌ Always `'test'` in production | ❌ Bug |
| Handle `payment.failed` webhook | ✅ Recommended | ❌ Not handled (only `payment.succeeded`) | ⚠️ Gap |
| Handle `payment.cancelled` webhook | ✅ Recommended | ❌ Not handled | ⚠️ Gap |
| Dedicated failure return page | UX best practice | ❌ Same page handles success + failure + cancel | ⚠️ UX gap |
| Currency/billing address | Should be explicit | ✅ INR with fallback Bengaluru address (hardcoded) | ⚠️ Hardcoded |

---

## 4. UI/UX Improvement Areas

### 4.1 Missing Dedicated Payment Failure/Cancel Page
Currently `/payment-success` handles all return states. If DoDo redirects with `status=failed` or `status=cancelled`, the user lands on a page titled "payment-success" and sees an error card. This is confusing. Recommendations:
- Add a dedicated `/payment-result` or `/payment-status` page that branches on `status` param.
- Or keep `/payment-success` but set the page `<title>` and H1 dynamically ("Payment Cancelled", "Payment Failed", "Payment Confirmed").
- For cancelled state, show a clear message like "You cancelled the payment" with a prominent "Try Again" CTA that returns to the listing page.

### 4.2 No "Back to Checkout" After Return from DoDo
When a user lands on `/payment-success` after a failed/cancelled payment, the only action is "Go to Home." They lose their context (which listing they were trying to claim). Recommendations:
- Pass `session_id` in metadata or as a query param so the success page can deep-link back to the specific listing/category.
- The `returnUrl` could include a `from` param like `?from=/categories/saas` so the error state can show "Return to SaaS leaderboard."

### 4.3 The Claim Modal Has a Confusing Step Split
The modal shows a "Confirm & Pay" view (Step 1) and was originally designed to show the DoDo terminal inline (Step 2). The code still has `currentStep = signal<1 | 2>()`, a `terminalLoading` signal, `activeSessionId`, `activeCheckoutUrl`, `goToStep1()`, and `retryPayment()` signals — all of which are now dead states because the user is redirected away. Removing or repurposing these would clean up the modal considerably.

### 4.4 Loading State During Session Creation
After the user clicks "Checkout with Dodo Payments", the button shows "Redirecting to Dodo Payments…" while the session API is called. There's no estimated time or visual progress indicator. For slow connections this could feel stuck. A brief skeleton or progress bar would help. Consider showing "Creating secure checkout…" → "Redirecting you now…" in two stages.

### 4.5 No Email Pre-validation Before Redirect
The email field in the claim modal is not validated as a real email format (only `type="email"` input with `required`). If the user enters an invalid email, the claim is created, payment is made, but the metadata-stored `ownerContactEmail` would be invalid — breaking any future reclaim since the email won't match. Add Angular reactive form validation or at minimum a regex check before `proceedToCheckout()` proceeds.

### 4.6 Target Amount Input Lacks a Spinner or Range Slider
The `+`/`−` increment buttons add/subtract the category's `minClaimIncrement`. There is no free-text input for the target amount. If `minClaimIncrement` is ₹1, a user wanting ₹500 has to click 500 times. Adding a direct numeric input alongside the buttons (or a range slider) would dramatically improve UX.

### 4.7 Reclaim Credit Flow Could Be Clearer
The payment breakdown shows "Previous Payment Credited" with the existing claim amount as a deduction. This is correct, but the label "Previous Payment Credited" may mislead users — it suggests a refund or credit note. A clearer label: "Your existing rank score (carries forward)" or "Credit from your active placement: ₹X."

### 4.8 Success Page Missing Leaderboard Link to Specific Category
The success page has a "View on Leaderboard 🚀" button that links to `/` (home). It should link directly to the category leaderboard where the claim was placed (e.g., `/categories/saas`). The `verification.listingId` and `categoryId` are available in the verify response — use them to build a direct URL.

---

## 5. Bugs and Missing Error Handling

### Bug 1: Webhook Signature Not Verified (Security Critical)
**Files:** `ProcessDodoWebhookCommandHandler.cs`, `Controllers/PaymentsController.cs`
**Issue:** The `Signature`, `WebhookId`, and `Timestamp` headers are extracted and passed into the command but the handler never calls any HMAC/Standard Webhooks verification. The `WebhookKey` is also empty string in `appsettings.json`.
**Risk:** Any actor can POST a fake `payment.succeeded` payload to `/api/payments/dodo/webhook` and trigger a free claim placement.
**Fix:** Use the [Standard Webhooks](https://www.standardwebhooks.com/) spec (which DoDo follows) to verify the HMAC-SHA256 signature. Add `WebhookKey` to secure config (not `appsettings.json`). Verify before processing any event.

### Bug 2: Frontend SDK Hardcoded `mode: 'test'`
**File:** `ranker.ui/src/app/core/services/dodo-payments.service.ts`, line 89
**Issue:** `DodoPayments.Initialize({ mode: 'test', ... })`. This `openTerminal()` method is not currently called in the live flow (the redirect approach is used instead), but the function is still in the service and will break if anyone calls it in production.
**Fix:** Remove the hardcoded `mode: 'test'` and derive it from config/environment, or remove the dead `openTerminal` method entirely.

### Bug 3: Dead Code — `handleDodoPaymentSuccess` Method
**File:** `confirm-claim-modal.component.ts` (lines 527–620)
**Issue:** This private method is defined but never called. It was the old inline-terminal post-payment handler that called `ClaimService.placeClaim()` directly after payment confirmation. The current flow uses the verify-endpoint on the return page instead.
**Impact:** Dead code is not a runtime bug but it references `ClaimService.placeClaim()` which is the unauthenticated direct bypass endpoint — leaving it present creates confusion and risk.
**Fix:** Delete the method. If the old inline-terminal flow is ever restored, it should be rewritten to use the verify endpoint, not `placeClaim` directly.

### Bug 4: `POST /api/claims` is an Unauthenticated Claim Bypass
**File:** `Controllers/ClaimsController.cs`
**Issue:** This endpoint accepts `PlaceClaimRequestDto` with a `PaymentReference` field that is never validated against actual Dodo payment records. Any string is accepted. While the `handleDodoPaymentSuccess` dead code was the only frontend caller, the endpoint is still reachable.
**Fix:** Either authenticate this endpoint (JWT/API key), remove it, or at minimum add a validation step that calls `DodoPaymentsService.GetPaymentAsync` to confirm the `PaymentReference` actually corresponds to a succeeded payment before placing the claim.

### Bug 5: No Payment Failure/Cancelled Webhook Handlers
**File:** `ProcessDodoWebhookCommandHandler.cs`
**Issue:** Only `payment.succeeded` events are handled. DoDo also sends `payment.failed`, `payment.cancelled`, and `payment.processing`. If a claim fulfillment fails but the webhook wasn't successfully processed (network error, crash), and the customer's card was charged, there's no automated recovery path.
**Fix:** Handle `payment.failed` to trigger an alert/reconciliation. Handle `payment.processing` by queueing a status check. The existing `ClaimReconciliation` table is a good start — auto-populate it from failed webhook events too.

### Bug 6: `returnUrl` Falls Back to `Origin/payment-success` — May Fail in SSR
**File:** `Controllers/PaymentsController.cs`
**Issue:** If `returnUrl` is not provided, the backend builds one from `Request.Headers.Origin` or `Referer`. In SSR scenarios or if `Origin` header is absent, this falls back to `http://localhost:4200/payment-success` — which would be in a response to a real user.
**Fix:** Require `returnUrl` as a mandatory field, or set a fallback base URL from config (`appsettings`).

### Bug 7: `WebhookKey` Stored Blank in `appsettings.json`
**File:** `backend/ranker/appsettings.json`
**Issue:** The `WebhookKey` field is empty string. If webhook verification is ever added, it will silently fail.
**Fix:** Populate via environment variable or secrets manager, not via `appsettings.json`. The `ApiKey` is currently committed as plain text in `appsettings.json` — this should also move to secrets.

---

## 6. DoDo Payments SDK Usage Notes

- The project imports `dodopayments-checkout` npm package and the `DodoPayments`, `CheckoutEvent`, `CheckoutBreakdownData` types are used in `dodo-payments.service.ts`.
- The `openTerminal()` method implements the overlay/inline SDK approach, which DoDo supports as an alternative to full-page redirect.
- Both approaches are valid per DoDo docs. The current implementation correctly uses the **full-page redirect** (simpler, more reliable for mobile/SSR), but the `openTerminal` infrastructure is entirely unused dead code.
- The SDK's `checkout.status`, `checkout.redirect`, and `checkout.redirect_requested` event handlers in the unused `openTerminal` method correctly attempt to extract `payment_id` from event data before calling `onSuccess`.

---

## 7. Config Keys in `appsettings.json` (names only)

Section: `DodoPayments`:
- `ApiKey` — Dodo API bearer token
- `BaseUrl` — currently `https://test.dodopayments.com` (test environment)
- `ProductId` — the Pay What You Want product ID
- `WebhookKey` — currently empty string
- `Mode` — currently `"test"`

**Note:** `BaseUrl` and `Mode` both point to test/sandbox. These need to change for production deployment.

---

## 8. Recommended Fixes (Priority Order)

| Priority | Fix |
|----------|-----|
| 🔴 P0 | Implement webhook signature verification (Standard Webhooks HMAC) |
| 🔴 P0 | Move `ApiKey` and `WebhookKey` out of `appsettings.json` into secrets |
| 🔴 P0 | Set `BaseUrl` and `Mode` to production values before go-live |
| 🔴 P0 | Authenticate or remove `POST /api/claims` to prevent claim bypass |
| 🟠 P1 | Remove dead `handleDodoPaymentSuccess` method and associated signals |
| 🟠 P1 | Fix `mode: 'test'` hardcode in `openTerminal` (or remove `openTerminal` entirely) |
| 🟠 P1 | Add dedicated payment failure/cancel UX on return page |
| 🟠 P1 | Handle `payment.failed` and `payment.cancelled` webhook events |
| 🟡 P2 | Add direct category link on success page ("View on SaaS Leaderboard") |
| 🟡 P2 | Pass `session_id` or `from` param in return URL for better back-navigation |
| 🟡 P2 | Add email format validation before `proceedToCheckout()` |
| 🟡 P2 | Add numeric input for target amount (not just ±buttons) |
| 🟢 P3 | Improve loading state copy during session creation |
| 🟢 P3 | Rename "Previous Payment Credited" to clearer label |
| 🟢 P3 | Clean up dead modal step signals (`currentStep`, `terminalLoading`, etc.) |

---

*Report generated by automated investigation — all findings are based on static code analysis of the repository at `c:\Users\shekh\source\repos\rankeit`.*
