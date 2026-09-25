using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ranker.Domain.Entities;

namespace Ranker.Data.Configurations;

public class ListingConfiguration : IEntityTypeConfiguration<Listing>
{
    public void Configure(EntityTypeBuilder<Listing> builder)
    {
        builder.ToTable("Listings");

        builder.HasKey(l => l.Id);

        builder.Property(l => l.Name).HasMaxLength(300).IsRequired();
        builder.Property(l => l.Url).HasMaxLength(2048).IsRequired();
        builder.Property(l => l.OwnerContactEmail).HasMaxLength(320).IsRequired();

        builder.Property(l => l.SiteName).HasMaxLength(300);
        builder.Property(l => l.LogoUrl).HasMaxLength(2048);
        builder.Property(l => l.Description).HasMaxLength(1000);
        builder.Property(l => l.FaviconUrl).HasMaxLength(2048);

        builder.Property(l => l.CurrentBidAmount).HasColumnType("decimal(18,2)");

        builder.Property(l => l.ClickCount).HasDefaultValue(0);

        builder.Property(l => l.RowVersion).IsRowVersion();

        builder.HasOne(l => l.Category)
            .WithMany(c => c.Listings)
            .HasForeignKey(l => l.CategoryId)
            .OnDelete(DeleteBehavior.Cascade);

        // Backs the ROW_NUMBER() OVER (PARTITION BY CategoryId ORDER BY CurrentBidAmount DESC, FirstBidAt ASC)
        // leaderboard query.
        builder.HasIndex(l => new { l.CategoryId, l.CurrentBidAmount, l.FirstBidAt });
    }
}
