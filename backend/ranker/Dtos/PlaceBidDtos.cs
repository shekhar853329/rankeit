namespace Ranker.Dtos;

public sealed record PlaceBidRequestDto(
    int CategoryId,
    int? ListingId,
    string? ListingName,
    string? ListingUrl,
    string OwnerContactEmail,
    decimal TargetBidAmount,
    string PaymentReference,
    decimal ConfirmedPaymentAmount,
    string? SiteName,
    string? LogoUrl,
    string? Description,
    string? FaviconUrl);

public sealed record PlaceBidResultDto(
    bool Success,
    string? ErrorCode,
    string? ErrorMessage,
    int? ListingId,
    decimal? NewCurrentBidAmount,
    decimal? AmountCharged);

public sealed record CalculateBidQuoteRequestDto(
    int CategoryId,
    int? ListingId,
    string? ListingUrl,
    string? OwnerContactEmail,
    decimal TargetBidAmount);

public sealed record CalculateBidQuoteResponseDto(
    bool Success,
    string? ErrorCode,
    string? ErrorMessage,
    int CategoryId,
    string CategoryName,
    decimal CategoryMinStartingBid,
    decimal CategoryMinBidIncrement,
    decimal? CurrentTopBidInCategory,
    int? CurrentTopListingId,
    string? CurrentTopListingName,
    int? ListingId,
    string? ListingName,
    decimal ExistingListingCurrentBid,
    decimal TargetBidAmount,
    decimal RequiredMinimumBid,
    decimal ExpectedChargeAmount,
    bool BecameCategoryTop);
