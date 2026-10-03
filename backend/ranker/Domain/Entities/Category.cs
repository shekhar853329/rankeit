namespace Ranker.Domain.Entities;

public class Category
{
    public int Id { get; set; }

    public required string Name { get; set; }

    /// <summary>URL-routing slug, e.g. "neet-coaching-patna". Must be unique.</summary>
    public required string Slug { get; set; }

    /// <summary>Emoji or icon representation of the category, e.g. "🤖".</summary>
    public string? Icon { get; set; }

    public int? ParentCategoryId { get; set; }

    public Category? ParentCategory { get; set; }

    public ICollection<Category> ChildCategories { get; set; } = new List<Category>();

    /// <summary>Minimum amount a new claim must exceed the current top claim by.</summary>
    public decimal MinClaimIncrement { get; set; }

    /// <summary>Minimum claim required for a brand-new listing when the category has no current top claim.</summary>
    public decimal MinStartingClaim { get; set; }

    public ICollection<Listing> Listings { get; set; } = new List<Listing>();
}
