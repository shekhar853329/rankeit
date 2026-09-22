using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Primitives;
using Ranker.Dtos;

namespace Ranker.Services.Leaderboards;

/// <summary>
/// Cache-aside store for the global leaderboard read model. Not recomputed on every request - only when
/// invalidated (a BidPlaced event affecting a category's #1) or after the safety-net expiration elapses.
/// </summary>
public class GlobalLeaderboardCache(IMemoryCache cache)
{
    private static readonly TimeSpan SafetyNetExpiration = TimeSpan.FromMinutes(5);

    private CancellationTokenSource _resetCts = new();

    public Task<IReadOnlyList<GlobalLeaderboardEntryDto>> GetOrCreateAsync(
        int topN,
        Func<Task<IReadOnlyList<GlobalLeaderboardEntryDto>>> factory)
    {
        return cache.GetOrCreateAsync($"global-leaderboard:{topN}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = SafetyNetExpiration;
            entry.AddExpirationToken(new CancellationChangeToken(_resetCts.Token));
            return await factory();
        })!;
    }

    /// <summary>Invalidates every cached topN variant at once by tripping the shared expiration token.</summary>
    public void Invalidate()
    {
        var old = Interlocked.Exchange(ref _resetCts, new CancellationTokenSource());
        old.Cancel();
        old.Dispose();
    }
}
