using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Services.Payments;

namespace Ranker.Application.Payments;

public class ProcessDodoWebhookCommandHandler(
    ISender sender,
    RankerDbContext dbContext,
    ILogger<ProcessDodoWebhookCommandHandler> logger,
    IConfiguration configuration)
    : IRequestHandler<ProcessDodoWebhookCommand, bool>
{
    public async Task<bool> Handle(
        ProcessDodoWebhookCommand command,
        CancellationToken ct)
    {
        logger.LogInformation("Received Dodo webhook event. WebhookId={WebhookId}, Timestamp={Timestamp}",
            command.WebhookId, command.Timestamp);

        // ── Signature verification ────────────────────────────────────────────
        var webhookKey = configuration["DodoPayments:WebhookKey"];
        if (string.IsNullOrWhiteSpace(webhookKey) || webhookKey == "dev-skip")
        {
            logger.LogWarning("WebhookKey not configured — skipping signature verification (dev mode)");
        }
        else
        {
            if (!VerifyWebhookSignature(
                    command.WebhookId,
                    command.Timestamp,
                    command.Signature,
                    command.RawBody,
                    webhookKey))
            {
                logger.LogWarning("Webhook signature verification FAILED for WebhookId={WebhookId}", command.WebhookId);
                return false;
            }
        }

        try
        {
            using var doc = JsonDocument.Parse(command.RawBody);
            var root = doc.RootElement;

            var eventType = root.TryGetProperty("type", out var typeProp) ? typeProp.GetString() : null;
            logger.LogInformation("Processing Dodo webhook event type: {EventType}", eventType);

            if (string.Equals(eventType, "payment.succeeded", StringComparison.OrdinalIgnoreCase))
            {
                var paymentId = ExtractPaymentId(root);

                if (!string.IsNullOrWhiteSpace(paymentId))
                {
                    logger.LogInformation("Webhook payment.succeeded for PaymentId={PaymentId}. Triggering verification & placement.", paymentId);
                    var verifyResult = await sender.Send(new VerifyDodoPaymentCommand(PaymentId: paymentId), ct);
                    logger.LogInformation("Webhook payment verification completed: Verified={Verified}, Error={Error}",
                        verifyResult.Verified, verifyResult.Error);
                }
            }
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

            var isSuccess = string.Equals(eventType, "payment.succeeded", StringComparison.OrdinalIgnoreCase);
            var audit = new PaymentAuditLog
            {
                Action = eventType ?? "Webhook",
                Gateway = "DodoPayments",
                PaymentId = command.WebhookId,
                RequestPayloadJson = command.RawBody,
                IsSuccess = isSuccess,
                CreatedAt = DateTime.UtcNow,
            };

            dbContext.PaymentAuditLogs.Add(audit);
            await dbContext.SaveChangesAsync(ct);

            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to process Dodo webhook");
            return false;
        }
    }

    // ── Standard Webhooks HMAC-SHA256 verification ───────────────────────────

    private static bool VerifyWebhookSignature(
        string? webhookId,
        string? webhookTimestamp,
        string? webhookSignature,
        string rawBody,
        string webhookKey)
    {
        // 1. Parse and validate timestamp
        if (string.IsNullOrWhiteSpace(webhookTimestamp) || !long.TryParse(webhookTimestamp, out var tsSeconds))
            return false;

        var nowSeconds = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (Math.Abs(nowSeconds - tsSeconds) > 300)
            return false; // Replay attack: timestamp older than 5 minutes

        // 2. Build signed content
        var signedContent = $"{webhookId}.{webhookTimestamp}.{rawBody}";
        var signedContentBytes = Encoding.UTF8.GetBytes(signedContent);

        // 3. Decode webhook key from base64
        byte[] keyBytes;
        try
        {
            keyBytes = Convert.FromBase64String(webhookKey);
        }
        catch (FormatException)
        {
            return false;
        }

        // 4. Compute HMAC-SHA256
        using var hmac = new HMACSHA256(keyBytes);
        var hashBytes = hmac.ComputeHash(signedContentBytes);
        var computedSignature = Convert.ToBase64String(hashBytes);

        // 5. Compare against each signature in the header (comma-separated)
        //    Use CryptographicOperations.FixedTimeEquals to prevent timing side-channel attacks.
        if (string.IsNullOrWhiteSpace(webhookSignature))
            return false;

        var computedBytes = Encoding.UTF8.GetBytes(computedSignature);
        var parts = webhookSignature.Split(',');
        foreach (var part in parts)
        {
            var trimmed = part.Trim();
            // Strip "v1," prefix per Standard Webhooks spec
            var candidate = trimmed.StartsWith("v1,", StringComparison.OrdinalIgnoreCase)
                ? trimmed["v1,".Length..]
                : trimmed;

            var candidateBytes = Encoding.UTF8.GetBytes(candidate);
            if (CryptographicOperations.FixedTimeEquals(candidateBytes, computedBytes))
                return true;
        }

        return false;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static string? ExtractPaymentId(JsonElement root)
    {
        if (root.TryGetProperty("data", out var dataProp))
        {
            if (dataProp.TryGetProperty("payment_id", out var pidProp))
                return pidProp.GetString();
            if (dataProp.TryGetProperty("id", out var idProp))
                return idProp.GetString();
        }
        return null;
    }
}
