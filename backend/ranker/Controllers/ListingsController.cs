using MediatR;
using Microsoft.AspNetCore.Mvc;
using Ranker.Application.Listings;
using Ranker.Dtos;

namespace Ranker.Controllers;

[ApiController]
[Route("api/listings")]
public class ListingsController(ISender sender) : ControllerBase
{
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ListingDetailDto>> GetListingDetail(int id, CancellationToken ct)
    {
        var result = await sender.Send(new GetListingDetailQuery(id), ct);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("lookup")]
    public async Task<ActionResult<ListingLookupResultDto>> LookupListing([FromQuery] int categoryId, [FromQuery] string url, CancellationToken ct)
    {
        var result = await sender.Send(new LookupListingQuery(categoryId, url), ct);
        return Ok(result);
    }

    [HttpPost("{id:int}/click")]
    public async Task<ActionResult<int>> RecordClick(int id, CancellationToken ct)
    {
        var count = await sender.Send(new RecordListingClickCommand(id), ct);
        return count is null ? NotFound() : Ok(count);
    }
}
