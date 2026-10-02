using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Ranker.Services.Seo;

public class IndexNowService(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<IndexNowService> logger) : IIndexNowService
{
    private const string DefaultHost = "rankup.cyou";
    public const string DefaultKey = "e4f509e5bfa74d1aa4548dbbb3f9ef4e";

    public async Task NotifyUrlChangeAsync(IEnumerable<string> urls, CancellationToken ct = default)
    {
        try
        {
            var host = configuration["IndexNow:Host"] ?? DefaultHost;
            var key = configuration["IndexNow:Key"] ?? DefaultKey;
            var keyLocation = $"https://{host}/{key}.txt";

            var urlList = urls
                .Where(u => !string.IsNullOrWhiteSpace(u))
                .Distinct()
                .ToList();

            if (urlList.Count == 0) return;

            var payload = new
            {
                host,
                key,
                keyLocation,
                urlList
            };

            var client = httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);

            var response = await client.PostAsJsonAsync("https://api.indexnow.org/indexnow", payload, ct);
            if (response.IsSuccessStatusCode)
            {
                logger.LogInformation("Successfully submitted {Count} URLs to IndexNow for instant search indexing.", urlList.Count);
            }
            else
            {
                logger.LogWarning("IndexNow ping returned non-success status code {StatusCode}.", response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to send IndexNow ping for search indexing.");
        }
    }
}
