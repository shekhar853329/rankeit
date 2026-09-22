namespace Ranker.Domain.Entities;

/// <summary>Immutable audit/history row recorded every time a bid is placed against a listing.</summary>
public class Bid
{
    public int Id { get; set; }

    public int ListingId { get; set; }

    public Listing? Listing { get; set; }

    /// <summary>The listing's new total CurrentBidAmount as of this bid (not necessarily the amount charged - see re-bid difference rules).</summary>
    public decimal Amount { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>Payment gateway transaction ID (Razorpay/Stripe).</summary>
    public required string PaymentReference { get; set; }
}
