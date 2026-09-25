using MediatR;
using Microsoft.AspNetCore.Mvc;
using Ranker.Application.Bids;
using Ranker.Dtos;

namespace Ranker.Controllers;

[ApiController]
[Route("api/bids")]
public class BidsController(ISender sender) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<PlaceBidResultDto>> PlaceBid([FromBody] PlaceBidRequestDto request, CancellationToken ct)
    {
        var result = await sender.Send(new PlaceBidCommand(
            request.CategoryId,
            request.ListingId,
            request.ListingName,
            request.ListingUrl,
            request.OwnerContactEmail,
            request.TargetBidAmount,
            request.PaymentReference,
            request.ConfirmedPaymentAmount,
            request.SiteName,
            request.LogoUrl,
            request.Description,
            request.FaviconUrl), ct);

        return result.Success ? Ok(result) : BadRequest(result);
    }
}
