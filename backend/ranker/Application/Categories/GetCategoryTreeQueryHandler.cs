using MediatR;
using Ranker.Domain.Entities;
using Ranker.Dtos;
using Ranker.Repositories;

namespace Ranker.Application.Categories;

public class GetCategoryTreeQueryHandler(ICategoryRepository categoryRepository)
    : IRequestHandler<GetCategoryTreeQuery, IReadOnlyList<CategoryTreeNodeDto>>
{
    public async Task<IReadOnlyList<CategoryTreeNodeDto>> Handle(GetCategoryTreeQuery request, CancellationToken ct)
    {
        var categories = await categoryRepository.GetAllAsync(ct);
        var byParent = categories.ToLookup(c => c.ParentCategoryId);

        return Build(null, byParent);
    }

    private static List<CategoryTreeNodeDto> Build(int? parentId, ILookup<int?, Category> byParent) =>
        byParent[parentId]
            .OrderBy(c => c.Name)
            .Select(c => new CategoryTreeNodeDto(c.Id, c.Name, c.Slug, Build(c.Id, byParent)))
            .ToList();
}
