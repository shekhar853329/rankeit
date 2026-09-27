using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ranker.Domain.Entities;

namespace Ranker.Data.Configurations;

public class PaymentAuditLogConfiguration : IEntityTypeConfiguration<PaymentAuditLog>
{
    public void Configure(EntityTypeBuilder<PaymentAuditLog> builder)
    {
        builder.ToTable("PaymentAuditLogs");

        builder.HasKey(l => l.Id);

        builder.Property(l => l.Action).HasMaxLength(100).IsRequired();
        builder.Property(l => l.Gateway).HasMaxLength(50);
        builder.Property(l => l.OrderId).HasMaxLength(150);
        builder.Property(l => l.PaymentId).HasMaxLength(150);
        builder.Property(l => l.PaymentReference).HasMaxLength(200);
        builder.Property(l => l.Currency).HasMaxLength(10);
        builder.Property(l => l.Receipt).HasMaxLength(200);
        builder.Property(l => l.Amount).HasColumnType("decimal(18,2)");
        builder.Property(l => l.ClientIp).HasMaxLength(60);

        builder.HasIndex(l => l.OrderId);
        builder.HasIndex(l => l.PaymentId);
        builder.HasIndex(l => l.CreatedAt);
    }
}
