using Ranker.Domain.Entities;

namespace Ranker.Repositories;

public interface ICategoryRepository
{
    Task<Category?> GetByIdAsync(int id, CancellationToken ct = default);

    Task<Category?> GetBySlugAsync(string slug, CancellationToken ct = default);

    Task<List<Category>> GetAllAsync(CancellationToken ct = default);
}
