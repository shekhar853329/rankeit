# Payment Failure & Pending State Investigation

**Project:** rankeit  
**Date:** 2025  
**Scope:** Backend payment flow, domain models, database schema, frontend UX

---

## Summary Answer

**Failed payments are partially recorded. Pending payments are NOT recorded at all.** The system records a `PaymentAuditLog` row when a Dodo Payments checkout session is created, and another when a webhook event arrives — but the status of the payment itself (pending, failed, cancelled) is never persisted into the database in a queryable, user-accessible way. A user has no screen, page, or API endpoint to view their past failed or pending transactions. The only user-facing state tracking happens on the `/payment-success` landing page, which reads the Dodo gateway live at the moment of redirect — if the user navigates away before landing there, or if the gateway status is still pending, the information is lost.

---

## Evidence

### 1. Payment States / Statuses in the System

There is no `PaymentStatus` enum or status column in any database table owned by the application. Payment status lives exclusively at the Dodo Payments gateway. The application checks status strings from the Dodo API inline:

- `"succeeded"` — the only status that triggers claim placement
- `"failed"` — recognized by the webhook handler but no DB action taken
- `"cancelled"` — recognized by the webhook handler but no DB action taken
- `"pending"` — **never explicitly handled anywhere in the codebase**

**Evidence file:** `backend/ranker/Application/Payments/ProcessDodoWebhookCommandHandler.cs` lines 55–70:

```csharp
else if (string.Equals(eventType, "payment.failed", StringComparison.OrdinalIgnoreCase))
{
    var paymentId = ExtractPaymentId(root);
    logger.LogWarning("Webhook payment.failed received. PaymentId={PaymentId}. No action taken — claim not reversed.", paymentId);
}
else if (string.Equals(eventType, "payment.cancelled", StringComparison.OrdinalIgnoreCase))
{
    var paymentId = ExtractPaymentId(root);
    logger.LogInformation("Webhook payment.cancelled received. PaymentId={PaymentId}. No action taken.", paymentId);
}
```

The comment "No action taken" is accurate — no row is written to record the user's failed/cancelled payment with their identity.

---

### 2. What Is Recorded When a Payment Fails

#### 2a. Session creation success/failure

`CreateDodoSessionCommandHandler.cs` writes a `PaymentAuditLog` row in both the success and catch paths. On failure, `IsSuccess = false` and `ErrorMessage` is set. However, this only records a failure to **create the checkout session** (i.e. a backend error calling the Dodo API) — not a user's payment being declined by the card network.

#### 2b. Webhook events

`ProcessDodoWebhookCommandHandler.cs` writes a `PaymentAuditLog` row for every webhook received:

```csharp
var isSuccess = string.Equals(eventType, "payment.succeeded", StringComparison.OrdinalIgnoreCase);
var audit = new PaymentAuditLog
{
    Action = eventType ?? "Webhook",    // e.g. "payment.failed"
    Gateway = "DodoPayments",
    PaymentId = command.WebhookId,      // ← note: this stores the webhook-id, NOT the payment-id
    RequestPayloadJson = command.RawBody,
    IsSuccess = isSuccess,
    CreatedAt = DateTime.UtcNow,
};
```

So a `payment.failed` webhook **does** produce a `PaymentAuditLog` row, but:
- The `PaymentId` field is set to `command.WebhookId` (the webhook delivery ID), **not** the actual Dodo `payment_id`
- There is no `CustomerEmail`, `UserId`, `SessionId`, or any user identifier stored in this row
- This table has no user-facing API endpoint — it is an internal ops audit table

#### 2c. Pending state — nothing recorded

There is no code anywhere that writes a record when a payment enters or stays in `pending` state. The flow is:
1. Session created → `PaymentAuditLog` row (action=`CreateSession`, orderId=sessionId)
2. User redirected to Dodo checkout
3. User completes/abandons/fails → Dodo optionally sends a webhook
4. User lands on `/payment-success` → backend calls Dodo API live to verify

Between steps 2 and 4, if the user closes the browser or the payment sits pending, the system has **no record that this user attempted a payment**.

