using MediatR;

namespace Ranker.Domain.Events;

/// <summary>
/// Published after a bid transaction commits. Consumed by SignalR broadcast and global-leaderboard
/// cache-invalidation handlers.
/// </summary>
public sealed record BidPlacedEvent(
    int ListingId,
    int CategoryId,
    string CategorySlug,
    string ListingName,
    decimal NewBidAmount,
    DateTime OccurredAt,
    bool BecameCategoryTop) : INotification;
