using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ranker.Migrations
{
    /// <inheritdoc />
    public partial class AddListingMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Listings",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FaviconUrl",
                table: "Listings",
                type: "nvarchar(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LogoUrl",
                table: "Listings",
                type: "nvarchar(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SiteName",
                table: "Listings",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Description",
                table: "Listings");

            migrationBuilder.DropColumn(
                name: "FaviconUrl",
                table: "Listings");

            migrationBuilder.DropColumn(
                name: "LogoUrl",
                table: "Listings");

            migrationBuilder.DropColumn(
                name: "SiteName",
                table: "Listings");
        }
    }
}
