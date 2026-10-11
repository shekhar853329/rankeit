# Payment UI Screens Investigation

**Project:** rankeit  
**Scope:** All UI projects — `ranker.ui` (Angular web app) and `rankup-mob` (Expo/React Native mobile app)  
**Date:** 2025

---

## Summary Answer

Payment ID and payment-related information is displayed in **5 distinct screens/components** across the two UI projects. All meaningful payment flows live in the Angular web app (`ranker.ui`). The mobile app (`rankup-mob`) has a claim modal but its payment flow is a stub that redirects users to the web app.

---

## Screens & Components

### 1. Payment Success Page — `/payment-success`

**Project:** `ranker.ui`  
**Files:**
- `ranker.ui/src/app/features/payment-success/payment-success.component.ts`
- `ranker.ui/src/app/features/payment-success/payment-success.component.html`

**Payment fields displayed:**

| Field | Source | Notes |
|---|---|---|
| Payment Reference (Payment ID) | `paymentId` signal / `payment_id` query param | Rendered with copy-to-clipboard. Shown in both the success and the error/verification-notice states. |
| Amount Paid (USD) | `verification().amount` | Shown as `$X.XX` in the hero "Amount Paid • USD" box |
| New/Active Placement Score | `verification().newClaimAmount` | Shown as "Active Placement Score" |
| Contact Email | `email` signal / `email` query param | Shown as "Contact Email" |
| Timestamp (UTC) | `now` (component init time) | Shown as "Timestamp (UTC)" |
| Verification Status | Hardcoded "Instant Live Activation" on success | Status chip |
| Payment Status (cancelled / failed / succeeded) | `status` signal / `status` query param | Controls which state view is rendered (Loading / Cancelled / Failed / Error / Success) |

**States rendered:**
- **Loading** — verifying payment
- **Cancelled** — no payment fields shown, just navigation buttons
- **Failed** — no payment fields shown
- **Error / Verification Notice** — shows Payment Reference if available
- **Success** — shows amount, Payment Reference, email, timestamp, placement score

---

### 2. My Transactions Page — `/my-transactions`

**Project:** `ranker.ui`  
**Files:**
- `ranker.ui/src/app/features/my-transactions/my-transactions.component.ts`
- `ranker.ui/src/app/features/my-transactions/my-transactions.component.html`

**How it works:** User enters email → API returns a list of `PaymentTransactionItem` records.

**Payment fields displayed per transaction row:**

| Field | Model Property | Notes |
|---|---|---|
| Transaction Status | `txn.transactionStatus` | Rendered as a styled status chip: Succeeded / Pending / Processing / Failed / Cancelled / Refunded |
| Amount | `txn.amount` | Displayed as `X.XX USD` (or `—` if null) |
| Currency | `txn.currency` | Shown alongside amount, defaults to `USD` |
| Action | `txn.action` | Action label shown next to amount |
| Payment ID | `txn.paymentId` | Truncated to 12 chars + `...` with full value in `title` tooltip |
| Date/Timestamp | `txn.createdAt` | Formatted with Angular's `date: 'medium'` pipe |
| Error Message | `txn.errorMessage` | Shown as a red error message row if present |

**Model interface:** `PaymentTransactionItem` in `ranker.ui/src/app/core/models/payment.model.ts`  
Also contains `sessionId` and `orderId` on the model — **not currently rendered** in the HTML template.

---

### 3. Listing Detail Page — `/listings/:listingId`

**Project:** `ranker.ui`  
**Files:**
- `ranker.ui/src/app/features/listing-detail/listing-detail.component.ts`
- `ranker.ui/src/app/features/listing-detail/listing-detail.component.html`

**What's shown:** A "Verified Placement Ledger" table showing the full payment history for a specific listing.

**Payment fields displayed per ledger row:**

