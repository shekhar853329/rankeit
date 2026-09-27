using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ranker.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentAmountAndAuditLogs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "PaymentAmount",
                table: "Bids",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.Sql(@"
;WITH NumberedBids AS (
    SELECT Id, ListingId, Amount, CreatedAt,
           LAG(Amount, 1, 0.0) OVER (PARTITION BY ListingId ORDER BY CreatedAt ASC) AS PrevAmount
    FROM Bids
)
UPDATE b
SET b.PaymentAmount = nb.Amount - nb.PrevAmount
FROM Bids b
INNER JOIN NumberedBids nb ON b.Id = nb.Id;
");

            migrationBuilder.CreateTable(
                name: "PaymentAuditLogs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Action = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Gateway = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    OrderId = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: true),
                    PaymentId = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: true),
                    PaymentReference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    AmountInPaise = table.Column<long>(type: "bigint", nullable: true),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    Currency = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: true),
                    Receipt = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    RequestPayloadJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ResponsePayloadJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsSuccess = table.Column<bool>(type: "bit", nullable: false),
                    ErrorMessage = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ClientIp = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentAuditLogs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAuditLogs_CreatedAt",
                table: "PaymentAuditLogs",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAuditLogs_OrderId",
                table: "PaymentAuditLogs",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAuditLogs_PaymentId",
                table: "PaymentAuditLogs",
                column: "PaymentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaymentAuditLogs");

            migrationBuilder.DropColumn(
                name: "PaymentAmount",
                table: "Bids");
        }
    }
}
