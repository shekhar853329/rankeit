# Implementation Plan: Comprehensive Payment Transaction Tracking

## Context

The current system records `PaymentAuditLog` rows on session creation and webhook receipt, but:
- No `TransactionStatus` column exists — payment state is never persisted
- `CustomerEmail` and `SessionId` are never stored on audit rows, so rows cannot be attributed to a user
- Webhook handler stores the `webhookId` in the `PaymentId` column instead of the actual payment ID
- No endpoint exists for querying a user's transactions
- No user-facing page for failed/pending/cancelled transactions

**Design decisions:**
- Extend `PaymentAuditLog` rather than creating a new table — it is the natural home, and adding fields keeps the migration minimal and the architecture flat.
- `TransactionStatus` is stored as a `string` column (`varchar(20)`) with values `Pending`, `Succeeded`, `Failed`, `Cancelled`, `Unknown` — no enum type in the DB avoids migration complexity on future value additions.
- The new endpoint at `GET /api/payments/transactions?email={email}` returns all rows where `CustomerEmail = email` AND `TransactionStatus != 'Succeeded'`. No auth is added at this stage (email is low-sensitivity here; the user supplies their own email from the payment flow).
- The Angular page is `/my-transactions`, standalone component following the `payment-success` pattern (signals, OnInit, `ChangeDetectionStrategy.OnPush`, lazy-loaded route).
- The "Try again" link on `payment-success` for failed/cancelled states, and links in `contact.component.html` and `daily-listings.component.html`, all point to `/my-transactions?email={email}`.

---

## Implementation Plan

- [ ] 1. Add `TransactionStatus`, `CustomerEmail`, and `SessionId` fields to `PaymentAuditLog` entity and its EF configuration.

      Add three new properties to the entity class:
      - `string? TransactionStatus` (Pending / Succeeded / Failed / Cancelled / Unknown)
      - `string? CustomerEmail`
      - `string? SessionId`

      In `PaymentAuditLogConfiguration.cs`, add:
      - `builder.Property(l => l.TransactionStatus).HasMaxLength(20);`
      - `builder.Property(l => l.CustomerEmail).HasMaxLength(254);`
      - `builder.Property(l => l.SessionId).HasMaxLength(150);`
      - `builder.HasIndex(l => l.CustomerEmail);`
      - `builder.HasIndex(l => l.SessionId);`

      Files:
      - `backend/ranker/Domain/Entities/PaymentAuditLog.cs`
      - `backend/ranker/Data/Configurations/PaymentAuditLogConfiguration.cs`

      Verify: `dotnet build backend/ranker/ranker.csproj` — builds with no errors.

- [ ] 2. Generate and review the EF Core migration.

      Run from `backend/ranker/`:
      ```
      dotnet ef migrations add AddTransactionStatusToPaymentAuditLog --context RankerDbContext
      ```
      This creates `Migrations/<timestamp>_AddTransactionStatusToPaymentAuditLog.cs`.
      Review the generated `Up()` to confirm it adds:
      - `TransactionStatus character varying(20)` (nullable)
      - `CustomerEmail character varying(254)` (nullable)
      - `SessionId character varying(150)` (nullable)
      - Indexes on `CustomerEmail` and `SessionId`

      Files:
      - `backend/ranker/Migrations/<timestamp>_AddTransactionStatusToPaymentAuditLog.cs` (generated)
      - `backend/ranker/Migrations/RankerDbContextModelSnapshot.cs` (updated by EF)

      Verify: `dotnet build backend/ranker/ranker.csproj` — builds. Migration file exists and is non-empty.

- [ ] 3. Update `CreateDodoSessionCommandHandler` to populate the new fields on the audit row.

      On the **success** path, set:
      ```csharp
      OrderId = sessionId,        // already set
      TransactionStatus = "Pending",
      CustomerEmail = command.CustomerEmail,
      SessionId = sessionId,
      ```
      On the **failure** path (catch block), set:
      ```csharp
      TransactionStatus = "Failed",  // session creation itself failed at the API level
      CustomerEmail = command.CustomerEmail,
      ```
      The `SessionId` cannot be set on the failure path because the session was never created.

      Files:
      - `backend/ranker/Application/Payments/CreateDodoSessionCommandHandler.cs`

      Verify: `dotnet build backend/ranker/ranker.csproj` — builds.

