using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Listings;

/// <summary>Fetches a single listing plus its full bid history, for the "see details" page.</summary>
public sealed record GetListingDetailQuery(int ListingId) : IRequest<ListingDetailDto?>;
