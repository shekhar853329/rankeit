namespace Ranker.Dtos;

// ── Create Order ──────────────────────────────────────────────────────────

/// <summary>Amount is in paise (INR × 100). Minimum 100 paise (₹1).</summary>
public sealed record CreateRazorpayOrderRequestDto(
    long AmountInPaise,
    string Currency = "INR",
    string? Receipt = null);

public sealed record CreateRazorpayOrderResponseDto(
    string OrderId,
    long Amount,
    string Currency);

// ── Verify Payment ────────────────────────────────────────────────────────

public sealed record VerifyRazorpayPaymentRequestDto(
    string RazorpayOrderId,
    string RazorpayPaymentId,
    string RazorpaySignature);

public sealed record VerifyRazorpayPaymentResponseDto(
    bool Verified,
    string? Error = null);
