using Ranker.Domain.Entities;

namespace Ranker.Repositories;

public interface IListingRepository
{
    Task<Listing?> GetByIdAsync(int id, CancellationToken ct = default);

    /// <summary>
    /// Returns the current #1 listing for the category (highest CurrentBidAmount, earliest FirstBidAt on
    /// ties). Must be called inside a Serializable transaction so concurrent bid attempts against the same
    /// category serialize instead of racing. Returns null if the category has no listings yet.
    /// </summary>
    Task<Listing?> GetTopListingForUpdateAsync(int categoryId, CancellationToken ct = default);

    void Add(Listing listing);
}
