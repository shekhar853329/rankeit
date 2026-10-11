# Implementation Plan: Payment ID Masking

## Background

The backend already has a one-off masking function inside
`Application/Listings/GetListingDetailQueryHandler.cs` (the private
`MaskPaymentReference` method, which keeps 4 trailing chars).  That function
must be extracted into a shared utility and its logic updated to expose
**6 trailing chars** (matching the new spec).  Every outbound DTO that carries
a full payment ID or payment reference must then call the utility.

---

## Affected DTOs and the handlers that populate them

| DTO / field(s) | Populated in handler/mapper | Sensitive? |
|---|---|---|
| `DodoSessionStatusResponseDto.PaymentId` | `GetDodoSessionStatusQueryHandler` | **YES** |
| `VerifyDodoPaymentResponseDto.PaymentId` | `VerifyDodoPaymentCommandHandler` | **YES** |
| `PaymentTransactionDto.PaymentId` | `GetPaymentTransactionsQueryHandler` (EF projection) | **YES** |
| `PaymentTransactionDto.SessionId` | same handler | **YES** |
| `PaymentTransactionDto.OrderId` | same handler | **YES** |
| `ClaimHistoryEntryDto.PaymentReferenceMasked` | `GetListingDetailQueryHandler` | already masked (4 chars) – update to 6 chars via shared utility |

**Not in scope** (no payment IDs reach the client):
- `CreateDodoSessionResponseDto` – returns only `SessionId` + `CheckoutUrl` (no PaymentId).
- `PlaceClaimResultDto` – no payment identifier field.
- All leaderboard / listing DTOs – confirmed no payment fields.
- Webhook / audit-log internal paths – data never returned to the client.

---

## Implementation Plan

- [ ] 1. Create `Application/Common/PaymentIdMasker.cs`

      Add a `static` utility class `PaymentIdMasker` in namespace `Ranker.Application.Common`.
      Implement one public static method:

      ```csharp
      /// <summary>
      /// Returns a masked representation of a payment ID or reference.
      /// Keeps the last 6 characters visible and replaces everything before
      /// them with four asterisks (e.g. "pay_abc123xyz" → "****123xyz" is wrong;
      /// correct: last 6 of "pay_abc123xyz" are "23xyz" — example: "****3xyz" for 4-char; 
      /// for 6-char: "****c123xyz" → use last 6 only).
      ///
      /// Rules:
      ///   - null or empty string → returned as-is.
      ///   - Length ≤ 6 → replaced entirely with "******" (never expose a short ID in full).
      ///   - Length > 6 → "****" + last-6-chars  (prefix is always exactly 4 asterisks,
      ///                   regardless of the hidden portion's real length, per UX spec).
      /// </summary>
      public static string? Mask(string? value)
      ```

      Example outputs:
      - `null`  → `null`
      - `""`    → `""`
      - `"abc"` → `"******"`
      - `"pay_0001a2b3c4d5"` → `"****a2b3c4d5"` (last 6 = `a2b3c4` → wait, last 6 of `pay_0001a2b3c4d5` is `3c4d5` – no, count from right: `c4d5ef` depends on input; the rule is always: prefix `"****"` + `value[^6..]`)

      Final implementation is simply:
      ```
      if (string.IsNullOrEmpty(value)) return value;
      if (value.Length <= 6) return "******";
      return "****" + value[^6..];
      ```

      Files to create:
      - `Application/Common/PaymentIdMasker.cs`

      Verify: `dotnet build c:\Users\shekh\source\repos\rankeit\backend\Ranker.slnx` — zero errors/warnings.

---

