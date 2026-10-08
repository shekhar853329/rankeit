using MediatR;
using Microsoft.AspNetCore.Mvc;
using Ranker.Application.Claims;
using Ranker.Dtos;

namespace Ranker.Controllers;

[ApiController]
[Route("api/claims")]
public class ClaimsController(ISender sender) : ControllerBase
{
    [HttpPost]
    [Obsolete("Use POST /api/payments/dodo/verify instead. This endpoint is no longer supported.")]
    public IActionResult PlaceClaim([FromBody] PlaceClaimRequestDto request)
    {
        return StatusCode(410, new
        {
            error = "This endpoint is no longer supported.",
            detail = "Use POST /api/payments/dodo/verify to complete a claim after a Dodo Payments checkout."
        });
    }

    [HttpPost("calculate")]
    public async Task<ActionResult<CalculateClaimQuoteResponseDto>> CalculateClaim([FromBody] CalculateClaimQuoteRequestDto request, CancellationToken ct)
    {
        var result = await sender.Send(new CalculateClaimQuoteQuery(
            request.CategoryId,
            request.ListingId,
            request.ListingUrl,
            request.OwnerContactEmail,
            request.TargetClaimAmount,
            request.IsAllTimeMode), ct);

        return Ok(result);
    }
}
