namespace Ranker.Dtos;

/// <summary>A related listing shown on the website profile page (same category or similar).</summary>
public sealed record RelatedListingDto(
    int ListingId,
    string ListingName,
    string ListingUrl,
    string CategoryName,
    string CategorySlug,
    int Rank,
    decimal CurrentClaimAmount,
    int ClickCount,
    string? SiteName,
    string? LogoUrl,
    string? Description,
    string? FaviconUrl);

/// <summary>Full public profile for a website, used by the /website/:slug SEO page.</summary>
public sealed record WebsiteProfileDto(
    int ListingId,
    string ListingName,
    string ListingUrl,
    string Slug,
    string CategoryName,
    string CategorySlug,
    string? CategoryIcon,
    int CurrentRankInCategory,
    int TotalListingsInCategory,
    decimal CurrentClaimAmount,
    DateTime FirstClaimAt,
    DateTime LastClaimAt,
    int ClickCount,
    int ClaimCount,
    string? SiteName,
    string? LogoUrl,
    string? Description,
    string? FaviconUrl,
    string? OwnerContactEmailMasked,
    IReadOnlyList<RelatedListingDto> SameCategoryListings);
