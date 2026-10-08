namespace Ranker.Dtos;

public sealed record PlaceClaimRequestDto(
    int CategoryId,
    int? ListingId,
    string? ListingName,
    string? ListingUrl,
    string OwnerContactEmail,
    decimal TargetClaimAmount,
    string PaymentReference,
    decimal ConfirmedPaymentAmount,
    string? SiteName,
    string? LogoUrl,
    string? Description,
    string? FaviconUrl,
    bool IsAllTimeMode = false);

public sealed record PlaceClaimResultDto(
    bool Success,
    string? ErrorCode,
    string? ErrorMessage,
    int? ListingId,
    decimal? NewCurrentClaimAmount,
    decimal? AmountCharged);

public sealed record CalculateClaimQuoteRequestDto(
    int CategoryId,
    int? ListingId,
    string? ListingUrl,
    string? OwnerContactEmail,
    decimal TargetClaimAmount,
    bool IsAllTimeMode = false);

public sealed record CalculateClaimQuoteResponseDto(
    bool Success,
    string? ErrorCode,
    string? ErrorMessage,
    int CategoryId,
    string CategoryName,
    decimal CategoryMinStartingClaim,
    decimal CategoryMinClaimIncrement,
    decimal? CurrentTopClaimInCategory,
    int? CurrentTopListingId,
    string? CurrentTopListingName,
    int? ListingId,
    string? ListingName,
    decimal ExistingListingCurrentClaim,
    decimal TargetClaimAmount,
    decimal RequiredMinimumClaim,
    decimal ExpectedChargeAmount,
    bool BecameCategoryTop);