- [ ] 4. Update `VerifyDodoPaymentCommandHandler` to write an audit row for every verification outcome.

      Currently this handler does NOT write any `PaymentAuditLog` row — add one at the end of `Handle()`:
      - Always write a row with `Action = "VerifyPayment"`.
      - Set `TransactionStatus` based on outcome:
        - Payment not found in gateway → `"Unknown"`
        - Payment status != succeeded → use the raw status from `payment.Status` (e.g. `"pending"`, `"failed"`) mapped to title-case, defaulting to `"Unknown"`
        - Payment succeeded but `PlaceClaim` rejected → `"Succeeded"` (payment went through; this is a claim-level issue, not a payment failure)
        - Payment succeeded and claim placed → `"Succeeded"`
      - Populate `CustomerEmail` from `payment.CustomerEmail` (available on the Dodo payment object).
      - Populate `PaymentId` from `paymentId`.
      - Populate `SessionId` from `command.SessionId` if present.
      - Set `Amount = Math.Round((decimal)payment.TotalAmount / 100m, 2)` and `Currency` from payment object.
      - Set `IsSuccess = placeResult.Success` (true only if claim was placed).
      - Set `ErrorMessage` if there was an error.

      If payment is not found or status unknown, still write a row with what's known.

      Also: when the `existingClaim != null` early-return path fires (idempotency check), write a row with `Action = "VerifyPayment"`, `TransactionStatus = "Succeeded"`, `IsSuccess = true`, and `PaymentId = paymentId`. This ensures re-verification attempts are audited.

      Note: `VerifyDodoPaymentCommandHandler` already has `RankerDbContext dbContext` injected — use it.

      Files:
      - `backend/ranker/Application/Payments/VerifyDodoPaymentCommandHandler.cs`

      Verify: `dotnet build backend/ranker/ranker.csproj` — builds.

- [ ] 5. Update `ProcessDodoWebhookCommandHandler` to store actual `payment_id`, `CustomerEmail`, and `TransactionStatus` on the audit row.

      Replace the current `audit` object construction with:
      ```csharp
      var actualPaymentId = ExtractPaymentId(root);   // already extracted above per event branch
      var customerEmail = ExtractCustomerEmail(root); // new helper — see below

      var transactionStatus = eventType switch {
          var e when string.Equals(e, "payment.succeeded", StringComparison.OrdinalIgnoreCase) => "Succeeded",
          var e when string.Equals(e, "payment.failed",    StringComparison.OrdinalIgnoreCase) => "Failed",
          var e when string.Equals(e, "payment.cancelled", StringComparison.OrdinalIgnoreCase) => "Cancelled",
          _ => "Unknown"
      };

      var audit = new PaymentAuditLog
      {
          Action             = eventType ?? "Webhook",
          Gateway            = "DodoPayments",
          PaymentId          = actualPaymentId,          // FIX: was command.WebhookId
          TransactionStatus  = transactionStatus,        // NEW
          CustomerEmail      = customerEmail,            // NEW
          RequestPayloadJson = command.RawBody,
          IsSuccess          = isSuccess,
          CreatedAt          = DateTime.UtcNow,
      };
      ```

      Add a private helper `ExtractCustomerEmail(JsonElement root)` that traverses:
      `root → "data" → "customer" → "email"` (returning `null` if any segment is missing).

      Files:
      - `backend/ranker/Application/Payments/ProcessDodoWebhookCommandHandler.cs`

      Verify: `dotnet build backend/ranker/ranker.csproj` — builds.

- [ ] 6. Create `GetPaymentTransactionsQuery` and its handler.

      New query record:
      ```csharp
      // Application/Payments/GetPaymentTransactionsQuery.cs
      public sealed record GetPaymentTransactionsQuery(string Email)
          : IRequest<IReadOnlyList<PaymentTransactionDto>>;
      ```

      New DTO (add to `Dtos/PaymentDtos.cs`):
      ```csharp
      public sealed record PaymentTransactionDto(
          int Id,
          string Action,
          string? TransactionStatus,
          string? PaymentId,
          string? SessionId,
          string? OrderId,
          decimal? Amount,
          string? Currency,
          bool IsSuccess,
          string? ErrorMessage,
          DateTime CreatedAt);
      ```

      Handler (`Application/Payments/GetPaymentTransactionsQueryHandler.cs`):
      - Inject `RankerDbContext dbContext`.
      - Query: `dbContext.PaymentAuditLogs.Where(l => l.CustomerEmail == query.Email && l.TransactionStatus != "Succeeded").OrderByDescending(l => l.CreatedAt).Take(100)`.
      - Map results to `PaymentTransactionDto` list and return.

      Files:
      - `backend/ranker/Application/Payments/GetPaymentTransactionsQuery.cs` (new)
      - `backend/ranker/Application/Payments/GetPaymentTransactionsQueryHandler.cs` (new)
      - `backend/ranker/Dtos/PaymentDtos.cs` (add `PaymentTransactionDto`)

      Verify: `dotnet build backend/ranker/ranker.csproj` — builds.

