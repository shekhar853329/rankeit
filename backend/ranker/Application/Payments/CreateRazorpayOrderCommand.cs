using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Payments;

/// <summary>
/// Creates a Razorpay order via the Razorpay Orders API and returns the order details
/// needed by the frontend to open the checkout modal.
/// </summary>
public sealed record CreateRazorpayOrderCommand(
    long AmountInPaise,
    string Currency,
    string? Receipt) : IRequest<CreateRazorpayOrderResponseDto>;
