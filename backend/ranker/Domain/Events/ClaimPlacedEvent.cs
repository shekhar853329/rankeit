using MediatR;

namespace Ranker.Domain.Events;

/// <summary>
/// Published after a claim transaction commits. Consumed by SignalR broadcast and global-leaderboard
/// cache-invalidation handlers.
/// </summary>
public sealed record ClaimPlacedEvent(
    int ListingId,
    int CategoryId,
    string CategorySlug,
    string ListingName,
    decimal NewClaimAmount,
    DateTime OccurredAt,
    bool BecameCategoryTop) : INotification;
