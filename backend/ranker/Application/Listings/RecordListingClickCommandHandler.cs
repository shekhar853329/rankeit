using MediatR;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Hubs;
using Ranker.Services.Leaderboards;

namespace Ranker.Application.Listings;

public class RecordListingClickCommandHandler(RankerDbContext dbContext, IHubContext<LeaderboardHub> hubContext, GlobalLeaderboardCache cache)
    : IRequestHandler<RecordListingClickCommand, int?>
{
    public async Task<int?> Handle(RecordListingClickCommand request, CancellationToken ct)
    {
        // Single atomic UPDATE - avoids a read-modify-write race between concurrent clicks on the same listing.
        var rowsAffected = await dbContext.Listings
            .Where(l => l.Id == request.ListingId)
            .ExecuteUpdateAsync(s => s.SetProperty(l => l.ClickCount, l => l.ClickCount + 1), ct);

        if (rowsAffected == 0)
        {
            return null;
        }

        var listing = await dbContext.Listings
            .AsNoTracking()
            .Where(l => l.Id == request.ListingId)
            .Select(l => new { l.ClickCount, CategorySlug = l.Category!.Slug })
            .FirstOrDefaultAsync(ct);

        if (listing is null)
        {
            return null;
        }

        // The homepage's global leaderboard is a cached read model (rule C3) and otherwise only
        // invalidates on bid changes, so without this a refresh would keep serving the stale click count.
        cache.Invalidate();

        var payload = new ListingClickedPayload(request.ListingId, listing.ClickCount);
        await hubContext.Clients.Group(LeaderboardGroups.ForCategory(listing.CategorySlug)).SendAsync("ListingClicked", payload, ct);
        await hubContext.Clients.Group(LeaderboardGroups.Global).SendAsync("ListingClicked", payload, ct);

        return listing.ClickCount;
    }
}
