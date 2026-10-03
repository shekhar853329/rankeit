namespace Ranker.Dtos;

/// <summary>
/// One representative (category #1) listing on the cross-category leaderboard, ranked by a
/// normalized score rather than raw claim amount so high-price verticals don't automatically dominate.
/// </summary>
public sealed record GlobalLeaderboardEntryDto(
    int Rank,
    int CategoryId,
    string CategoryName,
    string CategorySlug,
    string? CategoryIcon,
    int ListingId,
    string ListingName,
    string ListingUrl,
    decimal CurrentClaimAmount,
    decimal NormalizedScore,
    int ClickCount,
    int ClaimCount,
    string? SiteName,
    string? LogoUrl,
    string? Description,
    string? FaviconUrl);
