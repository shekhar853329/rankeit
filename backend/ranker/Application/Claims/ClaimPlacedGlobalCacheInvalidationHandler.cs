using MediatR;
using Ranker.Domain.Events;
using Ranker.Services.Leaderboards;

namespace Ranker.Application.Claims;

/// <summary>
/// Invalidates the cached global leaderboard read model (rule C3) only when a ClaimPlaced event changed a
/// category's #1 - other claims can't affect which representative each category currently sends to the
/// global board.
/// </summary>
public class ClaimPlacedGlobalCacheInvalidationHandler(GlobalLeaderboardCache cache) : INotificationHandler<ClaimPlacedEvent>
{
    public Task Handle(ClaimPlacedEvent notification, CancellationToken ct)
    {
        if (notification.BecameCategoryTop)
        {
            cache.Invalidate();
        }

        return Task.CompletedTask;
    }
}
