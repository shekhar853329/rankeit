using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Dtos;

namespace Ranker.Application.Listings;

public sealed record LookupListingQuery(int CategoryId, string Url) : IRequest<ListingLookupResultDto>;

public class LookupListingQueryHandler(RankerDbContext dbContext)
    : IRequestHandler<LookupListingQuery, ListingLookupResultDto>
{
    public async Task<ListingLookupResultDto> Handle(LookupListingQuery request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Url))
        {
            return NotFoundResult();
        }

        var clean = request.Url.Trim().TrimEnd('/');
        var rawDomain = clean;
        if (rawDomain.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            rawDomain = rawDomain[8..];
        else if (rawDomain.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            rawDomain = rawDomain[7..];

        rawDomain = rawDomain.TrimEnd('/');

        var withHttps = "https://" + rawDomain;
        var withHttp = "http://" + rawDomain;

        var listing = await dbContext.Listings
            .AsNoTracking()
            .Where(l => l.CategoryId == request.CategoryId)
            .Where(l => l.Url == clean ||
                        l.Url == clean + "/" ||
                        l.Url == withHttps ||
                        l.Url == withHttps + "/" ||
                        l.Url == withHttp ||
                        l.Url == withHttp + "/" ||
                        l.Url.Contains(rawDomain))
            .OrderByDescending(l => l.CurrentBidAmount)
            .FirstOrDefaultAsync(ct);

        if (listing is null)
        {
            return NotFoundResult();
        }

        var rank = await dbContext.Listings
            .Where(l => l.CategoryId == listing.CategoryId &&
                        (l.CurrentBidAmount > listing.CurrentBidAmount ||
                         (l.CurrentBidAmount == listing.CurrentBidAmount && l.FirstBidAt < listing.FirstBidAt)))
            .CountAsync(ct) + 1;

        var maskedEmail = MaskEmail(listing.OwnerContactEmail);

        return new ListingLookupResultDto(
            Found: true,
            ListingId: listing.Id,
            ListingName: listing.Name,
            ListingUrl: listing.Url,
            CurrentBidAmount: listing.CurrentBidAmount,
            CurrentRankInCategory: rank,
            OwnerContactEmailMasked: maskedEmail,
            SiteName: listing.SiteName,
            LogoUrl: listing.LogoUrl,
            Description: listing.Description,
            FaviconUrl: listing.FaviconUrl);
    }

    private static ListingLookupResultDto NotFoundResult() =>
        new(false, null, null, null, 0m, null, null, null, null, null, null);

    private static string? MaskEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return null;
        var parts = email.Split('@');
        if (parts.Length != 2) return email;
        var name = parts[0];
        var domain = parts[1];
        if (name.Length <= 2) return $"{name[0]}*@{domain}";
        return $"{name[0]}***{name[^1]}@{domain}";
    }
}
