using Ranker.Data;
using Ranker.Domain.Entities;

namespace Ranker.Repositories;

public class BidRepository(RankerDbContext dbContext) : IBidRepository
{
    public void Add(Bid bid) => dbContext.Bids.Add(bid);
}
