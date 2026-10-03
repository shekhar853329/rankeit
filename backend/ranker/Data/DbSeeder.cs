using Microsoft.EntityFrameworkCore;
using Ranker.Domain.Entities;

namespace Ranker.Data;

/// <summary>Idempotent seed helpers. Both <see cref="SeedCategoriesAsync"/> and <see cref="SeedAsync"/>
/// seed only category reference data and are safe to run in any environment.</summary>
public static class DbSeeder
{
    private sealed record CategorySeed(string Name, string Slug, string Icon, decimal MinStartingClaim, decimal MinClaimIncrement, int BaseDaysAgo);

    private static readonly CategorySeed[] CategorySeeds =
    [
        new("Agriculture", "agriculture", "🌾", 1m, 1m, 54),
        new("AI Agents & Infrastructure", "ai-agents-infrastructure", "🤖", 1m, 1m, 1),
        new("Automotive", "automotive", "🚗", 1m, 1m, 16),
        new("Blogs & Personal Websites", "blogs-personal", "✍️", 1m, 1m, 50),
        new("Books & Literature", "books-literature", "📖", 1m, 1m, 49),
        new("Business & Consulting", "business-consulting", "💼", 1m, 1m, 23),
        new("Career & Jobs", "career-jobs", "👔", 1m, 1m, 24),
        new("Cloud & Hosting", "cloud-hosting", "☁️", 1m, 1m, 26),
        new("Communication", "communication", "💬", 1m, 1m, 27),
        new("Construction", "construction", "🏗️", 1m, 1m, 52),
        new("Crypto & Web3", "crypto-web3", "🪙", 1m, 1m, 2),
        new("Cybersecurity", "cybersecurity", "🔐", 1m, 1m, 28),
        new("Design & Creative", "design-creative", "🎨", 1m, 1m, 29),
        new("Developer Tools", "developer-tools", "⚡", 1m, 1m, 4),
        new("Digital Products", "digital-products", "📦", 1m, 1m, 30),
        new("E-commerce Tools", "ecommerce-tools", "🛒", 1m, 1m, 6),
        new("Education", "education", "📚", 1m, 1m, 11),
        new("Energy & Utilities", "energy-utilities", "⚡", 1m, 1m, 55),
        new("Entertainment", "entertainment", "🎬", 1m, 1m, 31),
        new("Events & Conferences", "events-conferences", "🎟️", 1m, 1m, 32),
        new("Fashion", "fashion", "👗", 1m, 1m, 12),
        new("Finance & Investing", "finance-investing", "💳", 1m, 1m, 15),
        new("Food & Beverage", "food-beverage", "🍽️", 1m, 1m, 18),
        new("Freelancers", "freelancers", "💼", 1m, 1m, 5),
        new("Games & Entertainment", "games-entertainment", "🎮", 1m, 1m, 1),
        new("Government & Public Services", "government-public-services", "🏛️", 1m, 1m, 33),
        new("Health & Fitness", "health-fitness", "💪", 1m, 1m, 7),
        new("Home Services", "home-services", "🛠️", 1m, 1m, 9),
        new("Insurance", "insurance", "🛡️", 1m, 1m, 34),
        new("Legal Services", "legal-services", "⚖️", 1m, 1m, 20),
        new("Manufacturing", "manufacturing", "🏭", 1m, 1m, 53),
        new("Marketing & Advertising", "marketing-advertising", "📣", 1m, 1m, 3),
        new("Music", "music", "🎵", 1m, 1m, 25),
        new("News & Media", "news-media", "📰", 1m, 1m, 35),
        new("Nonprofits & Charity", "nonprofits-charity", "❤️", 1m, 1m, 36),
        new("Online Communities", "online-communities", "👥", 1m, 1m, 37),
        new("Pet Care", "pet-care", "🐾", 1m, 1m, 22),
        new("Photography", "photography", "📷", 1m, 1m, 48),
        new("Professional Services", "professional-services", "🧑‍💼", 1m, 1m, 38),
        new("Productivity", "productivity", "🎯", 1m, 1m, 5),
        new("Real Estate", "real-estate", "🏠", 1m, 1m, 10),
        new("Real Estate & Property", "real-estate-property", "🏢", 1m, 1m, 39),
        new("Restaurants & Dining", "restaurants-dining", "🍴", 1m, 1m, 40),
        new("Retail & Shopping", "retail-shopping", "🛍️", 1m, 1m, 41),
        new("Science & Research", "science-research", "🔬", 1m, 1m, 42),
        new("SEO & AI Visibility", "seo-ai-visibility", "📈", 1m, 1m, 2),
        new("Shopping & Marketplaces", "shopping-marketplaces", "🛍️", 1m, 1m, 51),
        new("Social Media", "social-media", "📱", 1m, 1m, 43),
        new("Software & SaaS", "software-saas", "💻", 1m, 1m, 44),
        new("Sports", "sports", "⚽", 1m, 1m, 14),
        new("Technology", "technology", "💡", 1m, 1m, 45),
        new("Telecommunications", "telecommunications", "📡", 1m, 1m, 56),
        new("Transportation", "transportation", "🚆", 1m, 1m, 46),
        new("Travel", "travel", "✈️", 1m, 1m, 8),
        new("Utilities", "utilities", "🔧", 1m, 1m, 47)
    ];

    /// <summary>
    /// Idempotent. Seeds only category rows (no listings or claims).
    /// Safe to call in any environment, including Production.
    /// </summary>
    public static async Task SeedCategoriesAsync(RankerDbContext dbContext, CancellationToken ct = default)
    {
        // Backfill icons on categories that were seeded before the Icon column existed.
        var categoriesWithoutIcon = await dbContext.Categories.Where(c => c.Icon == null).ToListAsync(ct);
        if (categoriesWithoutIcon.Count > 0)
        {
            foreach (var cat in categoriesWithoutIcon)
            {
                var seed = CategorySeeds.FirstOrDefault(s => s.Slug == cat.Slug);
                if (seed != null) cat.Icon = seed.Icon;
            }
            await dbContext.SaveChangesAsync(ct);
        }

        // Nothing more to do if categories already exist.
        if (await dbContext.Categories.AnyAsync(ct))
            return;

        foreach (var seed in CategorySeeds)
        {
            dbContext.Categories.Add(new Category
            {
                Name = seed.Name,
                Slug = seed.Slug,
                Icon = seed.Icon,
                MinClaimIncrement = seed.MinClaimIncrement,
                MinStartingClaim = seed.MinStartingClaim,
            });
        }

        await dbContext.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Idempotent. Seeds category reference data only — identical to Production.
    /// No fake listings, claims, or visit counts are created.
    /// </summary>
    public static async Task SeedAsync(RankerDbContext dbContext, CancellationToken ct = default)
    {
        await SeedCategoriesAsync(dbContext, ct);
    }
}
