namespace Ranker.Dtos;

public sealed record PlatformStatsDto(
    double TrafficSurgePercentage,
    int AvgLeaderViews,
    decimal AverageCpcToday,
    double DirectCtrRate,
    string ProtocolAuditId,
    IReadOnlyList<HourlyBidPointDto> HourlyBidPressures,
    IReadOnlyList<BidTimelinePointDto> RecentBidsTimeline,
    IReadOnlyList<DailyBidPointDto> DailyBidPressures);

public sealed record HourlyBidPointDto(
    int Hour,
    decimal Volume,
    int BidCount,
    decimal AvgBid = 0m);

public sealed record BidTimelinePointDto(
    int Id,
    int ListingId,
    string ListingName,
    string CategoryName,
    decimal Amount,
    DateTime CreatedAt,
    string? PaymentReference,
    decimal CurrentBidLevel = 0m);

public sealed record DailyBidPointDto(
    string Date,
    decimal Volume,
    int BidCount);

public sealed record LiveBidEventDto(
    int BidId,
    int ListingId,
    string ListingName,
    string? SiteName,
    string CategoryName,
    string CategorySlug,
    string? CategoryIcon,
    decimal Amount,
    DateTime CreatedAt,
    bool IsTopBid,
    string ActionText,
    string HighlightText,
    string TimeAgo);

public sealed record HallOfFameItemDto(
    int Id,
    int Rank,
    string Name,
    string? SiteName,
    string Url,
    decimal Bid,
    int ClickCount);
