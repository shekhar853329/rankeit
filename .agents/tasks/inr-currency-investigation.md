# INR Currency Investigation — Dodo Payments Workflow

## Summary Answer

**INR is hardcoded in four separate places across the codebase.** It is not read from `appsettings.json`, environment variables, or the Dodo Payments API response (in the critical logging path). The currency appears in logs because each of the three audited operations — `CreateSession`, `PlaceClaim`, and `VerifyPayment` — sources the currency string from one of these hardcoded locations.

---

## Evidence: Where INR Is Set

### 1. Frontend — `confirm-claim-modal.component.ts` (line ~506)
**File:** `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts`

```typescript
this.dodoPayments.createSession({
    amountInMinorUnits: Math.max(100, Math.round(chargeAmount * 100)),
    currency: 'INR',   // ← hardcoded here
    customerEmail: email,
    ...
})
```

This is the **root of the chain**. The frontend hardcodes `'INR'` when calling the backend's `POST /api/payments/dodo/create-session` endpoint. Every downstream step inherits this value.

---

### 2. Backend DTO default — `PaymentDtos.cs` (line 7)
**File:** `backend/ranker/Dtos/PaymentDtos.cs`

```csharp
public sealed record CreateDodoSessionRequestDto(
    int AmountInMinorUnits,
    string Currency = "INR",   // ← hardcoded default parameter
    ...
```

The `CreateDodoSessionRequestDto` has `"INR"` as a **C# default parameter value**. If the frontend ever omits `currency` from the request body, the backend silently substitutes `"INR"`.

---

### 3. Backend controller — `PaymentsController.cs` (line ~57)
**File:** `backend/ranker/Controllers/PaymentsController.cs`

```csharp
Currency: string.IsNullOrWhiteSpace(request.Currency) ? "INR" : request.Currency,
```

The controller adds a third layer of `"INR"` fallback when constructing the `CreateDodoSessionCommand`. Even if the DTO default were removed, this guard would still force `"INR"`.

---

### 4. Backend service — `DodoPaymentsService.cs` (line 97)
**File:** `backend/ranker/Services/Payments/DodoPaymentsService.cs`

```csharp
billing_currency = string.IsNullOrWhiteSpace(currency) ? "INR" : currency,
```

Inside `CreateCheckoutSessionAsync`, the currency sent to the Dodo Payments API (`billing_currency` in the POST payload) also falls back to `"INR"`. This means even the actual Dodo API call uses `INR` as the currency.

---

### 5. `DodoPaymentsService.GetPaymentAsync` — currency from API response
**File:** `backend/ranker/Services/Payments/DodoPaymentsService.cs` (line ~203)

```csharp
var currency = root.TryGetProperty("currency", out var curProp) ? curProp.GetString() ?? "INR" : "INR";
```

When fetching a payment from Dodo to verify it, the `currency` field is read from the API response. However, the **fallback is again `"INR"`**. Since the original session was created with `billing_currency = "INR"` (see #4), Dodo returns `"INR"` in the response — so the `currency` value on the `DodoPaymentDetails` object will always be `"INR"` in practice.

This value is then stored in `PaymentAuditLog.Currency` by `VerifyDodoPaymentCommandHandler` in all audit paths (lines ~119, ~130, ~193, ~240, ~269 of that file).

---

### 6. `PlaceClaimCommandHandler.cs` — hardcoded literal
**File:** `backend/ranker/Application/Claims/PlaceClaimCommandHandler.cs` (line ~223)

```csharp
dbContext.PaymentAuditLogs.Add(new PaymentAuditLog
{
    Action = "PlaceClaim",
    Gateway = "DodoPayments",
    ...
    Currency = "INR",   // ← hardcoded literal, no variable, no config
    ...
});
```

The `PlaceClaim` audit log **never receives a currency value from anywhere** — it is a hardcoded string literal. The `PlaceClaimCommand` record itself has no `Currency` field, so even if you fixed all other places, this one would still be `"INR"`.

---

## Is It in Config?

No. `appsettings.json` contains a `DodoPayments` section with `ApiKey`, `BaseUrl`, `ProductId`, and `WebhookKey` — **no `Currency` key**. There are no environment variable mappings or `IConfiguration` reads for currency anywhere in the codebase.

---

## Root Cause Summary

| Location | How INR Gets Set |
|---|---|
| `confirm-claim-modal.component.ts:506` | Hardcoded string literal `'INR'` in frontend |
| `PaymentDtos.cs:7` | C# default parameter `string Currency = "INR"` |
| `PaymentsController.cs:57` | Null-coalescing fallback `? "INR" : request.Currency` |
| `DodoPaymentsService.cs:97` | Null-coalescing fallback for `billing_currency` in Dodo API payload |
| `DodoPaymentsService.cs:203` | Fallback `?? "INR"` when parsing Dodo API response's `currency` field |
| `PlaceClaimCommandHandler.cs:223` | Hardcoded literal `Currency = "INR"` in `PaymentAuditLog` construction |

The currency flows: **Frontend (`'INR'`) → DTO default (also `"INR"`) → Controller (re-checks, still `"INR"`) → Dodo API call (sends `billing_currency = "INR"`) → Dodo API response (returns `"INR"`) → VerifyPayment audit logs (`payment.Currency`)**.

The `PlaceClaim` audit path is entirely independent and always writes `"INR"` regardless of what the payment gateway says.

---

## Is This a Bug or Intended Behavior?

This is **intended behavior for the current product** — the application is Indian-market focused (default Bengaluru billing address, INR pricing in Terms of Service, INR in leaderboard currency selector). The `CreateDodoSessionCommand` record's doc comment even says:

> `Amount is in minor units (e.g., paise for INR or cents for USD).`

However, it is also **technically hardcoded inflexibility**. If the product ever needs to support multi-currency, all six locations above would need to be updated.

---

## Recommendations

### If INR is the only supported currency (current state):
1. **Remove the redundant layers** — having the same `"INR"` fallback in 4 separate places (frontend, DTO, controller, service) is noise. Pick one authoritative location (the DTO default or a config value) and remove the others.
2. **Fix `PlaceClaimCommandHandler`** — it should not hardcode `"INR"`. The `PlaceClaimCommand` should accept a `Currency` string, and `VerifyDodoPaymentCommandHandler` should pass `payment.Currency` into it when dispatching `PlaceClaimCommand`. This keeps the audit log consistent with the actual payment gateway currency.

### If multi-currency support is needed in future:
1. Add a `Currency` key to the `DodoPayments` appsettings section (e.g., `"Currency": "INR"`).
2. Inject `IConfiguration` into `DodoPaymentsService` and read `Currency` from config instead of hardcoding.
3. Remove the frontend hardcoded `'INR'` and either derive it from a backend config endpoint or pass it from the leaderboard/category context.
4. Add `Currency` to `PlaceClaimCommand` and thread it through from the payment verification step.

### Immediate actionable fix for `PlaceClaim` log inconsistency:
```csharp
// In PlaceClaimCommand.cs — add a Currency field:
public sealed record PlaceClaimCommand(
    ...
    string Currency = "INR",   // add this
    ...);

// In VerifyDodoPaymentCommandHandler.cs — pass payment.Currency:
var placeCommand = new PlaceClaimCommand(
    ...
    Currency: payment.Currency,   // add this
    ...);

// In PlaceClaimCommandHandler.cs — use command.Currency:
Currency = command.Currency,   // instead of "INR"
```

This ensures that if the Dodo API ever returns a different currency (e.g., during a test or future expansion), the `PlaceClaim` audit log reflects the actual transaction currency rather than a hardcoded assumption.
