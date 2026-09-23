using MediatR;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Hubs;

namespace Ranker.Application.Analytics;

public class IncrementSiteVisitCountCommandHandler(RankerDbContext dbContext, IHubContext<LeaderboardHub> hubContext)
    : IRequestHandler<IncrementSiteVisitCountCommand, int>
{
    public async Task<int> Handle(IncrementSiteVisitCountCommand request, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Atomic UPDATE ... SET Count = Count + 1 at the DB level, avoiding a read-modify-write race.
        var updated = await dbContext.DailyVisitCounts
            .Where(v => v.VisitDate == today)
            .ExecuteUpdateAsync(s => s.SetProperty(v => v.Count, v => v.Count + 1), ct);

        if (updated == 0)
        {
            dbContext.DailyVisitCounts.Add(new DailyVisitCount { VisitDate = today, Count = 1 });

            try
            {
                await dbContext.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // Another request created today's row first; increment it instead.
                await dbContext.DailyVisitCounts
                    .Where(v => v.VisitDate == today)
                    .ExecuteUpdateAsync(s => s.SetProperty(v => v.Count, v => v.Count + 1), ct);
            }
        }

        var visitsToday = await dbContext.DailyVisitCounts
            .Where(v => v.VisitDate == today)
            .Select(v => v.Count)
            .SingleAsync(ct);

        // Push the new total to every connected client so it updates live, not just the tab that just loaded.
        await hubContext.Clients.All.SendAsync("VisitsTodayUpdated", visitsToday, ct);

        return visitsToday;
    }
}
