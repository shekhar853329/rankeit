using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Leaderboards;

/// <summary>
/// Cross-category leaderboard: all listings ranked by raw bid amount (highest payer first).
/// No per-category normalization — whoever paid the most globally sits at the top.
/// </summary>
public sealed record GetGlobalLeaderboardQuery(int TopN) : IRequest<IReadOnlyList<GlobalLeaderboardEntryDto>>;
