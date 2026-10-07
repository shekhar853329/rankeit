namespace Ranker.Dtos;

public sealed record CategoryDto(
    int Id,
    string Name,
    string Slug,
    string? Icon,
    int? ParentCategoryId,
    decimal MinClaimIncrement,
    decimal MinStartingClaim,
    double ActivityScore,
    int RecentClaimCount,
    int ListingCount,
    int TodayListingCount = 0,
    decimal MaxClaimAmount = 0m);

public sealed record CategoryTreeNodeDto(
    int Id,
    string Name,
    string Slug,
    IReadOnlyList<CategoryTreeNodeDto> Children);
