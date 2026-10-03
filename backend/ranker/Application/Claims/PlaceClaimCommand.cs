using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Claims;

/// <summary>
/// Places (or reclaims) a position. If ListingId is null a brand-new listing is created; otherwise the
/// existing listing (validated against OwnerContactEmail) attempts to raise its own CurrentClaimAmount.
/// </summary>
public sealed record PlaceClaimCommand(
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
    string? FaviconUrl) : IRequest<PlaceClaimResultDto>;
