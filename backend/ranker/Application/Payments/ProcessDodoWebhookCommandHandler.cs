using System.Text.Json;
using MediatR;
using Microsoft.Extensions.Logging;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Services.Payments;

namespace Ranker.Application.Payments;

public class ProcessDodoWebhookCommandHandler(
    ISender sender,
    RankerDbContext dbContext,
    ILogger<ProcessDodoWebhookCommandHandler> logger)
    : IRequestHandler<ProcessDodoWebhookCommand, bool>
{
    public async Task<bool> Handle(
        ProcessDodoWebhookCommand command,
        CancellationToken ct)
    {
        logger.LogInformation("Received Dodo webhook event. WebhookId={WebhookId}, Timestamp={Timestamp}",
            command.WebhookId, command.Timestamp);

        try
        {
            using var doc = JsonDocument.Parse(command.RawBody);
            var root = doc.RootElement;

            var eventType = root.TryGetProperty("type", out var typeProp) ? typeProp.GetString() : null;
            logger.LogInformation("Processing Dodo webhook event type: {EventType}", eventType);

            if (string.Equals(eventType, "payment.succeeded", StringComparison.OrdinalIgnoreCase))
            {
                string? paymentId = null;
                if (root.TryGetProperty("data", out var dataProp))
                {
                    if (dataProp.TryGetProperty("payment_id", out var pidProp))
                        paymentId = pidProp.GetString();
                    else if (dataProp.TryGetProperty("id", out var idProp))
                        paymentId = idProp.GetString();
                }

                if (!string.IsNullOrWhiteSpace(paymentId))
                {
                    logger.LogInformation("Webhook payment.succeeded for PaymentId={PaymentId}. Triggering verification & placement.", paymentId);
                    var verifyResult = await sender.Send(new VerifyDodoPaymentCommand(PaymentId: paymentId), ct);
                    logger.LogInformation("Webhook payment verification completed: Verified={Verified}, Error={Error}",
                        verifyResult.Verified, verifyResult.Error);
                }
            }

            var audit = new PaymentAuditLog
            {
                Action = "Webhook",
                Gateway = "DodoPayments",
                PaymentId = command.WebhookId,
                RequestPayloadJson = command.RawBody,
                IsSuccess = true,
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
}
