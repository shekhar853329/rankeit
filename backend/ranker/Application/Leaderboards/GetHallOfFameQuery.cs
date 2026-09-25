using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Dtos;

namespace Ranker.Application.Leaderboards;

public sealed record GetHallOfFameQuery(int TopN = 5) : IRequest<IReadOnlyList<HallOfFameItemDto>>;

public class GetHallOfFameQueryHandler(RankerDbContext dbContext)
    : IRequestHandler<GetHallOfFameQuery, IReadOnlyList<HallOfFameItemDto>>
{
    public async Task<IReadOnlyList<HallOfFameItemDto>> Handle(GetHallOfFameQuery request, CancellationToken ct)
    {
        var topN = Math.Clamp(request.TopN, 1, 20);

        var listings = await dbContext.Listings
            .AsNoTracking()
            .OrderByDescending(l => l.CurrentBidAmount)
            .ThenBy(l => l.FirstBidAt)
            .Take(topN)
            .Select(l => new
            {
                l.Id,
                l.Name,
                l.SiteName,
                l.Url,
                l.CurrentBidAmount,
                l.ClickCount
            })
            .ToListAsync(ct);

        return listings
            .Select((l, idx) => new HallOfFameItemDto(
                l.Id,
                idx + 1,
                l.Name,
                l.SiteName,
                l.Url,
                l.CurrentBidAmount,
                l.ClickCount))
            .ToList();
    }
}
