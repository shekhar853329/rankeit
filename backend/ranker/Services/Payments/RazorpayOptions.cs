namespace Ranker.Services.Payments;

public sealed class RazorpayOptions
{
    public const string SectionName = "Razorpay";

    public string KeyId { get; init; } = string.Empty;
    public string KeySecret { get; init; } = string.Empty;
}