| Field | Model Property | Notes |
|---|---|---|
| Date & Time (UTC) | `claim.createdAt` | Formatted with `date: 'medium'` |
| Standing Placement | `claim.amount` | The cumulative placement score at time of transaction |
| Payment Charged | `claim.paymentAmount` (falls back to `claim.amount`) | The actual charge for that transaction (new money paid) |
| Payment Reference | `claim.paymentReferenceMasked` | **Masked/partial** payment ID shown in a `<code>` tag |
| Settlement | Hardcoded "Settled" | Status pill, always shown as settled |

**Model interface:** `ClaimHistoryEntryDto` in `ranker.ui/src/app/core/models/listing-detail.model.ts`

> **Note:** The payment reference is **masked** here — only a partial ID is shown for privacy. Full IDs are only shown on the Payment Success page and the My Transactions page.

---

### 4. Confirm Claim Modal (Web) — Global Overlay

**Project:** `ranker.ui`  
**Files:**
- `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts`
- `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.html`

**What's shown:** A modal that opens from any leaderboard/listing page when a user clicks "Claim" or "Raise Placement."

**Payment fields shown (two states):**

**During checkout flow (pre-payment):**

| Field | Source | Notes |
|---|---|---|
| Target Placement Amount | `targetAmount` signal | User-editable with +/- stepper |
| Previous Payment Credit | `creditedAmount` computed | Shown as `-$X.XX` deduction in all-time mode |
| Net Amount Due Now | `payableAmount` computed | The actual charge amount |
| Existing claim amount | `existingClaimAmount` signal | Shown in "Active listing found" alert if reclaiming |

**Post-payment success receipt (within same modal before redirect):**

| Field | Source | Notes |
|---|---|---|
| Amount Paid | `details.amountPaid` | Hero display `$X.XX Amount Settled` |
| Listing / Product | `details.listingName` | |
| Product URL | `details.listingUrl` | |
| Current Total Placement | `details.newClaimAmount` | |
| Category | `details.categoryName` | |
| Payment Reference (Payment ID) | `details.paymentId` | Copyable with clipboard button |
| Session / Order ID | `details.orderId` | Shown if present |
| Date & Time | `details.timestamp` | `date: 'medium'` format |
| Status | Hardcoded "Settled & Secured" | |

**Post-payment failed receipt:**

| Field | Source | Notes |
|---|---|---|
| Error message | `details.errorMessage` | Shown as description |
| Attempted Amount | `details.amountPaid` | If present |
| Session ID | `details.orderId` | If present |

**Interface:** `CompletedTransactionDetails` defined in `confirm-claim-modal.component.ts`

> **Note:** In practice this modal currently **redirects to Dodo Payments** externally (Step 3 in `proceedToCheckout()`), so the success/failed receipt state within the modal may only be reached in legacy or test flows. The primary post-payment landing is the `/payment-success` page.

---

### 5. Confirm Claim Modal (Mobile) — Global Overlay

**Project:** `rankup-mob`  
**Files:**
- `rankup-mob/src/components/ConfirmClaimModal.tsx`

**What's shown:** Same concept as the web modal but in React Native. Contains a payment breakdown and a success receipt view.

**Payment fields shown:**

**During checkout flow (pre-payment):**

| Field | Source | Notes |
|---|---|---|
| Target Placement Amount | `targetAmount` state | With +/- stepper |
| Previous Payment Credit | `creditedAmount` (computed) | Shown as `-$X.XX` if reclaim |
| Net Amount Due | `payableAmount` (computed) | Bottom total |

**Post-payment success receipt:**

| Field | Source | Notes |
|---|---|---|
| Amount Paid | `receiptDetails.amountPaid` | `$X.XX Amount Settled` |
| Listing / Product | `receiptDetails.listingName` | |
| Product URL | `receiptDetails.listingUrl` | |
| New Placement Level | `receiptDetails.newClaimAmount` | |
| Category | `receiptDetails.categoryName` | |
| Ref ID (Payment ID) | `receiptDetails.paymentId` | Shown as plain text (no copy button) |

