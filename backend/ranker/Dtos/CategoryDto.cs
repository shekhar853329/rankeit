namespace Ranker.Dtos;

public sealed record CategoryDto(
    int Id,
    string Name,
    string Slug,
    string? Icon,
    int? ParentCategoryId,
    decimal MinBidIncrement,
    decimal MinStartingBid,
    double ActivityScore,
    int RecentClaimCount,
    int ListingCount);

public sealed record CategoryTreeNodeDto(
    int Id,
    string Name,
    string Slug,
    IReadOnlyList<CategoryTreeNodeDto> Children);
