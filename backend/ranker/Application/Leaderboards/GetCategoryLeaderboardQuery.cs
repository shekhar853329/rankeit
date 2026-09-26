using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Leaderboards;

/// <summary>Paginated, strictly-by-bid-amount leaderboard for a single category (business rule A).</summary>
public sealed record GetCategoryLeaderboardQuery(string CategorySlug, int Page, int PageSize, string? TimeMode = null)
    : IRequest<CategoryLeaderboardResponseDto?>;
