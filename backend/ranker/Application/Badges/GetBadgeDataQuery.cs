using MediatR;

namespace Ranker.Application.Badges;

/// <summary>Returns the data needed to render a dynamic SVG badge for a website slug.</summary>
public sealed record GetBadgeDataQuery(string Slug) : IRequest<BadgeDataResult?>;

/// <summary>Projection used by BadgeController to render badge SVGs.</summary>
public sealed record BadgeDataResult(
    string DisplayName,
    int? CategoryRank,
    int? GlobalRank,
    string? CategoryName,
    bool IsVerified);
