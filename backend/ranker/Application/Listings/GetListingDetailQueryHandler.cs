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
                l.CurrentBidAmount,
                l.FirstBidAt,
                l.LastBidAt,
                l.ClickCount,
                CategoryName = l.Category!.Name,
                CategorySlug = l.Category!.Slug,
            })
            .FirstOrDefaultAsync(ct);

        if (listing is null)
        {
            return null;
        }

        var bids = await dbContext.Bids
            .AsNoTracking()
            .Where(b => b.ListingId == request.ListingId)
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => new { b.Amount, b.CreatedAt, b.PaymentReference })
            .ToListAsync(ct);

        var bidHistory = bids
            .Select(b => new BidHistoryEntryDto(b.Amount, b.CreatedAt, MaskPaymentReference(b.PaymentReference)))
            .ToList();

        return new ListingDetailDto(
            listing.Id,
            listing.Name,
            listing.Url,
            listing.CategoryName,
            listing.CategorySlug,
            listing.CurrentBidAmount,
            listing.FirstBidAt,
            listing.LastBidAt,
            listing.ClickCount,
            bidHistory);
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
