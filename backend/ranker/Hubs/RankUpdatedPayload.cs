namespace Ranker.Hubs;

/// <summary>Payload broadcast to SignalR clients as the "RankUpdated" event.</summary>
public sealed record RankUpdatedPayload(
    string CategorySlug,
    int ListingId,
    string ListingName,
    decimal NewClaimAmount,
    bool BecameCategoryTop,
    DateTime OccurredAt);
