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
    public async Task<ActionResult<PlaceClaimResultDto>> PlaceClaim([FromBody] PlaceClaimRequestDto request, CancellationToken ct)
    {
        var result = await sender.Send(new PlaceClaimCommand(
            request.CategoryId,
            request.ListingId,
            request.ListingName,
            request.ListingUrl,
            request.OwnerContactEmail,
            request.TargetClaimAmount,
            request.PaymentReference,
            request.ConfirmedPaymentAmount,
            request.SiteName,
            request.LogoUrl,
            request.Description,
            request.FaviconUrl,
            request.IsAllTimeMode), ct);

        return result.Success ? Ok(result) : BadRequest(result);
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
