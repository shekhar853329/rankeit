using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Ranker.Application.Listings;
using Ranker.Data;
using Ranker.Domain.Events;
using Ranker.Services.Seo;

namespace Ranker.Application.Claims;

public class ClaimPlacedSeoIndexingHandler(
    RankerDbContext dbContext,
    IMemoryCache cache,
    IIndexNowService indexNowService,
    ILogger<ClaimPlacedSeoIndexingHandler> logger) : INotificationHandler<ClaimPlacedEvent>
{
    public async Task Handle(ClaimPlacedEvent notification, CancellationToken ct)
    {
        try
        {
            // 1. Invalidate dynamic sitemap cache
            cache.Remove("rankup_dynamic_sitemap_xml");

            // 2. Fetch listing URL to compute slug
            var listing = await dbContext.Listings
                .AsNoTracking()
                .Where(l => l.Id == notification.ListingId)
                .Select(l => new { l.Url })
                .FirstOrDefaultAsync(ct);

            if (listing is null || string.IsNullOrWhiteSpace(listing.Url)) return;

            var slug = GetWebsiteProfileQueryHandler.SlugifyUrl(listing.Url);

            // 3. Dispatch IndexNow ping for rapid crawler indexing
            var urlsToNotify = new List<string>
            {
                $"https://rankup.cyou/website/{slug}",
                $"https://rankup.cyou/leaderboard/{notification.CategorySlug}",
                "https://rankup.cyou/"
            };

            await indexNowService.NotifyUrlChangeAsync(urlsToNotify, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Error executing SEO indexing handler for listing {ListingId}", notification.ListingId);
        }
    }
}
