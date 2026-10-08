using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ranker.Migrations
{
    /// <inheritdoc />
    public partial class AddTransactionStatusToPaymentAuditLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CustomerEmail",
                table: "PaymentAuditLogs",
                type: "character varying(254)",
                maxLength: 254,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SessionId",
                table: "PaymentAuditLogs",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TransactionStatus",
                table: "PaymentAuditLogs",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAuditLogs_CustomerEmail",
                table: "PaymentAuditLogs",
                column: "CustomerEmail");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAuditLogs_SessionId",
                table: "PaymentAuditLogs",
                column: "SessionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PaymentAuditLogs_CustomerEmail",
                table: "PaymentAuditLogs");

            migrationBuilder.DropIndex(
                name: "IX_PaymentAuditLogs_SessionId",
                table: "PaymentAuditLogs");

            migrationBuilder.DropColumn(
                name: "CustomerEmail",
                table: "PaymentAuditLogs");

            migrationBuilder.DropColumn(
                name: "SessionId",
                table: "PaymentAuditLogs");

            migrationBuilder.DropColumn(
                name: "TransactionStatus",
                table: "PaymentAuditLogs");
        }
    }
}
