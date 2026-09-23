using Microsoft.AspNetCore.SignalR;

namespace Ranker.Hubs;

/// <summary>
/// Group-based real-time hub (rule D). Clients join a per-category group to get live re-orders of that
/// vertical's leaderboard, and/or the global group to get live updates to the homepage top-bidders strip.
/// Also broadcasts the live online-user count to every connected client.
/// </summary>
public class LeaderboardHub(OnlineUsersTracker onlineUsersTracker) : Hub
{
    public async Task JoinCategoryGroup(string categorySlug) =>
        await Groups.AddToGroupAsync(Context.ConnectionId, LeaderboardGroups.ForCategory(categorySlug));

    public async Task LeaveCategoryGroup(string categorySlug) =>
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, LeaderboardGroups.ForCategory(categorySlug));

    public async Task JoinGlobalGroup() =>
        await Groups.AddToGroupAsync(Context.ConnectionId, LeaderboardGroups.Global);

    public async Task LeaveGlobalGroup() =>
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, LeaderboardGroups.Global);

    public override async Task OnConnectedAsync()
    {
        var count = onlineUsersTracker.AddConnection(Context.ConnectionId);
        await Clients.All.SendAsync("OnlineUsersUpdated", count);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var count = onlineUsersTracker.RemoveConnection(Context.ConnectionId);
        await Clients.All.SendAsync("OnlineUsersUpdated", count);
        await base.OnDisconnectedAsync(exception);
    }
}
