using MediatR;
using Microsoft.AspNetCore.Mvc;
using Ranker.Application.Categories;
using Ranker.Common;
using Ranker.Dtos;

namespace Ranker.Controllers;

[ApiController]
[Route("api/categories")]
public class CategoriesController(ISender sender) : ControllerBase
{
    [HttpGet("tree")]
    public async Task<ActionResult<IReadOnlyList<CategoryTreeNodeDto>>> GetTree(CancellationToken ct) =>
        Ok(await sender.Send(new GetCategoryTreeQuery(), ct));

    [HttpGet]
    public async Task<ActionResult<PagedResult<CategoryDto>>> GetCategories(
        [FromQuery] string? parentSlug,
        [FromQuery] CategorySortBy sortBy = CategorySortBy.Trending,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default) =>
        Ok(await sender.Send(new GetCategoriesQuery(parentSlug, sortBy, page, pageSize), ct));
}
