# Payment flow hardening and UX overhaul

This change replaces the old inline-terminal payment flow with a redirect-to-Dodo approach across 12 distinct tasks: securing the webhook handler with Standard Webhooks HMAC-SHA256 verification, deprecating the unauthenticated `/api/claims` endpoint, removing all dead terminal-flow code from the service and modal, adding `payment.failed`/`payment.cancelled` event handling, and rebuilding the payment result page to branch on status. Smaller UX improvements land in the same pass: email validation before checkout, a numeric amount input, dynamic button copy during session creation, a renamed credit label, and a config-driven `returnUrl` fallback.

The implementation is largely correct and the build passes. **Watch for:** (1) The webhook controller returns `200 OK` regardless of signature verification outcome — a confirmed gap that lets any failed verification be silently retried indefinitely. (2) The string-equality comparison for HMAC signatures is not timing-safe. (3) The mobile app (`rankup-mob`) still calls `/api/claims` directly and will start receiving 410 errors at deploy time. (4) `appsettings.json` contains a hardcoded database password and a hardcoded Dodo API key that should never have been committed.

**Verdict**: NEEDS_CHANGES

---

## High-level view

The webhook handler correctly implements the Standard Webhooks algorithm — timestamp window, base64 key decode, HMAC-SHA256, and multi-signature header parsing are all present. The structural gap is in the controller layer: `DodoWebhook` ignores the `bool` return value of the command and always responds `200 OK`, so a fraudulent request that fails verification still gets a success acknowledgement and can be retried without bound.

The HMAC comparison uses `candidate == computedSignature` — a plain string equality — rather than a constant-time operation. In .NET, string equality on two strings of the same length is typically a naive byte walk that short-circuits on the first mismatch, which is textbook timing-side-channel territory for HMAC verification. The fix is one line: replace with `CryptographicOperations.FixedTimeEquals(...)` after converting both sides to bytes.

The `dev-skip` sentinel value in `appsettings.Development.json` is a clean and explicit mechanism — clearly more useful than an empty string, since the skip path is guarded by `|| webhookKey == "dev-skip"` and documented in the log. The production `WebhookKey` is empty in the committed file and will silently skip verification if not overridden at deploy time; this is intentional per the plan, but worth a comment.

Locking `/api/claims` to 410 is correct for the Angular frontend, where `claim.service.placeClaim()` has no active callers. However, `rankup-mob/src/services/api.ts` exports a `placeClaim()` function that POSTs to the same endpoint. The mobile service file exists in the monorepo and is compiled separately — it is not confirmed dead code, only that no mobile screen was found calling it in the screens directory. If the mobile app ships, those calls will hit 410.

Dead code removal is complete in the Angular layer. All terminal-flow symbols (`openTerminal`, `closeTerminal`, `isTerminalOpen`, `pollUntilPaid`, `TerminalEventCallbacks`, `currentStep`, `terminalLoading`, `handleDodoPaymentSuccess`, `handlePaymentFailure`, `goToStep1`, `retryPayment`) are gone from both the service and the modal component. The `quoteValidating` signal is retained in the TypeScript but is absent from the template — it is set and unset in `proceedToCheckout()` but never read by anything, making it dead state.

The `appsettings.json` base file contains a plaintext database password (`Subh@9899`) and a Dodo test API key. These were pre-existing, but this PR touches that file to add `WebhookKey` and `FrontendBaseUrl`, which means the secrets are now in the diff and will appear in git history for this commit.

---

<details>
<summary>Issues (6)</summary>

1. **Webhook always ACKs 200 regardless of signature result** — `DodoWebhook` in `PaymentsController.cs` discards the `bool` returned by `ProcessDodoWebhookCommand` and always returns `Ok(new { received = true })`. An attacker sending malformed payloads gets a 200 and can retry indefinitely. Fix: check the result and return `400` or `401` on `false`.

2. **Timing-safe comparison missing** — `candidate == computedSignature` in `VerifyWebhookSignature` uses ordinary string equality. Replace with `CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(candidate), Encoding.UTF8.GetBytes(computedSignature))` to eliminate the timing side-channel on the HMAC comparison.

