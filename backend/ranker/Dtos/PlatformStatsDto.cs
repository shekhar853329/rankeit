namespace Ranker.Dtos;

public sealed record PlatformStatsDto(
    double TrafficSurgePercentage,
    int AvgLeaderViews,
    decimal AverageCpcToday,
    double DirectCtrRate,
    string ProtocolAuditId,
    IReadOnlyList<HourlyBidPointDto> HourlyBidPressures);

public sealed record HourlyBidPointDto(
    int Hour,
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
