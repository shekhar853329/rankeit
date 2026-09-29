namespace Ranker.Dtos;

public record GaOverviewDto(
    int TotalUsers,
    int NewUsers,
    int ActiveUsers,
    int Sessions,
    int ScreenPageViews,
    double EngagementRate,
    double AverageSessionDurationSeconds,
    double BounceRate,
    int EventCount,
    double TotalUsersChangePercent,
    double PageViewsChangePercent,
    double SessionsChangePercent,
    double EngagementRateChangePercent
);

public record GaTimeSeriesPointDto(
    string Date,
    string Label,
    int ActiveUsers,
    int Sessions,
    int PageViews,
    int NewUsers
);

public record GaTrafficSourceDto(
    string ChannelGroup,
    int Sessions,
    int Users,
    double Percentage
);

public record GaDeviceBreakdownDto(
    string DeviceCategory,
    int Users,
    int Sessions,
    double Percentage
);

public record GaTopPageDto(
    string PagePath,
    string PageTitle,
    int PageViews,
    int ActiveUsers,
    double AverageTimeOnPageSeconds,
    double BounceRate
);

public record GaGeoLocationDto(
    string Country,
    string CountryCode,
    string City,
    int Users,
    int Sessions,
    double Percentage
);

public record GaEventSummaryDto(
    string EventName,
    int EventCount,
    int TotalUsers
);

public record GaRealtimePageDto(
    string PagePath,
    int ActiveUsers
);

public record GaRealtimeCountryDto(
    string Country,
    int ActiveUsers
);

public record GaRealtimeReportDto(
    int ActiveUsersLast30Min,
    List<GaRealtimePageDto> TopPages,
    List<GaRealtimeCountryDto> TopCountries,
    string LastUpdatedUtc
);

public record GoogleAnalyticsReportDto(
    bool IsConnected,
    string PropertyId,
    string DateRangeLabel,
    int Days,
    GaOverviewDto Overview,
    List<GaTimeSeriesPointDto> TimeSeries,
    List<GaTrafficSourceDto> TrafficSources,
    List<GaDeviceBreakdownDto> DeviceBreakdown,
    List<GaTopPageDto> TopPages,
    List<GaGeoLocationDto> Geographics,
    List<GaEventSummaryDto> TopEvents,
    GaRealtimeReportDto Realtime,
    string DataSourceDescription
);

public record GaConfigStatusDto(
    bool IsConfigured,
    string? PropertyId,
    string? ServiceAccountEmail,
    string Mode,
    string? WarningOrError
);

public record GaConfigureRequestDto(
    string PropertyId,
    string? CredentialsJson
);
