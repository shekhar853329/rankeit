namespace Ranker.Domain.Entities;

public class Listing
{
    public int Id { get; set; }

    public int CategoryId { get; set; }

    public Category? Category { get; set; }

    public required string Name { get; set; }

    public required string Url { get; set; }

    public decimal CurrentBidAmount { get; set; }

    /// <summary>Tiebreaker for equal bids: whoever bid first keeps the higher spot.</summary>
    public DateTime FirstBidAt { get; set; }

    public DateTime LastBidAt { get; set; }

    /// <summary>Number of times a client has clicked through to this listing's product URL.</summary>
    public int ClickCount { get; set; }

    /// <summary>Used to authenticate re-bids/reclaims by the listing owner.</summary>
    public required string OwnerContactEmail { get; set; }

    /// <summary>Human-readable site/brand name scraped from the submitted URL (og:site_name or &lt;title&gt;).</summary>
    public string? SiteName { get; set; }

    /// <summary>Primary logo/open-graph image URL scraped from the submitted URL (og:image).</summary>
    public string? LogoUrl { get; set; }

    /// <summary>Short description scraped from the submitted URL (og:description or meta description).</summary>
    public string? Description { get; set; }

    /// <summary>Favicon URL derived from the submitted URL.</summary>
    public string? FaviconUrl { get; set; }

    /// <summary>Optimistic-concurrency guard, layered on top of the pessimistic row lock taken during bid placement.</summary>
    public byte[]? RowVersion { get; set; }

    public ICollection<Bid> Bids { get; set; } = new List<Bid>();
}
