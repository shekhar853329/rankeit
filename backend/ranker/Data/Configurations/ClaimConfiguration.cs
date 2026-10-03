using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ranker.Domain.Entities;

namespace Ranker.Data.Configurations;

public class ClaimConfiguration : IEntityTypeConfiguration<Claim>
{
    public void Configure(EntityTypeBuilder<Claim> builder)
    {
        builder.ToTable("Claims");

        builder.HasKey(b => b.Id);

        builder.Property(b => b.Amount).HasColumnType("numeric(18,2)");
        builder.Property(b => b.PaymentAmount).HasColumnType("numeric(18,2)").HasDefaultValue(0m);
        builder.Property(b => b.PaymentReference).HasMaxLength(200).IsRequired();

        builder.HasOne(b => b.Listing)
            .WithMany(l => l.Claims)
            .HasForeignKey(b => b.ListingId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(b => new { b.ListingId, b.CreatedAt });
    }
}
