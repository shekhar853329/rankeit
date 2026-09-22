using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ranker.Domain.Entities;

namespace Ranker.Data.Configurations;

public class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.ToTable("Categories");

        builder.HasKey(c => c.Id);

        builder.Property(c => c.Name)
            .HasMaxLength(200)
            .IsRequired();

        builder.Property(c => c.Slug)
            .HasMaxLength(200)
            .IsRequired();

        builder.HasIndex(c => c.Slug).IsUnique();

        builder.Property(c => c.MinBidIncrement).HasColumnType("decimal(18,2)");
        builder.Property(c => c.MinStartingBid).HasColumnType("decimal(18,2)");

        builder.HasOne(c => c.ParentCategory)
            .WithMany(c => c.ChildCategories)
            .HasForeignKey(c => c.ParentCategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(c => c.ParentCategoryId);
    }
}