3. **Mobile app `placeClaim` will break on deploy** — `rankup-mob/src/services/api.ts` exports `placeClaim()` which POSTs to `/api/claims`. That endpoint now returns 410. If the mobile app is deployed and any screen calls this function, it will silently fail. Confirm the mobile app is retired or update it to use `/api/payments/dodo/verify`.

4. **`quoteValidating` signal is dead state** — Set and cleared in `proceedToCheckout()` but never read by the template or any other binding after Task 10 replaced it with `checkoutStage`. Remove from the component to avoid confusion about whether it has any effect.

5. **`appsettings.json` secrets in diff** — The file contains `"Password=Subh@9899"` and the Dodo test API key in plaintext. This PR's changes touch this file, putting the secrets in the commit diff. Rotate both values and move them to user secrets or environment variables; do not leave them in source.

6. **Silent skip if production `WebhookKey` is blank** — `appsettings.Production.json` ships with `"WebhookKey": ""`, which triggers the dev-skip log path in production if the deploy pipeline doesn't override it. Add a startup guard (or at minimum a prominent comment) so a misconfigured production deploy fails loudly rather than accepting all webhooks without verification.

</details>

<details>
<summary>Details</summary>

### Webhook controller silently swallows signature failures

`DodoWebhook` in `PaymentsController.cs` reads the return value of `ProcessDodoWebhookCommand` into the void:

```csharp
await sender.Send(new ProcessDodoWebhookCommand(rawBody, webhookId, signature, timestamp), ct);
return Ok(new { received = true });
```

The handler returns `false` when signature verification fails, but the controller never inspects it. From a Dodo Payments server's perspective — and any attacker's — every POST to this endpoint gets a 200. The Standard Webhooks specification expects a non-2xx response on failed verification so the platform can distinguish a bad request from a processing delay. The fix:

```csharp
var accepted = await sender.Send(new ProcessDodoWebhookCommand(...), ct);
if (!accepted)
    return StatusCode(400, new { error = "Webhook rejected." });
return Ok(new { received = true });
```

**Severity: BLOCKING** — confirmed; the controller code is explicit.

### Timing-safe comparison gap in HMAC verification

The comparison at line 150 of `ProcessDodoWebhookCommandHandler.cs`:

```csharp
if (candidate == computedSignature)
    return true;
```

Both `candidate` and `computedSignature` are base64-encoded strings of equal length when the signature is correct. .NET string `==` terminates as soon as it finds a mismatch, which leaks information about how many leading characters match. An attacker making many requests with crafted signatures can statistically determine the correct value one character at a time. Use `CryptographicOperations.FixedTimeEquals` after converting both to byte arrays:

```csharp
if (CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(candidate),
        Encoding.UTF8.GetBytes(computedSignature)))
    return true;
```

**Severity: BLOCKING** — confirmed; the comparison is a direct string equality on the base64 output.

### `/api/claims` deprecation and the mobile app gap

The Angular app's `claim.service.ts` retains a `placeClaim()` method that POSTs to `/api/claims`, but no Angular component calls `.placeClaim()` — confirmed by grep. The endpoint returning 410 is therefore safe for the web frontend.

The mobile app at `rankup-mob/src/services/api.ts` also exports a `placeClaim()` function pointing at the same URL. No screen file in the mobile project imports it, but the function is exported and the project exists in the monorepo. If the mobile app is live and any surface calls this, it will start receiving 410. This needs explicit confirmation that `rankup-mob` is either retired or that its `placeClaim` is dead before deploying the backend change.

**Severity: BLOCKING** — likely; the function exists and is exported, but no active call site was found in the screens directory. Confirm scope of mobile app deployment before shipping.

### `quoteValidating` retained as dead signal

After Task 10 replaced the loading copy with `checkoutStage`, `quoteValidating` is still set in `proceedToCheckout()` (`this.quoteValidating.set(true)` / `this.quoteValidating.set(false)`) but has zero template bindings and zero reads outside the method itself. It adds noise to the component state and gives the appearance of a gating signal that no longer gates anything.

**Severity: NON-BLOCKING** — confirmed; no template reference to `quoteValidating` exists.

### Production webhook skip with no startup guard

`appsettings.Production.json` sets `"WebhookKey": ""`. The handler's guard is:

