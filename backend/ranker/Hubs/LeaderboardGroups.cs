namespace Ranker.Hubs;

public static class LeaderboardGroups
{
    public const string Global = "global";

    public static string ForCategory(string categorySlug) => $"category:{categorySlug}";
}
