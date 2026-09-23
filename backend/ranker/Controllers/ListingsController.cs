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
}
