using Ranker.Dtos;

namespace Ranker.Services.Analytics;

public interface IGoogleAnalyticsService
{
    Task<GoogleAnalyticsReportDto> GetReportAsync(int days, CancellationToken ct = default);
    Task<GaRealtimeReportDto> GetRealtimeReportAsync(CancellationToken ct = default);
    Task<GaConfigStatusDto> GetStatusAsync(CancellationToken ct = default);
}
