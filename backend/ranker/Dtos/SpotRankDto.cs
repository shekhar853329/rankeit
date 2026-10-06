namespace Ranker.Dtos;

/// <summary>Calculated spot rank position across the full dataset for a given claim amount.</summary>
public sealed record SpotRankDto(
    int Rank,
    decimal Amount,
    string TimeMode,
    string? CategorySlug);
