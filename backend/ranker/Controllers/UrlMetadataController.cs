using Microsoft.AspNetCore.Mvc;
using Ranker.Dtos;
using Ranker.Services.UrlMetadata;

namespace Ranker.Controllers;

[ApiController]
[Route("api/url-metadata")]
public sealed class UrlMetadataController(IUrlMetadataService urlMetadata) : ControllerBase
{
    /// <summary>
    /// Fetches Open-Graph / meta-tag data from the given URL.
    /// Returns an empty result (no error) when the target site is unreachable or blocks crawling.
    /// </summary>
    [HttpGet]
    [ProducesResponseType<UrlMetadataDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Get([FromQuery] string url, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(url))
            return BadRequest("url query parameter is required.");

        var result = await urlMetadata.FetchAsync(url, ct);
        return Ok(result);
    }
}
