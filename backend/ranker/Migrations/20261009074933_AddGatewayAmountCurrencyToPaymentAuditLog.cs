using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ranker.Migrations
{
    /// <inheritdoc />
    public partial class AddGatewayAmountCurrencyToPaymentAuditLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "GatewayAmount",
                table: "PaymentAuditLogs",
                type: "numeric(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GatewayCurrency",
                table: "PaymentAuditLogs",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GatewayAmount",
                table: "PaymentAuditLogs");

            migrationBuilder.DropColumn(
                name: "GatewayCurrency",
                table: "PaymentAuditLogs");
        }
    }
}
