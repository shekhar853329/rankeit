using MediatR;
using Microsoft.AspNetCore.SignalR;
using Ranker.Domain.Events;
using Ranker.Hubs;

namespace Ranker.Application.Bids;

/// <summary>Broadcasts a RankUpdated event (rule D1) whenever a bid is confirmed.</summary>
public class BidPlacedSignalRNotificationHandler(IHubContext<LeaderboardHub> hubContext)
    : INotificationHandler<BidPlacedEvent>
{
    public async Task Handle(BidPlacedEvent notification, CancellationToken ct)
    {
        var payload = new RankUpdatedPayload(
            notification.CategorySlug,
            notification.ListingId,
            notification.ListingName,
            notification.NewBidAmount,
            notification.BecameCategoryTop,
            notification.OccurredAt);

        await hubContext.Clients
            .Group(LeaderboardGroups.ForCategory(notification.CategorySlug))
            .SendAsync("RankUpdated", payload, ct);

        // The homepage/global strip only needs to react when this bid actually changed the category's #1.
        if (notification.BecameCategoryTop)
        {
            await hubContext.Clients.Group(LeaderboardGroups.Global).SendAsync("RankUpdated", payload, ct);
        }
    }
}
