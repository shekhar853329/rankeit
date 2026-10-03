namespace Ranker.Dtos;

/// <summary>A single listing's rank within its day-of-first-claim group, for the "Day wise listing" page.</summary>
public sealed record DailyListingEntryDto(
    int Rank,
    int ListingId,
    string ListingName,
    string ListingUrl,
    string CategoryName,
    string CategorySlug,
    decimal CurrentClaimAmount,
    DateTime FirstClaimAt,
    int ClickCount,
    string? SiteName,
    string? LogoUrl,
    string? FaviconUrl);

/// <summary>All listings that received their first claim on a given day, ranked by CurrentClaimAmount DESC.</summary>
public sealed record DailyListingGroupDto(
    DateOnly Day,
    int TotalCount,
    IReadOnlyList<DailyListingEntryDto> Entries);
