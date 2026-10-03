namespace Ranker.Dtos;

/// <summary>One historical claim placed against a listing (rule for the listing detail / "see details" page).</summary>
public sealed record ClaimHistoryEntryDto(
    decimal Amount,
    decimal PaymentAmount,
    DateTime CreatedAt,
    string PaymentReferenceMasked);

/// <summary>Full detail for a single listing, including its claim history, for the "see details" page.</summary>
public sealed record ListingDetailDto(
    int ListingId,
    string ListingName,
    string ListingUrl,
    string CategoryName,
    string CategorySlug,
    int CurrentRankInCategory,
    decimal CurrentClaimAmount,
    DateTime FirstClaimAt,
    DateTime LastClaimAt,
    int ClickCount,
    string? SiteName,
    string? LogoUrl,
    string? Description,
    string? FaviconUrl,
    IReadOnlyList<ClaimHistoryEntryDto> Claims);

public sealed record ListingLookupResultDto(
    bool Found,
    int? ListingId,
    string? ListingName,
    string? ListingUrl,
    decimal CurrentClaimAmount,
    int? CurrentRankInCategory,
    string? OwnerContactEmailMasked,
    string? SiteName,
    string? LogoUrl,
    string? Description,
    string? FaviconUrl);
