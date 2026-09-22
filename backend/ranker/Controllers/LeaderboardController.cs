using MediatR;
using Microsoft.AspNetCore.Mvc;
using Ranker.Application.Leaderboards;
using Ranker.Dtos;

namespace Ranker.Controllers;

[ApiController]
[Route("api/leaderboard")]
public class LeaderboardController(ISender sender) : ControllerBase
{
    [HttpGet("category/{categorySlug}")]
    public async Task<ActionResult<CategoryLeaderboardResponseDto>> GetCategoryLeaderboard(
        string categorySlug,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        var result = await sender.Send(new GetCategoryLeaderboardQuery(categorySlug, page, pageSize), ct);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("global")]
    public async Task<ActionResult<IReadOnlyList<GlobalLeaderboardEntryDto>>> GetGlobalLeaderboard(
        [FromQuery] int topN = 20,
        CancellationToken ct = default) =>
        Ok(await sender.Send(new GetGlobalLeaderboardQuery(topN), ct));
}
