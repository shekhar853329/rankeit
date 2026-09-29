using MediatR;
using Microsoft.AspNetCore.Mvc;
using Ranker.Application.Analytics;
using Ranker.Dtos;
using Ranker.Services.Analytics;

namespace Ranker.Controllers;

[ApiController]
[Route("api/analytics")]
public class AnalyticsController(ISender sender, IGoogleAnalyticsService gaService) : ControllerBase
{
    [HttpPost("visits/track")]
    public async Task<ActionResult<SiteVisitsTodayDto>> TrackVisit(CancellationToken ct)
    {
        var visitsToday = await sender.Send(new IncrementSiteVisitCountCommand(), ct);
        return Ok(new SiteVisitsTodayDto(visitsToday));
    }

    [HttpGet("ga/overview")]
    public async Task<ActionResult<GoogleAnalyticsReportDto>> GetGaOverview([FromQuery] int days = 30, CancellationToken ct = default)
    {
        var report = await gaService.GetReportAsync(days, ct);
        return Ok(report);
    }

    [HttpGet("ga/realtime")]
    public async Task<ActionResult<GaRealtimeReportDto>> GetGaRealtime(CancellationToken ct = default)
    {
        var realtime = await gaService.GetRealtimeReportAsync(ct);
        return Ok(realtime);
    }

    [HttpGet("ga/status")]
    public async Task<ActionResult<GaConfigStatusDto>> GetGaStatus(CancellationToken ct = default)
    {
        var status = await gaService.GetStatusAsync(ct);
        return Ok(status);
    }
}
