using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Ranker.Application.Payments;
using Ranker.Dtos;

namespace Ranker.Controllers;

[ApiController]
[Route("api/payments")]
public class PaymentsController(
    ISender sender,
    ILogger<PaymentsController> logger,
    IConfiguration configuration) : ControllerBase
{
    // ── Dodo Payments ─────────────────────────────────────────────────────────

    /// <summary>
    /// Creates a Dodo Payments Checkout Session via CQRS command.
    /// The frontend uses the returned CheckoutUrl to open inline or overlay checkout.
    /// Amount is in minor units (e.g., paise for INR or cents for USD).
    /// </summary>
    [HttpPost("dodo/create-session")]
    public async Task<ActionResult<CreateDodoSessionResponseDto>> CreateDodoSession(
        [FromBody] CreateDodoSessionRequestDto request,
        CancellationToken ct)
    {
        if (request.AmountInMinorUnits < 100)
            return BadRequest(new { error = "Amount must be at least 100 minor units (1.00)." });

        try
        {
            var returnUrl = request.ReturnUrl;
            if (string.IsNullOrWhiteSpace(returnUrl))
            {
                var frontendBase = configuration["DodoPayments:FrontendBaseUrl"]
                    ?? Request.Headers.Origin.FirstOrDefault()
                    ?? Request.Headers.Referer.FirstOrDefault()
                    ?? "http://localhost:4200";
                returnUrl = $"{frontendBase.TrimEnd('/')}/payment-success";
            }

            // cancelUrl: where Dodo redirects when the user clicks the back button.
            // Fall back to the frontend base (e.g. the listing page) if not supplied.
            var cancelUrl = request.CancelUrl;
            if (string.IsNullOrWhiteSpace(cancelUrl))
            {
                var frontendBase = configuration["DodoPayments:FrontendBaseUrl"]
                    ?? Request.Headers.Origin.FirstOrDefault()
                    ?? Request.Headers.Referer.FirstOrDefault()
                    ?? "http://localhost:4200";
                cancelUrl = frontendBase.TrimEnd('/');
            }

            var command = new CreateDodoSessionCommand(
                AmountInMinorUnits: request.AmountInMinorUnits,
                Currency: string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency,
                CustomerEmail: request.CustomerEmail,
                CustomerName: request.CustomerName,
                ReturnUrl: returnUrl,
                CancelUrl: cancelUrl,
                ListingName: request.ListingName,
                ListingId: request.ListingId,
                CategoryId: request.CategoryId,
                BillingStreet: request.BillingStreet,
                BillingCity: request.BillingCity,
                BillingState: request.BillingState,
                BillingCountry: request.BillingCountry,
                BillingZipcode: request.BillingZipcode,
                Metadata: request.Metadata);

            var result = await sender.Send(command, ct);
            return Ok(result);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to create Dodo checkout session for {CustomerEmail}", request.CustomerEmail);
            return StatusCode(500, new { error = "Failed to create Dodo checkout session.", detail = ex.Message });
        }
    }

    /// <summary>
    /// Retrieves checkout session status directly from Dodo Payments via CQRS query.
    /// </summary>
    [HttpGet("dodo/status/{sessionId}")]
    public async Task<ActionResult<DodoSessionStatusResponseDto>> GetDodoSessionStatus(
        string sessionId,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            return BadRequest(new { error = "SessionId is required." });

        try
        {
            var result = await sender.Send(new GetDodoSessionStatusQuery(sessionId), ct);
            return Ok(result);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to retrieve Dodo session status for {SessionId}", sessionId);
            return StatusCode(500, new { error = "Failed to retrieve checkout session status.", detail = ex.Message });
        }
    }

    /// <summary>
    /// Verifies a payment and fulfills the placement in the database.
    /// </summary>
    [HttpGet("dodo/verify/{paymentId}")]
    public async Task<ActionResult<VerifyDodoPaymentResponseDto>> VerifyPaymentGet(
        string paymentId,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(paymentId))
            return BadRequest(new { error = "PaymentId is required." });

        try
        {
            var result = await sender.Send(new VerifyDodoPaymentCommand(PaymentId: paymentId), ct);
            return Ok(result);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to verify Dodo payment {PaymentId}", paymentId);
            return StatusCode(500, new { error = "Failed to verify payment.", detail = ex.Message });
        }
    }

    /// <summary>
    /// Verifies a payment or session via POST body.
    /// </summary>
    [HttpPost("dodo/verify")]
    public async Task<ActionResult<VerifyDodoPaymentResponseDto>> VerifyPaymentPost(
        [FromBody] VerifyDodoPaymentRequestDto request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.PaymentId) && string.IsNullOrWhiteSpace(request.SessionId))
            return BadRequest(new { error = "PaymentId or SessionId is required." });

        try
        {
            var result = await sender.Send(new VerifyDodoPaymentCommand(PaymentId: request.PaymentId, SessionId: request.SessionId), ct);
            return Ok(result);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to verify Dodo payment {PaymentId}", request.PaymentId);
            return StatusCode(500, new { error = "Failed to verify payment.", detail = ex.Message });
        }
    }

    /// <summary>
    /// Webhook endpoint for Dodo Payments events via CQRS command.
    /// Returns 400 if signature verification fails so Dodo knows to stop retrying a bad payload.
    /// </summary>
    [HttpPost("dodo/webhook")]
    public async Task<IActionResult> DodoWebhook(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body);
        var rawBody = await reader.ReadToEndAsync(ct);

        var webhookId = Request.Headers["webhook-id"].FirstOrDefault();
        var signature = Request.Headers["webhook-signature"].FirstOrDefault();
        var timestamp = Request.Headers["webhook-timestamp"].FirstOrDefault();

        var accepted = await sender.Send(new ProcessDodoWebhookCommand(rawBody, webhookId, signature, timestamp), ct);

        if (!accepted)
        {
            logger.LogWarning("Webhook rejected (signature mismatch or parse error). WebhookId={WebhookId}", webhookId);
            return BadRequest(new { received = false });
        }

        // Acknowledge receipt
        return Ok(new { received = true });
    }

    /// <summary>
    /// Returns all non-successful payment transactions for a given email address.
    /// Useful for showing a user their failed or pending transaction attempts.
    /// Rate-limited to 10 requests per IP per minute.
    /// </summary>
    [HttpGet("transactions")]
    [EnableRateLimiting("transactions")]
    public async Task<ActionResult<IReadOnlyList<PaymentTransactionDto>>> GetTransactions(
        [FromQuery] string email,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(new { error = "Email is required." });

        try
        {
            var result = await sender.Send(new GetPaymentTransactionsQuery(email), ct);
            return Ok(result);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to retrieve transactions for {Email}", email);
            return StatusCode(500, new { error = "Failed to retrieve transactions.", detail = ex.Message });
        }
    }
}
