using MediatR;
using Microsoft.AspNetCore.Mvc;
using Ranker.Application.Analytics;
using Ranker.Dtos;

namespace Ranker.Controllers;

[ApiController]
[Route("api/analytics")]
public class AnalyticsController(ISender sender) : ControllerBase
{
    [HttpPost("visits/track")]
    public async Task<ActionResult<SiteVisitsTodayDto>> TrackVisit(CancellationToken ct)
    {
        var visitsToday = await sender.Send(new IncrementSiteVisitCountCommand(), ct);
        return Ok(new SiteVisitsTodayDto(visitsToday));
    }
}
