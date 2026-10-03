namespace Ranker.Domain.Entities;

/// <summary>
/// Audit trail of all interactions with payment gateways (e.g. Razorpay/Stripe), including
/// orders created, signature verification requests, payloads sent/received, and results.
/// </summary>
public class PaymentAuditLog
{
    public int Id { get; set; }

    /// <summary>Action or event type, e.g. "CreateOrder", "VerifyPayment", "PlaceClaim", "Webhook".</summary>
    public required string Action { get; set; }

    public string? Gateway { get; set; } = "Razorpay";

    public string? OrderId { get; set; }

    public string? PaymentId { get; set; }

    public string? PaymentReference { get; set; }

    public long? AmountInPaise { get; set; }

    public decimal? Amount { get; set; }

    public string? Currency { get; set; }

    public string? Receipt { get; set; }

    /// <summary>Full JSON or serialized request payload sent to the gateway or received from client.</summary>
    public string? RequestPayloadJson { get; set; }

    /// <summary>Full JSON or serialized response received from the gateway or generated verification output.</summary>
    public string? ResponsePayloadJson { get; set; }

    public bool IsSuccess { get; set; }

    public string? ErrorMessage { get; set; }

    public string? ClientIp { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