- [ ] 7. Add `GET /api/payments/transactions` endpoint to `PaymentsController`.

      ```csharp
      /// <summary>
      /// Returns all non-succeeded payment attempts for the given email address.
      /// Intended for user self-service: the user supplies the email they used at checkout.
      /// </summary>
      [HttpGet("transactions")]
      public async Task<ActionResult<IReadOnlyList<PaymentTransactionDto>>> GetTransactions(
          [FromQuery] string email,
          CancellationToken ct)
      {
          if (string.IsNullOrWhiteSpace(email))
              return BadRequest(new { error = "email query parameter is required." });

          var result = await sender.Send(new GetPaymentTransactionsQuery(email), ct);
          return Ok(result);
      }
      ```

      Files:
      - `backend/ranker/Controllers/PaymentsController.cs`

      Verify: `dotnet build backend/ranker/ranker.csproj` — builds without errors.

- [ ] 8. Add `PaymentTransactionItem` model and `getTransactions` method to the Angular payment service.

      In `payment.model.ts`, add:
      ```typescript
      export interface PaymentTransactionItem {
        id: number;
        action: string;
        transactionStatus: string | null;
        paymentId: string | null;
        sessionId: string | null;
        orderId: string | null;
        amount: number | null;
        currency: string | null;
        isSuccess: boolean;
        errorMessage: string | null;
        createdAt: string; // ISO datetime
      }
      ```

      In `dodo-payments.service.ts`, add:
      ```typescript
      getTransactions(email: string): Observable<PaymentTransactionItem[]> {
        return this.http.get<PaymentTransactionItem[]>(
          `${API_BASE_URL}/api/payments/transactions?email=${encodeURIComponent(email)}`
        );
      }
      ```

      Files:
      - `ranker.ui/src/app/core/models/payment.model.ts`
      - `ranker.ui/src/app/core/services/dodo-payments.service.ts`

      Verify: `cd ranker.ui && ng build --configuration production` — compiles without errors.

- [ ] 9. Create the `MyTransactionsComponent` Angular feature.

      Create three files under `ranker.ui/src/app/features/my-transactions/`:

      **my-transactions.component.ts**
      - Standalone, `ChangeDetectionStrategy.OnPush`, implements `OnInit`.
      - Imports: `RouterLink`, `DatePipe`, `DecimalPipe`, `FormsModule` (for email input).
      - Signals: `email = signal('')`, `transactions = signal<PaymentTransactionItem[]>([])`, `loading = signal(false)`, `error = signal<string | null>(null)`, `searched = signal(false)`.
      - `ngOnInit`: read `?email=` from `ActivatedRoute.queryParamMap`; if present, auto-call `search()`.
      - `search()` method: validate email, set `loading(true)`, call `dodoPayments.getTransactions(email())`, populate `transactions()`, handle errors.
      - `SeoService.updateTags({ title: 'My Payment Transactions | RankUp', ... })` in ngOnInit.

      **my-transactions.component.html**
      - Page title "My Payment Transactions".
      - Email input form with a "Look Up" button (same pattern as the payment-success page for minimal new CSS).
      - Loading spinner (reuse `.spinner` class from payment-success).
      - Empty state message when searched and no rows.
      - Table / card list of transactions showing:
        - Status chip coloured by `transactionStatus` (Pending = amber, Failed = red, Cancelled = grey, Unknown = grey).
        - Amount + currency.
        - Payment ID (truncated with copy-click if present).
        - Date (`createdAt | date:'medium'`).
        - Error message if present.
      - "Need help?" footer link → `routerLink="/contact"`.

      **my-transactions.component.scss**
      - Minimal styles. Reuse CSS custom-property tokens already present (e.g. `--surface-container`, `--border`, `--text`, `--text-muted`, `--accent`, `--radius-md`) consistent with `contact.component.scss` and `payment-success.component.scss`.

      Files:
      - `ranker.ui/src/app/features/my-transactions/my-transactions.component.ts` (new)
      - `ranker.ui/src/app/features/my-transactions/my-transactions.component.html` (new)
      - `ranker.ui/src/app/features/my-transactions/my-transactions.component.scss` (new)

      Verify: `cd ranker.ui && ng build --configuration production` — compiles without errors.

