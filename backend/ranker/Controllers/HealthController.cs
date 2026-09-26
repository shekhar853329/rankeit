using Microsoft.AspNetCore.Mvc;
using Ranker.Data;
using Ranker.Dtos;

namespace Ranker.Controllers;

[ApiController]
[Route("api/health")]
[Route("health")]
public class HealthController(RankerDbContext dbContext) : ControllerBase
{
    private static readonly DateTime StartTimeUtc = DateTime.UtcNow;

    [HttpGet]
    public async Task<ActionResult<HealthStatusDto>> GetHealth(CancellationToken ct)
    {
        var dbReachable = false;
        try
        {
            dbReachable = await dbContext.Database.CanConnectAsync(ct);
        }
        catch
        {
            dbReachable = false;
        }

        var status = dbReachable ? "Healthy" : "Degraded";
        var uptimeSpan = DateTime.UtcNow - StartTimeUtc;
        var uptime = $"{(int)uptimeSpan.TotalHours:D2}h {uptimeSpan.Minutes:D2}m {uptimeSpan.Seconds:D2}s";

        var response = new HealthStatusDto(
            Status: status,
            Database: dbReachable ? "Connected" : "Disconnected",
            Timestamp: DateTime.UtcNow,
            Uptime: uptime,
            Version: "1.0.0"
        );

        return Ok(response);
    }

    [HttpHead]
    public IActionResult CheckHead() => Ok();
}
