using MediatR;

namespace Ranker.Application.Listings;

/// <summary>Records a click-through to a listing's product URL and broadcasts the new count live.</summary>
public sealed record RecordListingClickCommand(int ListingId) : IRequest<int?>;