- [ ] 10. Register the `/my-transactions` route in `app.routes.ts`.

      Add after the `payment-success` route:
      ```typescript
      {
        path: 'my-transactions',
        loadComponent: () =>
          import('./features/my-transactions/my-transactions.component').then(
            (m) => m.MyTransactionsComponent
          ),
      },
      ```

      Files:
      - `ranker.ui/src/app/app.routes.ts`

      Verify: `cd ranker.ui && ng build --configuration production` — builds successfully.

- [ ] 11. Add a "View My Transactions" link to the failed/cancelled state in `payment-success.component.html` and `.ts`.

      In `payment-success.component.ts`:
      - The component already reads `email()` from the `?email=` query param.
      - Expose a computed getter `transactionsLink()` that returns `/my-transactions${email() ? '?email=' + encodeURIComponent(email()!) : ''}`.

      In `payment-success.component.html`:
      - In the `@else if (status() === 'cancelled')` block, add alongside "Try Again" and "Go to Home":
        ```html
        <a [routerLink]="['/my-transactions']" [queryParams]="email() ? {email: email()} : {}" class="btn btn-ghost">
          View My Transactions
        </a>
        ```
      - In the `@else if (status() === 'failed')` block, add the same link.
      - In the `@else if (error())` block (verification failed, e.g. payment pending at gateway), also add the link.

      Files:
      - `ranker.ui/src/app/features/payment-success/payment-success.component.html`
      - `ranker.ui/src/app/features/payment-success/payment-success.component.ts`

      Verify: `cd ranker.ui && ng build --configuration production` — builds.

- [ ] 12. Add "Check Payment Status" section to `contact.component.html`.

      Add a new card to the contact-grid section (after the existing four channel cards):
      ```html
      <!-- Channel 5: Payment Transaction History -->
      <div class="contact-card card">
        <div class="contact-card__icon-wrap">
          <span class="material-symbols-outlined text-[26px]">receipt_long</span>
        </div>
        <div class="contact-card__body">
          <div class="card-top-row">
            <h3>Payment Transaction History</h3>
            <span class="sla-badge">Self-Service</span>
          </div>
          <p>
            Made a payment that didn't go through? Check your pending, failed, or cancelled
            transaction attempts by entering the email address you used at checkout.
          </p>
          <div class="channel-action">
            <a routerLink="/my-transactions" class="contact-link">
              <span class="material-symbols-outlined text-[16px]">manage_search</span>
              <span>View My Transactions</span>
            </a>
          </div>
        </div>
      </div>
      ```

      Add `RouterLink` to the `imports` array in `contact.component.ts` since it is not currently imported.

      Files:
      - `ranker.ui/src/app/features/contact/contact.component.html`
      - `ranker.ui/src/app/features/contact/contact.component.ts`

      Verify: `cd ranker.ui && ng build --configuration production` — builds.

- [ ] 13. Add "Payment Issues?" link to `daily-listings.component.html`.

      In the `header-actions` div (currently contains only the "Live Leaderboard" back-button), add a secondary link:
      ```html
      <a routerLink="/my-transactions" class="btn-return" style="margin-left: 0.5rem;">
        <span class="material-symbols-outlined text-[16px]">receipt_long</span>
        <span>Payment Issues?</span>
      </a>
      ```
      No TypeScript changes needed since `RouterLink` is already imported in `daily-listings.component.ts`.

      Files:
      - `ranker.ui/src/app/features/daily-listings/daily-listings.component.html`

      Verify: `cd ranker.ui && ng build --configuration production` — builds.

- [ ] 14. Final integration build and smoke-check.

      Run the full build for both backend and frontend:
      ```
      dotnet build backend/ranker/ranker.csproj
      cd ranker.ui && ng build --configuration production
      ```
      Both must succeed with zero errors. Confirm:
      - Migration file exists in `backend/ranker/Migrations/`.
      - `my-transactions` chunk appears in Angular build output.
      - No TypeScript compiler errors.

      Files: none changed — verification step only.

      Verify: Both commands exit 0.
