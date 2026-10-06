using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Payments;

/// <summary>
/// CQRS command to request a Dodo Payments checkout session.
/// Amount is in minor units (e.g., paise for INR or cents for USD).
/// </summary>
public sealed record CreateDodoSessionCommand(
    int AmountInMinorUnits,
    string Currency,
    string? CustomerEmail,
    string? CustomerName,
    string? ReturnUrl,
    string? ListingName = null,
    string? ListingId = null,
    string? CategoryId = null,
    string? BillingStreet = null,
    string? BillingCity = null,
    string? BillingState = null,
    string? BillingCountry = null,
    string? BillingZipcode = null,
    Dictionary<string, string>? Metadata = null) : IRequest<CreateDodoSessionResponseDto>;
