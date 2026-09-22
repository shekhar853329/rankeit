using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Leaderboards;

/// <summary>
/// Cross-category leaderboard (business rule C): one representative (current #1) listing per category,
/// ranked by a normalized score instead of raw bid amount.
/// </summary>
public sealed record GetGlobalLeaderboardQuery(int TopN) : IRequest<IReadOnlyList<GlobalLeaderboardEntryDto>>;
