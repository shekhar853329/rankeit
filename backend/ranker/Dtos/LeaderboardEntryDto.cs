using Ranker.Common;

namespace Ranker.Dtos;

/// <summary>A single row in a per-category leaderboard, ranked strictly by CurrentClaimAmount DESC, FirstClaimAt ASC.</summary>
public sealed record LeaderboardEntryDto(
    int Rank,
    int ListingId,
    string ListingName,
    string ListingUrl,
    decimal CurrentClaimAmount,
    DateTime FirstClaimAt,
    DateTime LastClaimAt,
    int ClickCount,
    int ClaimCount,
    string? SiteName,
    string? LogoUrl,
    string? Description,
    string? FaviconUrl);

/// <summary>Category context alongside its paginated leaderboard, so callers can place a claim without a second round trip.</summary>
public sealed record CategoryLeaderboardResponseDto(
    int CategoryId,
    string CategoryName,
    string CategorySlug,
    string? CategoryIcon,
    decimal MinClaimIncrement,
    decimal MinStartingClaim,
    PagedResult<LeaderboardEntryDto> Leaderboard);
