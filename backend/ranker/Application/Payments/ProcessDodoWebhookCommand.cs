using MediatR;

namespace Ranker.Application.Payments;

public sealed record ProcessDodoWebhookCommand(
    string RawBody,
    string? WebhookId,
    string? Signature,
    string? Timestamp) : IRequest<bool>;
