using System.Collections.Concurrent;

namespace Ranker.Hubs;

/// <summary>Tracks live SignalR connection ids so the navbar can show a real-time online-user count.</summary>
public class OnlineUsersTracker
{
    private readonly ConcurrentDictionary<string, byte> connectionIds = new();

    public int AddConnection(string connectionId)
    {
        connectionIds.TryAdd(connectionId, 0);
        return connectionIds.Count;
    }

    public int RemoveConnection(string connectionId)
    {
        connectionIds.TryRemove(connectionId, out _);
        return connectionIds.Count;
    }
}
