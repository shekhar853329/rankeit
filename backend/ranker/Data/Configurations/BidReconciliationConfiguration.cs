using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ranker.Domain.Entities;

namespace Ranker.Data.Configurations;

public class BidReconciliationConfiguration : IEntityTypeConfiguration<BidReconciliation>
{
    public void Configure(EntityTypeBuilder<BidReconciliation> builder)
    {
        builder.ToTable("BidReconciliations");

        builder.HasKey(r => r.Id);

        builder.Property(r => r.AttemptedTargetAmount).HasColumnType("decimal(18,2)");
        builder.Property(r => r.ExpectedChargeAmount).HasColumnType("decimal(18,2)");
        builder.Property(r => r.ConfirmedPaymentAmount).HasColumnType("decimal(18,2)");

        builder.Property(r => r.PaymentReference).HasMaxLength(200).IsRequired();
        builder.Property(r => r.Reason).HasMaxLength(500).IsRequired();
    }
}
