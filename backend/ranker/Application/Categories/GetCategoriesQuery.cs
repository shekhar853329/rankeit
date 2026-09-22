using MediatR;
using Ranker.Common;
using Ranker.Dtos;

namespace Ranker.Application.Categories;

/// <summary>
/// Paginated, filterable category directory (rule E3) - never render all 100+ categories unfiltered.
/// ParentSlug null means "top-level categories".
/// </summary>
public sealed record GetCategoriesQuery(string? ParentSlug, CategorySortBy SortBy, int Page, int PageSize)
    : IRequest<PagedResult<CategoryDto>>;