**⚠️ Important:** The mobile modal's `handleSubmit` function **does not actually process payments**. The submit path ends with:
```
setStatusMessage('Mobile payments are coming soon. Please visit rankup.so to complete your claim.');
```
The `receiptDetails` state is set but never populated via real payment data in the current code. **The success receipt view in mobile is effectively dead code** — it will never be triggered unless a payment result is injected externally.

---

## Other Screens Checked — No Payment Data Displayed

| Screen | Route / File | Verdict |
|---|---|---|
| Global Leaderboard | `/` | Shows `currentClaimAmount` as placement score, not a payment ID |
| Category Leaderboard | `/leaderboard/:slug` | Same — placement amounts only, no payment IDs |
| Website Profile | `/website/:slug` | Shows "Total Placements" count and `currentClaimAmount`, links to listing detail. No payment IDs. |
| Daily Listings | `/daily` | Shows `currentClaimAmount` only |
| Analytics Dashboard | `/analytics` | Traffic/GA metrics only — zero payment fields |
| Claim Hero (shared component) | `shared/claim-hero` | Pre-payment amount input only |
| Mobile Home/Index | `rankup-mob/src/app/(tabs)/index.tsx` | Leaderboard amounts only |
| Mobile Daily | `rankup-mob/src/app/(tabs)/daily.tsx` | Claim amounts only |
| Mobile Analytics | `rankup-mob/src/app/(tabs)/analytics.tsx` | GA traffic metrics only |

---

## Field Reference Summary

| Payment Field | Where Displayed |
|---|---|
| `paymentId` / Payment Reference | Payment Success page, My Transactions page, Confirm Claim Modal (web + mobile receipts), Listing Detail (masked) |
| `orderId` / Session ID | Confirm Claim Modal (web receipt), My Transactions model (not rendered in HTML) |
| `sessionId` | My Transactions model (not rendered in HTML) |
| `amount` / Amount Paid | Payment Success page, My Transactions, Confirm Claim Modal receipt, Listing Detail ledger |
| `currency` | My Transactions page |
| `transactionStatus` / Payment Status | My Transactions page (as styled status chips) |
| `errorMessage` | My Transactions page, Confirm Claim Modal failed state |
| `createdAt` / Date | My Transactions, Listing Detail ledger |
| `paymentAmount` (charge delta) | Listing Detail ledger ("Payment Charged" column) |
| `paymentReferenceMasked` | Listing Detail ledger only (partial/masked) |
| `newClaimAmount` | Payment Success page, Confirm Claim Modal receipts |

---

## Observations & Recommendations

1. **`orderId` and `sessionId` are on the `PaymentTransactionItem` model but not rendered in the My Transactions template.** If you want users to be able to look up transactions by session or order ID, these fields are being silently dropped. Consider whether to display or expose them.

2. **Payment Reference is masked in the Listing Detail ledger** (`paymentReferenceMasked`) but shown in full on the Payment Success page and My Transactions. This is a deliberate privacy decision — document it if not already noted in the API.

3. **The mobile app's payment flow is a stub.** `ConfirmClaimModal.tsx` shows a full payment breakdown UI but the submit path currently just displays a "coming soon" message. The success receipt view (which includes `receiptDetails.paymentId`) is unreachable. This could confuse users who see the UI but can't complete a payment in-app.

4. **The web Confirm Claim Modal has a payment receipt state** that is effectively bypassed in the current live flow (Dodo Payments redirects externally to `/payment-success`). The in-modal receipt code in `confirm-claim-modal.component.ts`/`.html` may be legacy or future code — verify whether it's still needed.

5. **No payment screens in the mobile app for post-payment.** The mobile app has no equivalent of the web's `/payment-success` or `/my-transactions` pages. After a user is redirected to the web to pay, there is no in-app confirmation screen.
