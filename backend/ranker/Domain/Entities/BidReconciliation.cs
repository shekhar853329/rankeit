namespace Ranker.Domain.Entities;

/// <summary>
/// Audit trail for bids that were rejected after payment had already been confirmed by the gateway
/// (typically the losing side of a race for a category's #1 spot). Ops reviews these to issue refunds.
/// </summary>
public class BidReconciliation
{
    public int Id { get; set; }

    public int CategoryId { get; set; }

    public int? ListingId { get; set; }

    public decimal AttemptedTargetAmount { get; set; }

    public decimal ExpectedChargeAmount { get; set; }

    public decimal ConfirmedPaymentAmount { get; set; }

    public required string PaymentReference { get; set; }

    public required string Reason { get; set; }

    public DateTime CreatedAt { get; set; }

    public bool Resolved { get; set; }
}
