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
