using MediatR;
using Ranker.Domain.Events;
using Ranker.Services.Leaderboards;

namespace Ranker.Application.Bids;

/// <summary>
/// Invalidates the cached global leaderboard read model (rule C3) only when a BidPlaced event changed a
/// category's #1 - other bids can't affect which representative each category currently sends to the
/// global board.
/// </summary>
public class BidPlacedGlobalCacheInvalidationHandler(GlobalLeaderboardCache cache) : INotificationHandler<BidPlacedEvent>
{
    public Task Handle(BidPlacedEvent notification, CancellationToken ct)
    {
        if (notification.BecameCategoryTop)
        {
            cache.Invalidate();
        }

        return Task.CompletedTask;
    }
}
