namespace Ranker.Dtos;

/// <summary>Scraped Open-Graph / meta tag data returned to the frontend for display and storage.</summary>
public sealed record UrlMetadataDto(
    string? SiteName,
    string? LogoUrl,
    string? Description,
    string? FaviconUrl);
