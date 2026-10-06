using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Payments;

public sealed record GetDodoSessionStatusQuery(string SessionId) : IRequest<DodoSessionStatusResponseDto>;
