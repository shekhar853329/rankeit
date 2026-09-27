using Microsoft.EntityFrameworkCore;
using Ranker.Domain.Entities;

namespace Ranker.Data;

/// <summary>Idempotent seed helpers. <see cref="SeedCategoriesAsync"/> is safe to run in any environment.
/// <see cref="SeedAsync"/> additionally seeds fake listings/bids and is intended for dev-time only.</summary>
public static class DbSeeder
{
    private sealed record CategorySeed(string Name, string Slug, string Icon, decimal MinStartingBid, decimal MinBidIncrement, int BaseDaysAgo);

    // BaseDaysAgo roughly controls how "hot" (recent bids) vs "cold" (older bids) a category looks, which
    // in turn drives ActivityScore/RecentClaimCount and the "most active categories" UI.
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
    /// Idempotent dev-time seed: categories + ~10 fake listings/bids per category.
    /// Also seeds baseline DailyVisitCount rows.
    /// Intended for Development only.
    /// </summary>
    public static async Task SeedAsync(RankerDbContext dbContext, CancellationToken ct = default)
    {
        // Ensure DailyVisitCount has baseline rows for today and yesterday if empty.
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var yesterday = today.AddDays(-1);
        if (!await dbContext.DailyVisitCounts.AnyAsync(ct))
        {
            dbContext.DailyVisitCounts.AddRange(
                new DailyVisitCount { VisitDate = yesterday, Count = 1250 },
                new DailyVisitCount { VisitDate = today, Count = 1600 }
            );
            await dbContext.SaveChangesAsync(ct);
        }

        // Seed categories first (idempotent); bail early if they already existed
        // (means listings were already seeded too).
        var hadCategories = await dbContext.Categories.AnyAsync(ct);
        await SeedCategoriesAsync(dbContext, ct);
        if (hadCategories)
            return;

        // Reload the freshly-inserted categories so we can attach listings to them.
        var categories = await dbContext.Categories.ToListAsync(ct);

        var random = new Random(42);
        var now = DateTime.UtcNow;

        foreach (var seed in CategorySeeds)
        {
            var category = categories.First(c => c.Slug == seed.Slug);

            var currentAmount = seed.MinStartingBid;
            for (var i = 0; i < 10; i++)
            {
                currentAmount += seed.MinBidIncrement * (1 + random.Next(0, 4));

                var daysAgo = seed.BaseDaysAgo + i * random.Next(1, 4);
                var firstBidAt = now.AddDays(-daysAgo).AddHours(-random.Next(0, 24));

                var listing = new Listing
                {
                    Category = category,
                    Name = $"{seed.Name} Pick #{i + 1}",
                    Url = $"https://example.com/{seed.Slug}-{i + 1}",
                    OwnerContactEmail = $"owner{i + 1}@{seed.Slug}.example.com",
                    CurrentBidAmount = currentAmount,
                    FirstBidAt = firstBidAt,
                    LastBidAt = firstBidAt,
                };
                dbContext.Listings.Add(listing);

                dbContext.Bids.Add(new Bid
                {
                    Listing = listing,
                    Amount = currentAmount,
                    CreatedAt = firstBidAt,
                    PaymentReference = $"seed-{seed.Slug}-{i + 1}-1",
                });

                // Give roughly half the listings a re-bid, so LastBidAt/re-claim history and
                // ActivityScore recency weighting have something realistic to show.
                if (random.Next(0, 2) == 0)
                {
                    var rebidAmount = currentAmount + seed.MinBidIncrement * (1 + random.Next(0, 3));
                    var rebidAt = firstBidAt.AddDays(random.Next(1, Math.Max(2, daysAgo)));
                    if (rebidAt > now)
                        rebidAt = now.AddHours(-random.Next(1, 12));

                    listing.CurrentBidAmount = rebidAmount;
                    listing.LastBidAt = rebidAt;
                    currentAmount = rebidAmount;

                    dbContext.Bids.Add(new Bid
                    {
                        Listing = listing,
                        Amount = rebidAmount,
                        CreatedAt = rebidAt,
                        PaymentReference = $"seed-{seed.Slug}-{i + 1}-2",
                    });
                }
            }
        }

        await dbContext.SaveChangesAsync(ct);
    }
}