---

### 3. No User-Facing Transaction History

Searching all controllers:

| Controller | Relevant endpoints |
|---|---|
| `PaymentsController` | `POST /api/payments/dodo/create-session`, `GET /api/payments/dodo/status/{sessionId}`, `GET /api/payments/dodo/verify/{paymentId}`, `POST /api/payments/dodo/verify`, `POST /api/payments/dodo/webhook` |
| `ClaimsController` | `POST /api/claims` (deprecated, 410), `POST /api/claims/calculate` |

There is **no** `GET /api/payments/history`, `GET /api/payments/user/{email}`, or any endpoint that returns a list of past transactions for a user. There is no admin endpoint to query `ClaimReconciliations` either.

**Evidence:** `backend/ranker/Controllers/PaymentsController.cs` — all five endpoints are write/verify-only or require a specific known paymentId/sessionId.

**Frontend routes** (`ranker.ui/src/app/app.routes.ts`):

```typescript
{ path: 'payment-success', loadComponent: ... }
```

There is no `/payment-history`, `/my-payments`, or `/transactions` route defined.

---

### 4. What Happens on the `/payment-success` Page

`payment-success.component.ts` reads `status` from the URL query parameters (`?status=failed`, `?status=cancelled`, `?status=succeeded`). Dodo appends these to the `returnUrl`.

- `status === 'cancelled'` → shows a "Payment Cancelled" UI, no API call made
- `status === 'failed'` → shows a "Payment Failed" UI, no API call made
- `status === 'succeeded'` (or no status) → calls `POST /api/payments/dodo/verify` which calls the Dodo API live

**Critical gap:** When `status` is `failed` or `cancelled`, the component displays a static error page. **No record is written to the backend.** The user cannot come back later and see what happened.

**Evidence:** `payment-success.component.ts` lines 57–62:
```typescript
if (st === 'cancelled' || st === 'failed') {
  this.loading.set(false);
} else if (pid || sid) {
  this.verify(pid, sid);
}
```

---

### 5. What Happens to a Claim When Payment Fails or Stays Pending

**A claim is only ever placed after a `succeeded` payment.** The full sequence is:

1. `VerifyDodoPaymentCommandHandler` checks `payment.Status == "succeeded"`; any other status returns `Verified: false` with an error message
2. Only on success does it call `PlaceClaimCommand`
3. `PlaceClaimCommandHandler` writes the `Claim` row and updates the `Listing.CurrentClaimAmount`

So if payment fails or stays pending:
- **No `Claim` row is created**
- **No `Listing` is created or updated**
- The leaderboard is unaffected

This is correct behavior. However, the user gets no persistent record of their attempt.

**Special case: race-condition rejection (ClaimReconciliation)**

`PlaceClaimCommandHandler.cs` lines ~115–145: if a payment *succeeds* at the gateway but the claim is then rejected by the `ClaimDecisionEngine` (e.g. a concurrent claimant beat them), a `ClaimReconciliation` row is written for ops to process a manual refund. This covers the "payment captured but claim rejected" scenario. There is no user-facing endpoint to query this table.

---

### 6. Webhook Coverage

`ProcessDodoWebhookCommandHandler` handles:
- `payment.succeeded` → triggers full `VerifyDodoPaymentCommand` → `PlaceClaimCommand`
- `payment.failed` → logs warning only, no DB record
- `payment.cancelled` → logs info only, no DB record

There are **no background jobs** in `Program.cs`. No `IHostedService` or scheduled task polls Dodo for pending payment states. If a payment sits in `pending` indefinitely (network timeout, bank delay), nothing in the system resolves it — the webhook is the only mechanism, and only the `payment.succeeded` variant is acted on.

**Evidence:** `Program.cs` — no `AddHostedService` registrations for payment polling.

---

### 7. Database Tables Summary

