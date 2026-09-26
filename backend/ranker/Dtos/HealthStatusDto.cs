namespace Ranker.Dtos;

public sealed record HealthStatusDto(
    string Status,
    string Database,
    DateTime Timestamp,
    string Uptime,
    string Version = "1.0.0"
);
