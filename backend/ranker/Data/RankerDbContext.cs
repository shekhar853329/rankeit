using Microsoft.EntityFrameworkCore;
using Ranker.Domain.Entities;

namespace Ranker.Data;

public class RankerDbContext(DbContextOptions<RankerDbContext> options) : DbContext(options)
{
    public DbSet<Category> Categories => Set<Category>();

    public DbSet<Listing> Listings => Set<Listing>();

    public DbSet<Claim> Claims => Set<Claim>();

    public DbSet<ClaimReconciliation> ClaimReconciliations => Set<ClaimReconciliation>();

    public DbSet<DailyVisitCount> DailyVisitCounts => Set<DailyVisitCount>();

    public DbSet<PaymentAuditLog> PaymentAuditLogs => Set<PaymentAuditLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(RankerDbContext).Assembly);
    }
}
