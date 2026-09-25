using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Bids;

/// <summary>
/// Places (or reclaims) a bid. If ListingId is null a brand-new listing is created; otherwise the
/// existing listing (validated against OwnerContactEmail) attempts to raise its own CurrentBidAmount.
/// </summary>
public sealed record PlaceBidCommand(
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
    string? FaviconUrl) : IRequest<PlaceBidResultDto>;
