using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ranker.Domain.Entities;

namespace Ranker.Data.Configurations;

public class DailyVisitCountConfiguration : IEntityTypeConfiguration<DailyVisitCount>
{
    public void Configure(EntityTypeBuilder<DailyVisitCount> builder)
    {
        builder.ToTable("DailyVisitCounts");

        builder.HasKey(v => v.Id);

        builder.Property(v => v.VisitDate).HasColumnType("date");

        builder.HasIndex(v => v.VisitDate).IsUnique();
    }
}