- [ ] 2. Add unit tests for `PaymentIdMasker`

      Create `ranker.Tests/Application/Common/PaymentIdMaskerTests.cs` following the xUnit
      pattern used in `ranker.Tests/Services/Claiming/ClaimDecisionEngineTests.cs`.

      Cover:
      - `null` input → `null`
      - Empty string → empty string
      - Length < 6 (e.g. `"abc"`) → `"******"`
      - Length == 6 (e.g. `"abcdef"`) → `"******"`
      - Length == 7 (e.g. `"xabcdef"`) → `"****bcdef"` wait — last 6 of `"xabcdef"` is `"abcdef"` → `"****abcdef"` — 10 chars total; verify this.
      - Typical Dodo payment ID (length > 6) → prefix `"****"` + last 6 chars.

      Files to create:
      - `ranker.Tests/Application/Common/PaymentIdMaskerTests.cs`

      Verify: `dotnet test c:\Users\shekh\source\repos\rankeit\backend\Ranker.slnx` — all new tests pass,
      no existing tests break.

---

- [ ] 3. Apply masking in `GetDodoSessionStatusQueryHandler`

      In `Application/Payments/GetDodoSessionStatusQueryHandler.cs`, replace the direct pass-through
      of `paymentId` in the returned `DodoSessionStatusResponseDto` with a masked value.

      Change the return statement from:
      ```csharp
      return new DodoSessionStatusResponseDto(id, paymentId, paymentStatus, isPaid);
      ```
      to:
      ```csharp
      return new DodoSessionStatusResponseDto(id, PaymentIdMasker.Mask(paymentId), paymentStatus, isPaid);
      ```

      Add `using Ranker.Application.Common;` at the top of the file.

      Files to modify:
      - `Application/Payments/GetDodoSessionStatusQueryHandler.cs`

      Verify: `dotnet build c:\Users\shekh\source\repos\rankeit\backend\Ranker.slnx` — zero errors.

---

- [ ] 4. Apply masking in `VerifyDodoPaymentCommandHandler`

      In `Application/Payments/VerifyDodoPaymentCommandHandler.cs`, mask `paymentId` at every
      point where a `VerifyDodoPaymentResponseDto` is constructed and returned to the caller.
      There are **five** return sites in this handler:

      1. Early return when `PaymentId could not be determined` — no PaymentId set, skip.
      2. Already-fulfilled claim branch (line ~74): `PaymentId: paymentId` → `PaymentId: PaymentIdMasker.Mask(paymentId)`
      3. Payment not found in gateway (line ~101): same substitution.
      4. Non-succeeded status (line ~130): same substitution.
      5. Missing categoryId (line ~162 area): same substitution.
      6. Success path (line ~200 area): same substitution.
      7. Rejected claim path (last return): same substitution.

      Do **not** mask the `paymentId` local variable used internally (db queries, audit log writes,
      mediator commands) — only mask the value placed into the DTO constructor argument.

      The cleanest approach: introduce a local `maskedPaymentId` variable after `paymentId` is
      resolved, and use it in all DTO constructors:
      ```csharp
      var maskedPaymentId = PaymentIdMasker.Mask(paymentId);
      ```
      Then replace every `PaymentId: paymentId` in a `new VerifyDodoPaymentResponseDto(...)` call
      with `PaymentId: maskedPaymentId`.

      Add `using Ranker.Application.Common;` at the top of the file.

      Files to modify:
      - `Application/Payments/VerifyDodoPaymentCommandHandler.cs`

      Verify: `dotnet build c:\Users\shekh\source\repos\rankeit\backend\Ranker.slnx` — zero errors.

---

