using System.Security.Cryptography;
using System.Text;
using MediatR;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Ranker.Dtos;
using Ranker.Services.Payments;

namespace Ranker.Application.Payments;

public class VerifyRazorpayPaymentCommandHandler(
    IOptions<RazorpayOptions> options,
    ILogger<VerifyRazorpayPaymentCommandHandler> logger)
    : IRequestHandler<VerifyRazorpayPaymentCommand, VerifyRazorpayPaymentResponseDto>
{
    public Task<VerifyRazorpayPaymentResponseDto> Handle(
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

        if (verified)
        {
            logger.LogInformation(
                "Razorpay signature verified for order {OrderId}, payment {PaymentId}",
                command.RazorpayOrderId, command.RazorpayPaymentId);
            return Task.FromResult(new VerifyRazorpayPaymentResponseDto(true));
        }

        logger.LogWarning(
            "Razorpay signature mismatch for order {OrderId}, payment {PaymentId}",
            command.RazorpayOrderId, command.RazorpayPaymentId);
        return Task.FromResult(new VerifyRazorpayPaymentResponseDto(false, "Signature mismatch"));
    }
}
