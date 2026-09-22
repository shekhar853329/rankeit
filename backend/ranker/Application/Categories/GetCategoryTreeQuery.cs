using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Categories;

/// <summary>Full category tree nested by ParentCategoryId (rule E1).</summary>
public sealed record GetCategoryTreeQuery : IRequest<IReadOnlyList<CategoryTreeNodeDto>>;
