using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MediatR;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Dtos;
using Ranker.Services.Payments;

namespace Ranker.Application.Payments;

public class VerifyRazorpayPaymentCommandHandler(
    IOptions<RazorpayOptions> options,
    RankerDbContext dbContext,
    ILogger<VerifyRazorpayPaymentCommandHandler> logger)
    : IRequestHandler<VerifyRazorpayPaymentCommand, VerifyRazorpayPaymentResponseDto>
{
    public async Task<VerifyRazorpayPaymentResponseDto> Handle(
        VerifyRazorpayPaymentCommand command,
        CancellationToken ct)
    {
        // Algorithm: HMAC-SHA256(orderId + "|" + paymentId, KeySecret)
        // Then compare (constant-time) with the signature sent by Razorpay.
        var payload  = $"{command.RazorpayOrderId}|{command.RazorpayPaymentId}";
        var keyBytes = Encoding.UTF8.GetBytes(options.Value.KeySecret);

        using var hmac = new HMACSHA256(keyBytes);
        var hashBytes   = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        var generatedSig = Convert.ToHexString(hashBytes).ToLowerInvariant();

        // CryptographicOperations.FixedTimeEquals prevents timing-oracle attacks.
        var verified = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(generatedSig),
            Encoding.UTF8.GetBytes(command.RazorpaySignature));

        var requestJson = JsonSerializer.Serialize(new
        {
            orderId = command.RazorpayOrderId,
            paymentId = command.RazorpayPaymentId,
            signatureMasked = command.RazorpaySignature.Length > 8
                ? string.Concat(command.RazorpaySignature.AsSpan(0, 4), "...", command.RazorpaySignature.AsSpan(command.RazorpaySignature.Length - 4))
                : "***"
        });

        var responseJson = JsonSerializer.Serialize(new
        {
            verified,
            message = verified ? "Signature verified successfully" : "Signature mismatch"
        });

        var audit = new PaymentAuditLog
        {
            Action = "VerifyPayment",
            Gateway = "Razorpay",
            OrderId = command.RazorpayOrderId,
            PaymentId = command.RazorpayPaymentId,
            PaymentReference = command.RazorpayPaymentId,
            RequestPayloadJson = requestJson,
            ResponsePayloadJson = responseJson,
            IsSuccess = verified,
            ErrorMessage = verified ? null : "Signature mismatch",
            CreatedAt = DateTime.UtcNow,
        };

        dbContext.PaymentAuditLogs.Add(audit);
        try
        {
            await dbContext.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to save payment verification audit log for order {OrderId}", command.RazorpayOrderId);
        }

        if (verified)
        {
            logger.LogInformation(
                "Razorpay signature verified for order {OrderId}, payment {PaymentId}",
                command.RazorpayOrderId, command.RazorpayPaymentId);
            return new VerifyRazorpayPaymentResponseDto(true);
        }

        logger.LogWarning(
            "Razorpay signature mismatch for order {OrderId}, payment {PaymentId}",
            command.RazorpayOrderId, command.RazorpayPaymentId);
        return new VerifyRazorpayPaymentResponseDto(false, "Signature mismatch");
    }
}
