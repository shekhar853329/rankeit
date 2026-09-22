namespace Ranker.Domain.Entities;

public class Category
{
    public int Id { get; set; }

    public required string Name { get; set; }

    /// <summary>URL-routing slug, e.g. "neet-coaching-patna". Must be unique.</summary>
    public required string Slug { get; set; }

    public int? ParentCategoryId { get; set; }

    public Category? ParentCategory { get; set; }

    public ICollection<Category> ChildCategories { get; set; } = new List<Category>();

    /// <summary>Minimum amount a new bid must exceed the current top bid by.</summary>
    public decimal MinBidIncrement { get; set; }

    /// <summary>Minimum bid required for a brand-new listing when the category has no current top bid.</summary>
    public decimal MinStartingBid { get; set; }

    public ICollection<Listing> Listings { get; set; } = new List<Listing>();
}
