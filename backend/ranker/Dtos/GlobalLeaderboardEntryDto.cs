namespace Ranker.Dtos;

/// <summary>
/// One representative (category #1) listing on the cross-category leaderboard, ranked by a
/// normalized score rather than raw bid amount so high-price verticals don't automatically dominate.
/// </summary>
public sealed record GlobalLeaderboardEntryDto(
    int Rank,
    int CategoryId,
    string CategoryName,
    string CategorySlug,
    int ListingId,
    string ListingName,
    string ListingUrl,
    decimal CurrentBidAmount,
    decimal NormalizedScore,
    int ClickCount);
