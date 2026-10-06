namespace Ranker.Services.Payments;

public sealed class DodoPaymentsOptions
{
    public const string SectionName = "DodoPayments";

    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://test.dodopayments.com";
    public string ProductId { get; set; } = "pdt_0Np6FC1kR5kmZxg3RPHFt";
    public string WebhookKey { get; set; } = string.Empty;
    public string Mode { get; set; } = "test";
}
