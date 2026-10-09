namespace Ranker.Dtos;

// ── Dodo Payments DTOs ────────────────────────────────────────────────────────

public sealed record CreateDodoSessionRequestDto(
    int AmountInMinorUnits,
    string Currency = "USD",
    string? CustomerEmail = null,
    string? CustomerName = null,
    string? ReturnUrl = null,
    string? CancelUrl = null,
    string? ListingName = null,
    string? ListingId = null,
    string? CategoryId = null,
    string? BillingStreet = null,
    string? BillingCity = null,
    string? BillingState = null,
    string? BillingCountry = null,
    string? BillingZipcode = null,
    Dictionary<string, string>? Metadata = null);

public sealed record CreateDodoSessionResponseDto(
    string SessionId,
    string CheckoutUrl);

public sealed record DodoSessionStatusResponseDto(
    string SessionId,
    string? PaymentId,
    string? PaymentStatus,
    bool IsPaid);

public sealed record VerifyDodoPaymentRequestDto(
    string? PaymentId,
    string? SessionId = null);

public sealed record VerifyDodoPaymentResponseDto(
    bool Verified,
    string? PaymentId = null,
    string? Status = null,
    decimal? Amount = null,
    string? Error = null,
    int? ListingId = null,
    decimal? NewClaimAmount = null);

public sealed record PaymentTransactionDto(
    int Id,
    string Action,
    string? TransactionStatus,
    string? PaymentId,
    string? SessionId,
    string? OrderId,
    decimal? Amount,
    string? Currency,
    bool IsSuccess,
    string? ErrorMessage,
    DateTime CreatedAt);
