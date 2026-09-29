using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Ranker.Hubs;
using Ranker.Services.Analytics;

namespace Ranker.Tests.Services;

public class GoogleAnalyticsServiceTests
{
    private readonly GoogleAnalyticsService _service;

    public GoogleAnalyticsServiceTests()
    {
        var inMemorySettings = new Dictionary<string, string?>
        {
            {"GoogleAnalytics:PropertyId", ""},
            {"GoogleAnalytics:CredentialsFilePath", ""},
        };

        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        var services = new ServiceCollection();
        services.AddSingleton(new OnlineUsersTracker());
        var sp = services.BuildServiceProvider();

        _service = new GoogleAnalyticsService(configuration, NullLogger<GoogleAnalyticsService>.Instance, sp);
    }

    [Fact]
    public async Task GetStatusAsync_WhenNotConfigured_ReturnsPreviewMode()
    {
        var status = await _service.GetStatusAsync();

        Assert.False(status.IsConfigured);
        Assert.Contains("Preview", status.Mode);
    }

    [Fact]
    public async Task GetReportAsync_ReturnsValidMetricsAndDimensions()
    {
        var report = await _service.GetReportAsync(30);

        Assert.NotNull(report);
        Assert.Equal(30, report.Days);
        Assert.NotNull(report.Overview);
        Assert.True(report.Overview.ActiveUsers > 0);
        Assert.True(report.Overview.ScreenPageViews > 0);
        Assert.NotEmpty(report.TimeSeries);
        Assert.Equal(30, report.TimeSeries.Count);
        Assert.NotEmpty(report.TrafficSources);
        Assert.NotEmpty(report.DeviceBreakdown);
        Assert.NotEmpty(report.TopPages);
        Assert.NotEmpty(report.Geographics);
        Assert.NotEmpty(report.TopEvents);
    }

    [Fact]
    public async Task GetRealtimeReportAsync_ReturnsActiveUsersAndPages()
    {
        var realtime = await _service.GetRealtimeReportAsync();

        Assert.NotNull(realtime);
        Assert.True(realtime.ActiveUsersLast30Min >= 0);
        Assert.NotEmpty(realtime.TopPages);
    }
}
