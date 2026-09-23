namespace Ranker.Hubs;

/// <summary>Payload broadcast to SignalR clients as the "ListingClicked" event, for live click-through counters.</summary>
public sealed record ListingClickedPayload(int ListingId, int ClickCount);
