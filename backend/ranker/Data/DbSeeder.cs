using Microsoft.EntityFrameworkCore;
using Ranker.Domain.Entities;

namespace Ranker.Data;

/// <summary>Idempotent seed helpers. Both <see cref="SeedCategoriesAsync"/> and <see cref="SeedAsync"/>
/// seed only category reference data and are safe to run in any environment.</summary>
public static class DbSeeder
{
    private sealed record CategorySeed(string Name, string Slug, string Icon, decimal MinStartingBid, decimal MinBidIncrement, int BaseDaysAgo);

    private static readonly CategorySeed[] CategorySeeds =
    [
        new("AI Agents & Infrastructure", "ai-agents-infrastructure", "🤖", 1m, 1m, 1),
        new("Automotive", "automotive", "🚗", 1m, 1m, 16),
        new("Crypto & Web3", "crypto-web3", "🪙", 1m, 1m, 2),
        new("Developer Tools", "developer-tools", "⚡", 1m, 1m, 4),
        new("E-commerce Tools", "ecommerce-tools", "🛒", 1m, 1m, 6),
        new("Education", "education", "📚", 1m, 1m, 11),
        new("Fashion", "fashion", "👗", 1m, 1m, 12),
        new("Finance & Investing", "finance-investing", "💳", 1m, 1m, 15),
        new("Food & Beverage", "food-beverage", "🍽️", 1m, 1m, 18),
        new("Freelancers", "freelancers", "💼", 1m, 1m, 5),
        new("Games & Entertainment", "games-entertainment", "🎮", 1m, 1m, 1),
        new("Health & Fitness", "health-fitness", "💪", 1m, 1m, 7),
        new("Home Services", "home-services", "🛠️", 1m, 1m, 9),
        new("Legal Services", "legal-services", "⚖️", 1m, 1m, 20),
        new("Marketing & Advertising", "marketing-advertising", "📣", 1m, 1m, 3),
        new("Music", "music", "🎵", 1m, 1m, 25),
        new("Pet Care", "pet-care", "🐾", 1m, 1m, 22),
        new("Productivity", "productivity", "🎯", 1m, 1m, 5),
        new("Real Estate", "real-estate", "🏠", 1m, 1m, 10),
        new("SEO & AI Visibility", "seo-ai-visibility", "📈", 1m, 1m, 2),
        new("Sports", "sports", "⚽", 1m, 1m, 14),
        new("Travel", "travel", "✈️", 1m, 1m, 8),
    ];

    /// <summary>
    /// Idempotent. Seeds only category rows (no listings or bids).
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
                MinBidIncrement = seed.MinBidIncrement,
                MinStartingBid = seed.MinStartingBid,
            });
        }

        await dbContext.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Idempotent. Seeds category reference data only — identical to Production.
    /// No fake listings, bids, or visit counts are created.
    /// </summary>
    public static async Task SeedAsync(RankerDbContext dbContext, CancellationToken ct = default)
    {
        await SeedCategoriesAsync(dbContext, ct);
    }
}
