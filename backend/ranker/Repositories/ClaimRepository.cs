using Ranker.Data;
using Ranker.Domain.Entities;

namespace Ranker.Repositories;

public class ClaimRepository(RankerDbContext dbContext) : IClaimRepository
{
    public void Add(Claim claim) => dbContext.Claims.Add(claim);
}
