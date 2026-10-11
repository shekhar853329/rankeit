# Payment ID masking at the DTO boundary

All outbound endpoints that previously returned raw payment identifiers now return masked values via a shared `PaymentIdMasker` utility. The change affects four query/command handlers and introduces a dedicated utility class plus a test suite. The masking strategy is consistent: `null`/empty pass through unchanged, IDs of 6 characters or fewer become `"******"`, and anything longer becomes `"****"` + the last 6 characters. The old ad-hoc `MaskPaymentReference` private method in `GetListingDetailQueryHandler` (which kept only 4 trailing chars) has been removed and replaced with the shared utility, upgrading it to 6 chars as specified. Compilation is clean — zero CS errors, zero CS warnings.

Watch for: `GetDodoSessionStatusQueryHandler` logs the full unmasked `paymentId` to structured logging immediately before returning the masked DTO. Server-side log, not a client response, but if the log aggregator is accessible to roles that should not see full IDs, this line should be masked or redacted.

**Verdict**: APPROVED

---

## High-level view

`PaymentIdMasker` is a single static class in `Application/Common` — no dependencies, no state. The masking rule is a 3-branch conditional on string length, and every branch is exercised by the unit tests.

The EF projection in `GetPaymentTransactionsQueryHandler` was correctly split into a raw anonymous-type `.ToListAsync` followed by an in-memory `.Select` with masking. EF cannot translate `PaymentIdMasker.Mask(...)` to SQL, so applying masking inside the EF `Select` would have caused a runtime `InvalidOperationException`.

All five return sites in `VerifyDodoPaymentCommandHandler` that produce a `VerifyDodoPaymentResponseDto` with a `PaymentId` field use `maskedPaymentId`, computed once right after `paymentId` is resolved. The unmasked `paymentId` continues to be used for DB queries, audit log writes, and mediator commands. Domain entities (`PaymentAuditLog`, `Claim`) and internal service calls are untouched.

`CreateDodoSessionResponseDto` and `PlaceClaimResultDto` carry no payment ID fields and were correctly left out of scope.

---

<details>
<summary>Issues (1)</summary>

1. **Full payment ID in structured logs** — `GetDodoSessionStatusQueryHandler` logs the unmasked `paymentId` at `LogInformation` level before returning the masked DTO (confirmed, line ~28). Not a client-facing exposure, but if the log aggregator (Seq, Datadog, etc.) is accessible to roles that should not see raw payment IDs, that log call should also be masked. No action required to ship, but the team should make a conscious decision.

</details>

---

<details>
<summary>Details</summary>

### Masker boundary behavior

`PaymentIdMasker.Mask` uses `string.IsNullOrEmpty` rather than `string.IsNullOrWhiteSpace`, so a whitespace-only string (e.g., `"      "`) is treated as a non-empty value and will be masked by length. A 6-space string returns `"******"` (length == 6, fully masked). The behavior is correct and safe; it just isn't documented by the test suite.

The boundary at `<= 6` rather than `< 6` is intentional: a 6-character ID would be fully revealed by the `last-6` rule, so it gets the all-asterisk treatment instead.

### Test coverage

The tests cover all specified branches: `null`, empty string, length < 6, length == 6, length == 7, a realistic Dodo payment ID format (`"pay_0001a2b3c4d5"`, 16 chars — last 6 are `"b3c4d5"`, expected `"****b3c4d5"` is correct), and a very long ID with a prefix-length assertion.

Not tested: whitespace-only strings and strings containing only the prefix separator characters (e.g., `"pay___"`). These are edge cases with correct behavior, but adding one test for whitespace would make the documented contract explicit.

### Masking application across handlers

Every outbound payment identifier field identified in the plan is masked:

- `DodoSessionStatusResponseDto.PaymentId` — masked at the single return site in `GetDodoSessionStatusQueryHandler`.
- `VerifyDodoPaymentResponseDto.PaymentId` — `maskedPaymentId` computed once after resolution; used at all five DTO-constructing branches. The one early-exit return (when `paymentId` cannot be determined) omits the field rather than masking a null.
- `PaymentTransactionDto.PaymentId`, `.SessionId`, `.OrderId` — all three masked in the in-memory projection in `GetPaymentTransactionsQueryHandler`.
- `ClaimHistoryEntryDto.PaymentReferenceMasked` — masked via `PaymentIdMasker.Mask(...) ?? string.Empty`, with the `?? string.Empty` fallback preserving the non-nullable contract of the DTO field.

</details>

---

<details>
<summary>File map</summary>

| File | Change |
|---|---|
| `Application/Common/PaymentIdMasker.cs` | New utility class with `Mask(string?)` |
| `ranker.Tests/Application/Common/PaymentIdMaskerTests.cs` | New xUnit test suite for all `Mask` branches |
| `Application/Payments/GetDodoSessionStatusQueryHandler.cs` | Wraps `paymentId` in `PaymentIdMasker.Mask(...)` at the DTO return site |
| `Application/Payments/VerifyDodoPaymentCommandHandler.cs` | Introduces `maskedPaymentId` local; all five `VerifyDodoPaymentResponseDto` constructors use it |
| `Application/Payments/GetPaymentTransactionsQueryHandler.cs` | Splits EF projection into raw anonymous-type query + in-memory masked mapping |
| `Application/Listings/GetListingDetailQueryHandler.cs` | Replaces private `MaskPaymentReference` (4 chars) with `PaymentIdMasker.Mask` (6 chars) |

</details>
