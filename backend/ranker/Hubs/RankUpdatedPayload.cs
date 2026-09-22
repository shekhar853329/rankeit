namespace Ranker.Hubs;

/// <summary>Payload broadcast to SignalR clients as the "RankUpdated" event.</summary>
public sealed record RankUpdatedPayload(
    string CategorySlug,
    int ListingId,
    string ListingName,
    decimal NewBidAmount,
    bool BecameCategoryTop,
    DateTime OccurredAt);
