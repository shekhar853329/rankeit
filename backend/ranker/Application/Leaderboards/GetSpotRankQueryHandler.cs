using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Dtos;
using Ranker.Repositories;

namespace Ranker.Application.Leaderboards;

public class GetSpotRankQueryHandler(RankerDbContext dbContext, ICategoryRepository categoryRepository)
    : IRequestHandler<GetSpotRankQuery, SpotRankDto>
{
    public async Task<SpotRankDto> Handle(GetSpotRankQuery request, CancellationToken ct)
    {
        var timeMode = request.TimeMode?.ToLowerInvariant() == "alltime" ? "alltime" : "today";
        var query = dbContext.Listings.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(request.CategorySlug))
        {
            var category = await categoryRepository.GetBySlugAsync(request.CategorySlug.Trim(), ct);
            if (category != null)
            {
                query = query.Where(l => l.CategoryId == category.Id);
            }
        }

        if (request.ListingId.HasValue)
        {
            query = query.Where(l => l.Id != request.ListingId.Value);
        }

        if (timeMode == "today")
        {
            var todayUtc = DateTime.UtcNow.Date;
            query = query.Where(l => l.LastClaimAt >= todayUtc);
        }

        var targetAmount = Math.Max(0m, request.Amount);
        // By rules A1/A2, an existing listing with CurrentClaimAmount >= targetAmount ranks ahead of the new claim
        var higherOrEqualCount = await query.CountAsync(l => l.CurrentClaimAmount >= targetAmount, ct);
        var rank = higherOrEqualCount + 1;

        return new SpotRankDto(rank, request.Amount, timeMode, request.CategorySlug);
    }
}
