namespace Ranker.Dtos;

public sealed record PlatformStatsDto(
    double TrafficSurgePercentage,
    int AvgLeaderViews,
    decimal AverageCpcToday,
    double DirectCtrRate,
    string ProtocolAuditId,
    IReadOnlyList<HourlyClaimPointDto> HourlyClaimPressures,
    IReadOnlyList<ClaimTimelinePointDto> RecentClaimsTimeline,
    IReadOnlyList<DailyClaimPointDto> DailyClaimPressures);

public sealed record HourlyClaimPointDto(
    int Hour,
    decimal Volume,
    int ClaimCount,
    decimal AvgClaim = 0m);

public sealed record ClaimTimelinePointDto(
    int Id,
    int ListingId,
    string ListingName,
    string CategoryName,
    decimal Amount,
    DateTime CreatedAt,
    string? PaymentReference,
    decimal CurrentClaimLevel = 0m);

public sealed record DailyClaimPointDto(
    string Date,
    decimal Volume,
    int ClaimCount);

public sealed record LiveClaimEventDto(
    int ClaimId,
    int ListingId,
    string ListingName,
    string? SiteName,
    string CategoryName,
    string CategorySlug,
    string? CategoryIcon,
    decimal Amount,
    DateTime CreatedAt,
    bool IsTopClaim,
    string ActionText,
    string HighlightText,
    string TimeAgo);

public sealed record HallOfFameItemDto(
    int Id,
    int Rank,
    string Name,
    string? SiteName,
    string Url,
    decimal ClaimAmount,
    int ClickCount);
