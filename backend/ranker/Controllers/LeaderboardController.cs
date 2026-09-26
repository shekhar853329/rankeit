using MediatR;
using Microsoft.AspNetCore.Mvc;
using Ranker.Application.Bids;
using Ranker.Application.Leaderboards;
using Ranker.Common;
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
        [FromQuery] string timeMode = "today",
        [FromQuery] string? query = null,
        CancellationToken ct = default)
    {
        var result = await sender.Send(new GetCategoryLeaderboardQuery(categorySlug, page, pageSize, timeMode, query), ct);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("global")]
    public async Task<ActionResult<IReadOnlyList<GlobalLeaderboardEntryDto>>> GetGlobalLeaderboard(
        [FromQuery] int topN = 20,
        [FromQuery] string timeMode = "today",
        [FromQuery] string? query = null,
        CancellationToken ct = default) =>
        Ok(await sender.Send(new GetGlobalLeaderboardQuery(topN, timeMode, query), ct));

    [HttpGet("daily")]
    public async Task<ActionResult<PagedResult<DailyListingGroupDto>>> GetDailyListings(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 5,
        CancellationToken ct = default) =>
        Ok(await sender.Send(new GetDailyListingsQuery(page, pageSize), ct));

    [HttpGet("stats")]
    public async Task<ActionResult<PlatformStatsDto>> GetPlatformStats(CancellationToken ct = default) =>
        Ok(await sender.Send(new GetPlatformStatsQuery(), ct));

    [HttpGet("live-stream")]
    public async Task<ActionResult<IReadOnlyList<LiveBidEventDto>>> GetLiveStream(
        [FromQuery] int limit = 10,
        CancellationToken ct = default) =>
        Ok(await sender.Send(new GetRecentBidsQuery(limit), ct));

    [HttpGet("hall-of-fame")]
    public async Task<ActionResult<IReadOnlyList<HallOfFameItemDto>>> GetHallOfFame(
        [FromQuery] int topN = 5,
        CancellationToken ct = default) =>
        Ok(await sender.Send(new GetHallOfFameQuery(topN), ct));
}
