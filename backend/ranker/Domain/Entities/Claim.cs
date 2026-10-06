namespace Ranker.Domain.Entities;

/// <summary>Immutable audit/history row recorded every time a claim is placed against a listing.</summary>
public class Claim
{
    public int Id { get; set; }

    public int ListingId { get; set; }

    public Listing? Listing { get; set; }

    /// <summary>The listing's new total CurrentClaimAmount as of this claim.</summary>
    public decimal Amount { get; set; }

    /// <summary>The actual cash amount paid/charged for this specific transaction.</summary>
    public decimal PaymentAmount { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>Payment gateway transaction ID (DodoPayments).</summary>
    public required string PaymentReference { get; set; }
}
