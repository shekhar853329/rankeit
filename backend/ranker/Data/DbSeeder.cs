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
        // ── Tech ──
        new("AI & Machine Learning", "ai-machine-learning", "🤖", 1m, 1m, 1),
        new("SaaS & Software", "saas-software", "💻", 1m, 1m, 2),
        new("Developer Tools", "developer-tools", "⚡", 1m, 1m, 3),
        new("Cloud & Hosting", "cloud-hosting", "☁️", 1m, 1m, 4),
        new("Cybersecurity", "cybersecurity", "🔐", 1m, 1m, 5),
        new("Mobile Apps", "mobile-apps", "📱", 1m, 1m, 6),
        new("Web3 & Crypto", "web3-crypto", "🪙", 1m, 1m, 7),
        new("No-Code & Automation", "no-code-automation", "🔧", 1m, 1m, 8),

        // ── Business ──
        new("E-commerce & Stores", "ecommerce-stores", "🛒", 1m, 1m, 9),
        new("Marketing & SEO", "marketing-seo", "📣", 1m, 1m, 10),
        new("Finance & Fintech", "finance-fintech", "💳", 1m, 1m, 11),
        new("Business & Consulting", "business-consulting", "💼", 1m, 1m, 12),
        new("Real Estate", "real-estate", "🏠", 1m, 1m, 13),
        new("Jobs & Careers", "jobs-careers", "👔", 1m, 1m, 14),
        new("Freelance & Agencies", "freelance-agencies", "🧑‍💼", 1m, 1m, 15),

        // ── Social Media ──
        new("YouTube Channels", "youtube-channels", "▶️", 1m, 1m, 16),
        new("Instagram Pages", "instagram-pages", "📸", 1m, 1m, 17),
        new("X (Twitter) Profiles", "x-twitter-profiles", "🐦", 1m, 1m, 18),
        new("Facebook Pages", "facebook-pages", "📘", 1m, 1m, 19),
        new("TikTok Accounts", "tiktok-accounts", "🎵", 1m, 1m, 20),
        new("LinkedIn Profiles", "linkedin-profiles", "🔗", 1m, 1m, 21),
        new("Telegram Channels", "telegram-channels", "✈️", 1m, 1m, 22),
        new("WhatsApp Channels", "whatsapp-channels", "💬", 1m, 1m, 23),
        new("Discord Servers", "discord-servers", "🎮", 1m, 1m, 24),
        new("Twitch Streamers", "twitch-streamers", "🟣", 1m, 1m, 25),
        new("Reddit Communities", "reddit-communities", "🤝", 1m, 1m, 26),
        new("Pinterest Boards", "pinterest-boards", "📌", 1m, 1m, 27),
        new("Social Media Platforms", "social-media-platforms", "🌐", 1m, 1m, 28),
        new("Forums & Communities", "forums-communities", "👥", 1m, 1m, 29),
        new("Other Social", "other-social", "💡", 1m, 1m, 30),

        // ── Content ──
        new("Blogs & Personal Sites", "blogs-personal-sites", "✍️", 1m, 1m, 31),
        new("News & Magazines", "news-magazines", "📰", 1m, 1m, 32),
        new("Education & Courses", "education-courses", "📚", 1m, 1m, 33),
        new("Books & Literature", "books-literature", "📖", 1m, 1m, 34),
        new("Entertainment & Media", "entertainment-media", "🎬", 1m, 1m, 35),
        new("Gaming", "gaming", "🎮", 1m, 1m, 36),
        new("Music & Podcasts", "music-podcasts", "🎧", 1m, 1m, 37),

        // ── Lifestyle ──
        new("Health & Fitness", "health-fitness", "💪", 1m, 1m, 38),
        new("Food & Recipes", "food-recipes", "🍽️", 1m, 1m, 39),
        new("Travel & Hospitality", "travel-hospitality", "✈️", 1m, 1m, 40),
        new("Fashion & Beauty", "fashion-beauty", "👗", 1m, 1m, 41),
        new("Sports", "sports", "⚽", 1m, 1m, 42),
        new("Home & Garden", "home-garden", "🏡", 1m, 1m, 43),
        new("Automotive", "automotive", "🚗", 1m, 1m, 44),
        new("Pets & Animals", "pets-animals", "🐾", 1m, 1m, 45),

        // ── Other ──
        new("Government & Public Services", "government-public-services", "🏛️", 1m, 1m, 46),
        new("Nonprofits & Community", "nonprofits-community", "❤️", 1m, 1m, 47),
        new("Events & Conferences", "events-conferences", "🎟️", 1m, 1m, 48),
        new("Digital Products", "digital-products", "📦", 1m, 1m, 49),
        new("Design & Creative", "design-creative", "🎨", 1m, 1m, 50),
        new("Other", "other", "🔖", 1m, 1m, 51),
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