- [ ] 5. Apply masking in `GetPaymentTransactionsQueryHandler`

      In `Application/Payments/GetPaymentTransactionsQueryHandler.cs`, the EF projection
      directly maps `l.PaymentId`, `l.SessionId`, and `l.OrderId` into `PaymentTransactionDto`.
      These three fields are all gateway-issued identifiers and must be masked.

      The EF query uses `.Select(l => new PaymentTransactionDto(...))` — EF cannot translate
      `PaymentIdMasker.Mask(...)` calls inside the SQL `Select`, so the projection must be split:
      first materialise the raw data, then map with masking.

      Replace the current implementation with:
      ```csharp
      var raw = await dbContext.PaymentAuditLogs
          .Where(l => l.CustomerEmail == query.Email && l.TransactionStatus != "Succeeded")
          .OrderByDescending(l => l.CreatedAt)
          .Take(100)
          .Select(l => new
          {
              l.Id,
              l.Action,
              l.TransactionStatus,
              l.PaymentId,
              l.SessionId,
              l.OrderId,
              l.Amount,
              l.Currency,
              l.IsSuccess,
              l.ErrorMessage,
              l.CreatedAt,
          })
          .ToListAsync(ct);

      var result = raw
          .Select(l => new PaymentTransactionDto(
              l.Id,
              l.Action,
              l.TransactionStatus,
              PaymentIdMasker.Mask(l.PaymentId),
              PaymentIdMasker.Mask(l.SessionId),
              PaymentIdMasker.Mask(l.OrderId),
              l.Amount,
              l.Currency,
              l.IsSuccess,
              l.ErrorMessage,
              l.CreatedAt))
          .ToList();

      return result;
      ```

      Add `using Ranker.Application.Common;` at the top of the file.

      Files to modify:
      - `Application/Payments/GetPaymentTransactionsQueryHandler.cs`

      Verify: `dotnet build c:\Users\shekh\source\repos\rankeit\backend\Ranker.slnx` — zero errors.

---

- [ ] 6. Update `GetListingDetailQueryHandler` to use the shared utility

      Replace the private `MaskPaymentReference` method in
      `Application/Listings/GetListingDetailQueryHandler.cs` with a call to `PaymentIdMasker.Mask`.
      The old method exposed only 4 chars; the utility exposes 6 — this is a deliberate spec
      upgrade and applies consistently across all endpoints.

      Change:
      ```csharp
      var claimHistory = claims
          .Select(c => new ClaimHistoryEntryDto(c.Amount, c.PaymentAmount, c.CreatedAt, MaskPaymentReference(c.PaymentReference)))
          .ToList();
      ```
      to:
      ```csharp
      var claimHistory = claims
          .Select(c => new ClaimHistoryEntryDto(c.Amount, c.PaymentAmount, c.CreatedAt, PaymentIdMasker.Mask(c.PaymentReference) ?? string.Empty))
          .ToList();
      ```

      Remove the private `MaskPaymentReference` method entirely.

      Add `using Ranker.Application.Common;` at the top of the file.

      Files to modify:
      - `Application/Listings/GetListingDetailQueryHandler.cs`

      Verify: `dotnet build c:\Users\shekh\source\repos\rankeit\backend\Ranker.slnx` — zero errors.
      `dotnet test c:\Users\shekh\source\repos\rankeit\backend\Ranker.slnx` — all tests pass.

---

## Summary of files changed or created

| Action | Path |
|---|---|
| **Create** | `Application/Common/PaymentIdMasker.cs` |
| **Create** | `ranker.Tests/Application/Common/PaymentIdMaskerTests.cs` |
| **Modify** | `Application/Payments/GetDodoSessionStatusQueryHandler.cs` |
| **Modify** | `Application/Payments/VerifyDodoPaymentCommandHandler.cs` |
| **Modify** | `Application/Payments/GetPaymentTransactionsQueryHandler.cs` |
| **Modify** | `Application/Listings/GetListingDetailQueryHandler.cs` |

## What is deliberately NOT changed

- Domain entities (`PaymentAuditLog`, `Claim`, `ClaimReconciliation`) — full IDs stay in the database.
- Any internal service or repository layer — masking is only at the outbound DTO boundary.
- No new NuGet packages — `PaymentIdMasker` is a plain static class.
- No git commits — per task requirement.
- `CreateDodoSessionResponseDto` — only returns a `SessionId` used to poll/redirect; no
  fulfillable PaymentId is present at session creation time.
- `PlaceClaimResultDto` — contains no payment identifier field.
