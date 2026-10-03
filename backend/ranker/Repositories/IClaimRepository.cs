using Ranker.Domain.Entities;

namespace Ranker.Repositories;

public interface IClaimRepository
{
    void Add(Claim claim);
}
