using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Payments;

public sealed record GetPaymentTransactionsQuery(string Email) : IRequest<IReadOnlyList<PaymentTransactionDto>>;
