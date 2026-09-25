using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ranker.Migrations
{
    /// <inheritdoc />
    public partial class AddCategoryIcon : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Icon",
                table: "Categories",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.Sql(@"
                UPDATE Categories SET Icon = N'🤖' WHERE Slug = 'ai-agents-infrastructure';
                UPDATE Categories SET Icon = N'📈' WHERE Slug = 'seo-ai-visibility';
                UPDATE Categories SET Icon = N'📣' WHERE Slug = 'marketing-advertising';
                UPDATE Categories SET Icon = N'⚡' WHERE Slug = 'developer-tools';
                UPDATE Categories SET Icon = N'🎯' WHERE Slug = 'productivity';
                UPDATE Categories SET Icon = N'🛒' WHERE Slug = 'ecommerce-tools';
                UPDATE Categories SET Icon = N'🪙' WHERE Slug = 'crypto-web3';
                UPDATE Categories SET Icon = N'🏠' WHERE Slug = 'real-estate';
                UPDATE Categories SET Icon = N'⚖️' WHERE Slug = 'legal-services';
                UPDATE Categories SET Icon = N'💳' WHERE Slug = 'finance-investing';
                UPDATE Categories SET Icon = N'💼' WHERE Slug = 'freelancers';
                UPDATE Categories SET Icon = N'🎮' WHERE Slug = 'games-entertainment';
                UPDATE Categories SET Icon = N'🎵' WHERE Slug = 'music';
                UPDATE Categories SET Icon = N'🍽️' WHERE Slug = 'food-beverage';
                UPDATE Categories SET Icon = N'👗' WHERE Slug = 'fashion';
                UPDATE Categories SET Icon = N'🐾' WHERE Slug = 'pet-care';
                UPDATE Categories SET Icon = N'✈️' WHERE Slug = 'travel';
                UPDATE Categories SET Icon = N'⚽' WHERE Slug = 'sports';
                UPDATE Categories SET Icon = N'🛠️' WHERE Slug = 'home-services';
                UPDATE Categories SET Icon = N'🚗' WHERE Slug = 'automotive';
                UPDATE Categories SET Icon = N'📚' WHERE Slug = 'education';
                UPDATE Categories SET Icon = N'💪' WHERE Slug = 'health-fitness';
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Icon",
                table: "Categories");
        }
    }
}
