using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Payments;

/// <summary>
/// Verifies the Razorpay payment signature using HMAC-SHA256.
/// Must be called before marking a bid as paid.
/// </summary>
public sealed record VerifyRazorpayPaymentCommand(
    string RazorpayOrderId,
    string RazorpayPaymentId,
    string RazorpaySignature) : IRequest<VerifyRazorpayPaymentResponseDto>;
