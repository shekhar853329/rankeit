using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Leaderboards;

public sealed record GetSpotRankQuery(
    decimal Amount,
    string? TimeMode = "today",
    string? CategorySlug = null,
    int? ListingId = null) : IRequest<SpotRankDto>;
