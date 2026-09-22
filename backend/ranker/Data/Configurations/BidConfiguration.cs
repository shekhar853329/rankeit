using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ranker.Domain.Entities;

namespace Ranker.Data.Configurations;

public class BidConfiguration : IEntityTypeConfiguration<Bid>
{
    public void Configure(EntityTypeBuilder<Bid> builder)
    {
        builder.ToTable("Bids");

        builder.HasKey(b => b.Id);

        builder.Property(b => b.Amount).HasColumnType("decimal(18,2)");

        builder.Property(b => b.PaymentReference).HasMaxLength(200).IsRequired();

        builder.HasOne(b => b.Listing)
            .WithMany(l => l.Bids)
            .HasForeignKey(b => b.ListingId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(b => new { b.ListingId, b.CreatedAt });
    }
}
