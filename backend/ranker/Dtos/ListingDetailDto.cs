namespace Ranker.Dtos;

/// <summary>One historical bid placed against a listing (rule for the listing detail / "see details" page).</summary>
public sealed record BidHistoryEntryDto(
    decimal Amount,
    DateTime CreatedAt,
    string PaymentReferenceMasked);

/// <summary>Full detail for a single listing, including its bid history, for the "see details" page.</summary>
public sealed record ListingDetailDto(
    int ListingId,
    string ListingName,
    string ListingUrl,
    string CategoryName,
    string CategorySlug,
    decimal CurrentBidAmount,
    DateTime FirstBidAt,
    DateTime LastBidAt,
    IReadOnlyList<BidHistoryEntryDto> Bids);
