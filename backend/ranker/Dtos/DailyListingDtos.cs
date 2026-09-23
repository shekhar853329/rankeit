namespace Ranker.Dtos;

/// <summary>A single listing's rank within its day-of-first-bid group, for the "Day wise listing" page.</summary>
public sealed record DailyListingEntryDto(
    int Rank,
    int ListingId,
    string ListingName,
    string ListingUrl,
    string CategoryName,
    string CategorySlug,
    decimal CurrentBidAmount,
    DateTime FirstBidAt,
    int ClickCount);

/// <summary>All listings that received their first bid on a given day, ranked by CurrentBidAmount DESC.</summary>
public sealed record DailyListingGroupDto(
    DateOnly Day,
    int TotalCount,
    IReadOnlyList<DailyListingEntryDto> Entries);