```csharp
if (string.IsNullOrWhiteSpace(webhookKey) || webhookKey == "dev-skip")
{
    logger.LogWarning("WebhookKey not configured — skipping signature verification (dev mode)");
}
```

An empty string in production triggers the same skip path as the dev sentinel. The plan notes this and says the deployer must populate it via environment variable, but there is no startup assertion or health-check guard to catch a misconfigured deploy early. Every webhook will be processed without verification if the env var is missing — this is fail-open, which is the wrong default for a payment event handler.

**Severity: NON-BLOCKING** — confirmed; the code path is explicit. The risk is operational rather than a code bug, but it's worth a startup validation.

### Secrets in committed config file

`appsettings.json` contains `"Password=Subh@9899"` in the connection string and the full Dodo test API key (`bB88UwKD...`). This PR adds two new keys to this file (`WebhookKey` and `FrontendBaseUrl`), which means both secrets appear in the diff for this commit. They were pre-existing in the file, but the act of touching the file in this PR ensures they are freshly surfaced in git history. Rotate both; use `dotnet user-secrets` or environment variables for local dev.

**Severity: NON-BLOCKING** (pre-existing) — but the PR's touch of this file makes it newly visible in the diff.

### Audit log `IsSuccess = true` for all webhook events

The `PaymentAuditLog` written after processing any webhook event always sets `IsSuccess = true`, including for `payment.failed` and `payment.cancelled` events. These are not processing errors — the handler intentionally takes no action for them — so `true` is defensible, but `IsSuccess` on a `payment.failed` webhook record looks wrong to anyone later querying the audit table. This is a minor semantic issue rather than a functional bug.

**Severity: NON-BLOCKING** — confirmed; the field is set unconditionally after the event-type dispatch.

</details>

---

<details>
<summary>File map</summary>

| File | What changed |
|------|-------------|
| `backend/ranker/Application/Payments/ProcessDodoWebhookCommandHandler.cs` | Added Standard Webhooks HMAC-SHA256 signature verification; added `payment.failed` and `payment.cancelled` branches; extracted `ExtractPaymentId` helper; audit log now uses `eventType` as action name |
| `backend/ranker/Controllers/ClaimsController.cs` | `PlaceClaim` body replaced with 410 response and `[Obsolete]` attribute |
| `backend/ranker/Controllers/PaymentsController.cs` | Injected `IConfiguration`; `returnUrl` fallback now reads `DodoPayments:FrontendBaseUrl` from config before falling back to request headers |
| `backend/ranker/appsettings.json` | Added `WebhookKey: ""` and `FrontendBaseUrl: "http://localhost:4200"` under `DodoPayments` |
| `backend/ranker/appsettings.Development.json` | Added `DodoPayments` section with `WebhookKey: "dev-skip"` |
| `backend/ranker/appsettings.Production.json` | Added `WebhookKey: ""` and `FrontendBaseUrl: "https://rankup.so"` under `DodoPayments` |
| `ranker.ui/src/app/core/services/dodo-payments.service.ts` | Removed all terminal-flow methods (`openTerminal`, `closeTerminal`, `isTerminalOpen`, `pollUntilPaid`) and associated types; kept only the backend API wrapper methods |
| `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.ts` | Removed dead terminal-flow state and methods; added `checkoutStage` signal; added `Location` injection and `from`-param construction in `proceedToCheckout`; added email regex validation; added `onTargetAmountInput` with snap-to-increment logic |
| `ranker.ui/src/app/shared/confirm-claim-modal/confirm-claim-modal.component.html` | Replaced static amount display with numeric input + `±` controls; updated failed-state button to `close()`; updated credit label copy; added dynamic `checkoutStage` button text |
| `ranker.ui/src/app/features/payment-success/payment-success.component.ts` | Added `Title` injection and dynamic tab title per status; added `fromUrl` signal with sanitization; branched `ngOnInit` to skip verify on `cancelled`/`failed`; `leaderboardLink` derived from `listingId` |
| `ranker.ui/src/app/features/payment-success/payment-success.component.html` | Added distinct `cancelled` and `failed` status blocks with icon circles and "Try Again" links; wired `leaderboardLink` into the success block's CTA |

Full diff: `git diff main` from the project root.

</details>