| Table | What it stores | User-visible? |
|---|---|---|
| `Claims` | Successful, fulfilled claims only | Yes (via listing detail page claim history, masked `PaymentReference`) |
| `PaymentAuditLogs` | Ops audit: session creation, webhook events, claim placement logs | No — no public API |
| `ClaimReconciliations` | Payments captured but claim rejected (race conditions) | No — no public API |
| `Listings` | Active listings with current claim amount | Yes (leaderboard) |

---

## Conclusions

1. **Failed payments**: A `PaymentAuditLog` row is written if Dodo sends a `payment.failed` webhook, but it doesn't include user-identifying info and there's no user-facing way to query it.

2. **Pending payments**: Completely invisible to the system. No row of any kind is written when a payment enters or stays in pending state.

3. **User self-service tracking**: Zero. There is no "my transactions" page, no email notification on failure, and no way for a user to look up a past failed/pending attempt by email or any other identifier.

4. **Claim integrity**: Correct — claims are only placed after verified `succeeded` payments. The `ClaimReconciliation` table handles the race-condition edge case properly.

5. **No background recovery**: No polling job resolves stuck pending payments. The system relies entirely on Dodo webhook delivery for `payment.succeeded`. If the webhook is missed or delayed, the user would need to manually navigate back to `/payment-success?payment_id=<id>` to trigger re-verification.

---

## Recommendations

### High Priority

**1. Record a `PendingPayment` (or enrich `PaymentAuditLog`) on session creation with user context**

When `CreateDodoSessionCommand` runs, store `CustomerEmail`, `SessionId`, `PaymentId` (once available), `AmountInMinorUnits`, `Currency`, `Status = "pending"`, and `CreatedAt`. This is the minimal change to give ops visibility into attempted transactions.

**Files to change:**
- `backend/ranker/Domain/Entities/PaymentAuditLog.cs` — add `CustomerEmail`, `Status` fields
- `backend/ranker/Application/Payments/CreateDodoSessionCommandHandler.cs` — populate those fields on the audit row
- `backend/ranker/Application/Payments/ProcessDodoWebhookCommandHandler.cs` — update status on `payment.failed`/`payment.cancelled` webhooks

---

**2. Expose a user-facing "my transactions" endpoint**

Add `GET /api/payments/history?email={email}` (protected, or require email+a token) that queries `PaymentAuditLogs` filtered by `CustomerEmail`. Return status, amount, date, and outcome.

**Files to create/change:**
- New query handler: `Application/Payments/GetPaymentHistoryQuery.cs`
- `Controllers/PaymentsController.cs` — add the new endpoint

---

**3. Add a "Payment History" route in the Angular frontend**

A page at `/my-payments` (or surfaced in a user profile) that calls the history endpoint and shows status (pending / succeeded / failed), amount, and date. The `payment-success.component` already has the pattern for reading `paymentId` from URL params and calling the backend.

**Files to create/change:**
- `ranker.ui/src/app/features/payment-history/` — new component
- `ranker.ui/src/app/app.routes.ts` — add `/my-payments` route
- `ranker.ui/src/app/core/services/dodo-payments.service.ts` — add `getPaymentHistory(email)` method

---

**4. Update webhook handler to record `payment.failed` and `payment.cancelled` with user context**

Currently `ProcessDodoWebhookCommandHandler.cs` does log a `PaymentAuditLog` row for failed/cancelled events, but it stores `webhookId` in the `PaymentId` column instead of the actual payment ID. Fix the mapping and add `CustomerEmail` extraction from the webhook payload.

**File to change:**
- `backend/ranker/Application/Payments/ProcessDodoWebhookCommandHandler.cs` — extract actual `payment_id` and `customer.email` from the payload and store correctly

---

### Medium Priority

**5. Add a background polling job for stuck pending payments**

Implement an `IHostedService` that periodically queries `PaymentAuditLogs` for rows with `Status = "pending"` older than N minutes, calls `GetSessionStatusAsync`/`GetPaymentAsync`, and updates or re-triggers verification. This closes the gap where a webhook is missed.

---

**6. Send an email notification on payment failure**

When a `payment.failed` webhook arrives (or when verification returns a non-succeeded status), send a transactional email to the customer email stored in the payment metadata. Currently no such notification exists.
