using Microsoft.EntityFrameworkCore;
using Ranker.Domain.Entities;

namespace Ranker.Data;

/// <summary>Idempotent dev-time seed: ~20 categories across price tiers, each with 10 bidding listings.</summary>
public static class DbSeeder
{
    private sealed record CategorySeed(string Name, string Slug, string Icon, decimal MinStartingBid, decimal MinBidIncrement, int BaseDaysAgo);

    // BaseDaysAgo roughly controls how "hot" (recent bids) vs "cold" (older bids) a category looks, which
    // in turn drives ActivityScore/RecentClaimCount and the "most active categories" UI.
    private static readonly CategorySeed[] CategorySeeds =
    [
        new("AI Agents & Infrastructure", "ai-agents-infrastructure", "🤖", 900m, 1m, 1),
        new("SEO & AI Visibility", "seo-ai-visibility", "📈", 800m, 1m, 2),
        new("Marketing & Advertising", "marketing-advertising", "📣", 1000m, 1m, 3),
        new("Developer Tools", "developer-tools", "⚡", 700m, 1m, 4),
        new("Productivity", "productivity", "🎯", 600m, 1m, 5),
        new("E-commerce Tools", "ecommerce-tools", "🛒", 850m, 1m, 6),
        new("Crypto & Web3", "crypto-web3", "🪙", 1200m, 1m, 2),
        new("Real Estate", "real-estate", "🏠", 6000m, 1m, 10),
        new("Legal Services", "legal-services", "⚖️", 5000m, 1m, 20),
        new("Finance & Investing", "finance-investing", "💳", 4500m, 1m, 15),
        new("Freelancers", "freelancers", "💼", 200m, 1m, 5),
        new("Games & Entertainment", "games-entertainment", "🎮", 300m, 1m, 1),
        new("Music", "music", "🎵", 150m, 1m, 25),
        new("Food & Beverage", "food-beverage", "🍽️", 250m, 1m, 18),
        new("Fashion", "fashion", "👗", 350m, 1m, 12),
        new("Pet Care", "pet-care", "🐾", 180m, 1m, 22),
        new("Travel", "travel", "✈️", 400m, 1m, 8),
        new("Sports", "sports", "⚽", 300m, 1m, 14),
        new("Home Services", "home-services", "🛠️", 450m, 1m, 9),
        new("Automotive", "automotive", "🚗", 500m, 1m, 16),
        new("Education", "education", "📚", 350m, 1m, 11),
        new("Health & Fitness", "health-fitness", "💪", 550m, 1m, 7),
    ];

    public static async Task SeedAsync(RankerDbContext dbContext, CancellationToken ct = default)
    {
        // Ensure category icons are backfilled if existing DB was seeded prior to Icon column
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


        // Ensure DailyVisitCount has baseline rows for today and yesterday if empty
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

        if (await dbContext.Categories.AnyAsync(ct))
        {
            return;
        }

        var random = new Random(42);
        var now = DateTime.UtcNow;

        foreach (var seed in CategorySeeds)
        {
            var category = new Category
            {
                Name = seed.Name,
                Slug = seed.Slug,
                Icon = seed.Icon,
                MinBidIncrement = seed.MinBidIncrement,
                MinStartingBid = seed.MinStartingBid,
            };
            dbContext.Categories.Add(category);

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
                    {
                        rebidAt = now.AddHours(-random.Next(1, 12));
                    }

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
