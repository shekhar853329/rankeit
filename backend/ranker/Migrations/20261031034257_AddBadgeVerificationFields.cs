using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ranker.Migrations
{
    /// <inheritdoc />
    public partial class AddBadgeVerificationFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "BadgeLastCheckedAt",
                table: "Listings",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "BadgeVerified",
                table: "Listings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "BadgeVerifiedAt",
                table: "Listings",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BadgeLastCheckedAt",
                table: "Listings");

            migrationBuilder.DropColumn(
                name: "BadgeVerified",
                table: "Listings");

            migrationBuilder.DropColumn(
                name: "BadgeVerifiedAt",
                table: "Listings");
        }
    }
}
