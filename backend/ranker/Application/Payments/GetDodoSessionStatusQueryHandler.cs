using MediatR;
using Microsoft.Extensions.Logging;
using Ranker.Dtos;
using Ranker.Services.Payments;

namespace Ranker.Application.Payments;

public class GetDodoSessionStatusQueryHandler(
    IDodoPaymentsService dodoPaymentsService,
    ILogger<GetDodoSessionStatusQueryHandler> logger)
    : IRequestHandler<GetDodoSessionStatusQuery, DodoSessionStatusResponseDto>
{
    public async Task<DodoSessionStatusResponseDto> Handle(
        GetDodoSessionStatusQuery query,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(query.SessionId))
        {
            throw new ArgumentException("SessionId cannot be null or whitespace.", nameof(query.SessionId));
        }

        logger.LogInformation("Querying Dodo Payments session status for {SessionId}", query.SessionId);

        var (id, paymentId, paymentStatus, isPaid) = await dodoPaymentsService.GetSessionStatusAsync(query.SessionId, ct);

        logger.LogInformation(
            "Retrieved Dodo Payments session {SessionId}: PaymentId={PaymentId}, Status={Status}, IsPaid={IsPaid}",
            id, paymentId, paymentStatus, isPaid);

        return new DodoSessionStatusResponseDto(id, paymentId, paymentStatus, isPaid);
    }
}
