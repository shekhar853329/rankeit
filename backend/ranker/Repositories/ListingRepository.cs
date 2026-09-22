using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Domain.Entities;

namespace Ranker.Repositories;

public class ListingRepository(RankerDbContext dbContext) : IListingRepository
{
    public Task<Listing?> GetByIdAsync(int id, CancellationToken ct = default) =>
        dbContext.Listings.FirstOrDefaultAsync(l => l.Id == id, ct);

    public Task<Listing?> GetTopListingForUpdateAsync(int categoryId, CancellationToken ct = default) =>
        // Plain LINQ read - the caller's Serializable transaction takes the range lock needed to make this
        // safe against concurrent bidders on the same category (no table hints/raw SQL required).
        dbContext.Listings
            .Where(l => l.CategoryId == categoryId)
            .OrderByDescending(l => l.CurrentBidAmount)
            .ThenBy(l => l.FirstBidAt)
            .FirstOrDefaultAsync(ct);

    public void Add(Listing listing) => dbContext.Listings.Add(listing);
}
