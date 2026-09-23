using Microsoft.EntityFrameworkCore;
using Ranker.Domain.Entities;

namespace Ranker.Data;

public class RankerDbContext(DbContextOptions<RankerDbContext> options) : DbContext(options)
{
    public DbSet<Category> Categories => Set<Category>();

    public DbSet<Listing> Listings => Set<Listing>();

    public DbSet<Bid> Bids => Set<Bid>();

    public DbSet<BidReconciliation> BidReconciliations => Set<BidReconciliation>();

    public DbSet<DailyVisitCount> DailyVisitCounts => Set<DailyVisitCount>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(RankerDbContext).Assembly);
    }
}
