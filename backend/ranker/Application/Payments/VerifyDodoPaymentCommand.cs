using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Payments;

public sealed record VerifyDodoPaymentCommand(
    string? PaymentId,
    string? SessionId = null) : IRequest<VerifyDodoPaymentResponseDto>;
