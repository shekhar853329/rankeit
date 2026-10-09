using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Ranker.Services.Payments;

public record DodoPaymentDetails(
    string PaymentId,
    string Status,
    long TotalAmount,
    string Currency,
    string? CustomerEmail,
    string? CustomerName,
    Dictionary<string, string> Metadata);

public interface IDodoPaymentsService
{
    Task<(string SessionId, string CheckoutUrl)> CreateCheckoutSessionAsync(
        int amountInMinorUnits,
        string currency,
        string? customerEmail,
        string? customerName,
        string? returnUrl,
        string? cancelUrl = null,
        Dictionary<string, string>? metadata = null,
        string? billingStreet = null,
        string? billingCity = null,
        string? billingState = null,
        string? billingCountry = null,
        string? billingZipcode = null,
        CancellationToken ct = default);

    Task<(string SessionId, string? PaymentId, string? PaymentStatus, bool IsPaid)> GetSessionStatusAsync(
        string sessionId,
        CancellationToken ct = default);

    Task<DodoPaymentDetails?> GetPaymentAsync(
        string paymentId,
        CancellationToken ct = default);
}

public class DodoPaymentsService : IDodoPaymentsService
{
    private readonly HttpClient _httpClient;
    private readonly DodoPaymentsOptions _options;
    private readonly ILogger<DodoPaymentsService> _logger;

    public DodoPaymentsService(
        IOptions<DodoPaymentsOptions> options,
        ILogger<DodoPaymentsService> logger,
        IHttpClientFactory? httpClientFactory = null)
    {
        _options = options.Value;
        _logger = logger;
        _httpClient = httpClientFactory?.CreateClient("DodoPayments") ?? new HttpClient();
        _httpClient.BaseAddress = new Uri(_options.BaseUrl.TrimEnd('/') + "/");
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey);
    }

    public async Task<(string SessionId, string CheckoutUrl)> CreateCheckoutSessionAsync(
        int amountInMinorUnits,
        string currency,
        string? customerEmail,
        string? customerName,
        string? returnUrl,
        string? cancelUrl = null,
        Dictionary<string, string>? metadata = null,
        string? billingStreet = null,
        string? billingCity = null,
        string? billingState = null,
        string? billingCountry = null,
        string? billingZipcode = null,
        CancellationToken ct = default)
    {
        _logger.LogInformation("Creating Dodo checkout session for {CustomerEmail}, amount {Amount} {Currency}",
            customerEmail, amountInMinorUnits, currency);

        // Only include billing_address when the caller explicitly provides address data.
        // Sending pre-filled address fields to Dodo locks them as read-only on the checkout form,
        // preventing the customer from editing their contact and billing information.
        bool hasBillingAddress = !string.IsNullOrWhiteSpace(billingCountry)
            || !string.IsNullOrWhiteSpace(billingZipcode)
            || !string.IsNullOrWhiteSpace(billingStreet)
            || !string.IsNullOrWhiteSpace(billingCity)
            || !string.IsNullOrWhiteSpace(billingState);

        object? billingAddressPayload = hasBillingAddress
            ? new
            {
                country = billingCountry,
                city = billingCity,
                state = billingState,
                street = billingStreet,
                zipcode = billingZipcode
            }
            : null;

        var payload = new
        {
            product_cart = new[]
            {
                new
                {
                    product_id = _options.ProductId,
                    quantity = 1,
                    amount = amountInMinorUnits
                }
            },
            billing_currency = string.IsNullOrWhiteSpace(currency) ? "USD" : currency,
            return_url = returnUrl,
            cancel_url = cancelUrl,
            customer = !string.IsNullOrWhiteSpace(customerEmail)
                ? new
                {
                    email = customerEmail,
                    name = customerName ?? customerEmail
                }
                : null,
            minimal_address = true,
            billing_address = billingAddressPayload,
            customization = new
            {
                theme = "dark"
            },
            metadata = metadata
        };

        var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        });

        using var request = new HttpRequestMessage(HttpMethod.Post, "checkouts")
        {
            Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
        };

        var response = await _httpClient.SendAsync(request, ct);
        var responseContent = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Dodo create session failed with status {StatusCode}: {Response}",
                response.StatusCode, responseContent);
            throw new InvalidOperationException($"Dodo API error ({response.StatusCode}): {responseContent}");
        }

        using var doc = JsonDocument.Parse(responseContent);
        var root = doc.RootElement;
        var sessionId = root.GetProperty("session_id").GetString() ?? string.Empty;
        var checkoutUrl = root.GetProperty("checkout_url").GetString() ?? string.Empty;

        _logger.LogInformation("Dodo checkout session created: SessionID={SessionId}, CheckoutUrl={CheckoutUrl}",
            sessionId, checkoutUrl);

        return (sessionId, checkoutUrl);
    }

    public async Task<(string SessionId, string? PaymentId, string? PaymentStatus, bool IsPaid)> GetSessionStatusAsync(
        string sessionId,
        CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync($"checkouts/{Uri.EscapeDataString(sessionId)}", ct);
        var responseContent = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Dodo get status failed for session {SessionId}: {StatusCode} {Response}",
                sessionId, response.StatusCode, responseContent);
            throw new InvalidOperationException($"Dodo API error ({response.StatusCode}): {responseContent}");
        }

        using var doc = JsonDocument.Parse(responseContent);
        var root = doc.RootElement;
        var id = root.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? sessionId : sessionId;
        var paymentId = root.TryGetProperty("payment_id", out var pidProp) && pidProp.ValueKind == JsonValueKind.String
            ? pidProp.GetString()
            : null;
        var paymentStatus = root.TryGetProperty("payment_status", out var psProp) && psProp.ValueKind == JsonValueKind.String
            ? psProp.GetString()
            : null;

        bool isPaid = string.Equals(paymentStatus, "succeeded", StringComparison.OrdinalIgnoreCase);

        return (id, paymentId, paymentStatus, isPaid);
    }

    public async Task<DodoPaymentDetails?> GetPaymentAsync(
        string paymentId,
        CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync($"payments/{Uri.EscapeDataString(paymentId)}", ct);
        var responseContent = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Dodo get payment failed for {PaymentId}: {StatusCode} {Response}",
                paymentId, response.StatusCode, responseContent);
            return null;
        }

        using var doc = JsonDocument.Parse(responseContent);
        var root = doc.RootElement;

        var id = root.TryGetProperty("payment_id", out var pidProp) ? pidProp.GetString() ?? paymentId : paymentId;
        var status = root.TryGetProperty("status", out var stProp) ? stProp.GetString() ?? "" : "";
        var amount = root.TryGetProperty("total_amount", out var amtProp) && amtProp.TryGetInt64(out var a) ? a : 0L;
        var currency = root.TryGetProperty("currency", out var curProp) ? curProp.GetString() ?? "USD" : "USD";

        string? customerEmail = null;
        string? customerName = null;
        if (root.TryGetProperty("customer", out var custProp) && custProp.ValueKind == JsonValueKind.Object)
        {
            if (custProp.TryGetProperty("email", out var eProp)) customerEmail = eProp.GetString();
            if (custProp.TryGetProperty("name", out var nProp)) customerName = nProp.GetString();
        }

        var metadata = new Dictionary<string, string>();
        if (root.TryGetProperty("metadata", out var metaProp) && metaProp.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in metaProp.EnumerateObject())
            {
                metadata[prop.Name] = prop.Value.GetString() ?? prop.Value.ToString();
            }
        }

        return new DodoPaymentDetails(id, status, amount, currency, customerEmail, customerName, metadata);
    }
}
