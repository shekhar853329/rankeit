namespace Ranker.Domain.Entities;

public class Listing
{
    public int Id { get; set; }

    public int CategoryId { get; set; }

    public Category? Category { get; set; }

    public required string Name { get; set; }

    public required string Url { get; set; }

    public decimal CurrentBidAmount { get; set; }

    /// <summary>Tiebreaker for equal bids: whoever bid first keeps the higher spot.</summary>
    public DateTime FirstBidAt { get; set; }

    public DateTime LastBidAt { get; set; }

    /// <summary>Used to authenticate re-bids/reclaims by the listing owner.</summary>
    public required string OwnerContactEmail { get; set; }

    /// <summary>Optimistic-concurrency guard, layered on top of the pessimistic row lock taken during bid placement.</summary>
    public byte[]? RowVersion { get; set; }

    public ICollection<Bid> Bids { get; set; } = new List<Bid>();
}
