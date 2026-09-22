using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Domain.Entities;

namespace Ranker.Repositories;

public class CategoryRepository(RankerDbContext dbContext) : ICategoryRepository
{
    public Task<Category?> GetByIdAsync(int id, CancellationToken ct = default) =>
        dbContext.Categories.FirstOrDefaultAsync(c => c.Id == id, ct);

    public Task<Category?> GetBySlugAsync(string slug, CancellationToken ct = default) =>
        dbContext.Categories.FirstOrDefaultAsync(c => c.Slug == slug, ct);

    public Task<List<Category>> GetAllAsync(CancellationToken ct = default) =>
        dbContext.Categories.AsNoTracking().ToListAsync(ct);
}
