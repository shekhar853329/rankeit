using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Application.Common;
using Ranker.Data;
using Ranker.Dtos;

namespace Ranker.Application.Payments;

public class GetPaymentTransactionsQueryHandler(RankerDbContext dbContext)
    : IRequestHandler<GetPaymentTransactionsQuery, IReadOnlyList<PaymentTransactionDto>>
{
    public async Task<IReadOnlyList<PaymentTransactionDto>> Handle(
        GetPaymentTransactionsQuery query,
        CancellationToken ct)
    {
        var raw = await dbContext.PaymentAuditLogs
            .Where(l => l.CustomerEmail == query.Email && l.TransactionStatus != "Succeeded")
            .OrderByDescending(l => l.CreatedAt)
            .Take(100)
            .Select(l => new
            {
                l.Id,
                l.Action,
                l.TransactionStatus,
                l.PaymentId,
                l.SessionId,
                l.OrderId,
                l.Amount,
                l.Currency,
                l.IsSuccess,
                l.ErrorMessage,
                l.CreatedAt,
            })
            .ToListAsync(ct);

        var result = raw
            .Select(l => new PaymentTransactionDto(
                l.Id,
                l.Action,
                l.TransactionStatus,
                PaymentIdMasker.Mask(l.PaymentId),
                PaymentIdMasker.Mask(l.SessionId),
                PaymentIdMasker.Mask(l.OrderId),
                l.Amount,
                l.Currency,
                l.IsSuccess,
                l.ErrorMessage,
                l.CreatedAt))
            .ToList();

        return result;
    }
}
