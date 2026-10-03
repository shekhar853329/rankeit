using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Dtos;

namespace Ranker.Application.Listings;

public class GetListingDetailQueryHandler(RankerDbContext dbContext) : IRequestHandler<GetListingDetailQuery, ListingDetailDto?>
{
    public async Task<ListingDetailDto?> Handle(GetListingDetailQuery request, CancellationToken ct)
    {
        var listing = await dbContext.Listings
            .AsNoTracking()
            .Where(l => l.Id == request.ListingId)
            .Select(l => new
            {
                l.Id,
                l.Name,
                l.Url,
                l.CategoryId,
                l.CurrentClaimAmount,
                l.FirstClaimAt,
                l.LastClaimAt,
                l.ClickCount,
                l.SiteName,
                l.LogoUrl,
                l.Description,
                l.FaviconUrl,
                CategoryName = l.Category!.Name,
                CategorySlug = l.Category!.Slug,
            })
            .FirstOrDefaultAsync(ct);

        if (listing is null)
        {
            return null;
        }

        // Calculate the rank of this listing within its category. Rank is determined by
        // CurrentClaimAmount DESC, FirstClaimAt ASC (same ordering used in leaderboards).
        var rank = await dbContext.Listings
            .AsNoTracking()
            .Where(l => l.CategoryId == listing.CategoryId)
            .Where(l => l.CurrentClaimAmount > listing.CurrentClaimAmount
                || (l.CurrentClaimAmount == listing.CurrentClaimAmount && l.FirstClaimAt < listing.FirstClaimAt))
            .CountAsync(ct) + 1;

        var claims = await dbContext.Claims
            .AsNoTracking()
            .Where(c => c.ListingId == request.ListingId)
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new { c.Amount, c.PaymentAmount, c.CreatedAt, c.PaymentReference })
            .ToListAsync(ct);

        var claimHistory = claims
            .Select(c => new ClaimHistoryEntryDto(c.Amount, c.PaymentAmount, c.CreatedAt, MaskPaymentReference(c.PaymentReference)))
            .ToList();

        return new ListingDetailDto(
            listing.Id,
            listing.Name,
            listing.Url,
            listing.CategoryName,
            listing.CategorySlug,
            rank,
            listing.CurrentClaimAmount,
            listing.FirstClaimAt,
            listing.LastClaimAt,
            listing.ClickCount,
            listing.SiteName,
            listing.LogoUrl,
            listing.Description,
            listing.FaviconUrl,
            claimHistory);
    }

    // Never expose the full payment gateway transaction ID to the client - only enough to disambiguate rows.
    private static string MaskPaymentReference(string reference)
    {
        const int visibleSuffixLength = 4;
        if (reference.Length <= visibleSuffixLength)
        {
            return new string('*', reference.Length);
        }
        return new string('*', reference.Length - visibleSuffixLength) + reference[^visibleSuffixLength..];
    }
}
