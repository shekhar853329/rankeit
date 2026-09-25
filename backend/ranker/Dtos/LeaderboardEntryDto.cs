using Ranker.Common;

namespace Ranker.Dtos;

/// <summary>A single row in a per-category leaderboard, ranked strictly by CurrentBidAmount DESC, FirstBidAt ASC.</summary>
public sealed record LeaderboardEntryDto(
    int Rank,
    int ListingId,
    string ListingName,
    string ListingUrl,
    decimal CurrentBidAmount,
    DateTime FirstBidAt,
    DateTime LastBidAt,
    int ClickCount,
    int BidCount,
    string? SiteName,
    string? LogoUrl,
    string? Description,
    string? FaviconUrl);

/// <summary>Category context alongside its paginated leaderboard, so callers can place a bid without a second round trip.</summary>
public sealed record CategoryLeaderboardResponseDto(
    int CategoryId,
    string CategoryName,
    string CategorySlug,
    string? CategoryIcon,
    decimal MinBidIncrement,
    decimal MinStartingBid,
    PagedResult<LeaderboardEntryDto> Leaderboard);
