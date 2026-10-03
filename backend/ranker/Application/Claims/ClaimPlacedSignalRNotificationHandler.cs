using MediatR;
using Microsoft.AspNetCore.SignalR;
using Ranker.Domain.Events;
using Ranker.Hubs;

namespace Ranker.Application.Claims;

/// <summary>Broadcasts a RankUpdated event (rule D1) whenever a claim is confirmed.</summary>
public class ClaimPlacedSignalRNotificationHandler(IHubContext<LeaderboardHub> hubContext)
    : INotificationHandler<ClaimPlacedEvent>
{
    public async Task Handle(ClaimPlacedEvent notification, CancellationToken ct)
    {
        var payload = new RankUpdatedPayload(
            notification.CategorySlug,
            notification.ListingId,
            notification.ListingName,
            notification.NewClaimAmount,
            notification.BecameCategoryTop,
            notification.OccurredAt);

        await hubContext.Clients
            .Group(LeaderboardGroups.ForCategory(notification.CategorySlug))
            .SendAsync("RankUpdated", payload, ct);

        // The homepage/global strip only needs to react when this claim actually changed the category's #1.
        if (notification.BecameCategoryTop)
        {
            await hubContext.Clients.Group(LeaderboardGroups.Global).SendAsync("RankUpdated", payload, ct);
        }
    }
}
