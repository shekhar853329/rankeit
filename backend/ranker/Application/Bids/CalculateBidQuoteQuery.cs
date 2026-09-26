using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Dtos;
using Ranker.Repositories;

namespace Ranker.Application.Bids;

public sealed record CalculateBidQuoteQuery(
    int CategoryId,
    int? ListingId,
    string? ListingUrl,
    string? OwnerContactEmail,
    decimal TargetBidAmount) : IRequest<CalculateBidQuoteResponseDto>;

public class CalculateBidQuoteQueryHandler(
    RankerDbContext dbContext,
    ICategoryRepository categoryRepository)
    : IRequestHandler<CalculateBidQuoteQuery, CalculateBidQuoteResponseDto>
{
    public async Task<CalculateBidQuoteResponseDto> Handle(CalculateBidQuoteQuery request, CancellationToken ct)
    {
        var category = await categoryRepository.GetByIdAsync(request.CategoryId, ct);
        if (category is null)
        {
            return Failure(request.CategoryId, "CategoryNotFound", "Category not found.");
        }

        // Find existing listing if ListingId is specified or if ListingUrl is specified
        Listing? existingListing = null;
        if (request.ListingId.HasValue)
        {
            existingListing = await dbContext.Listings
                .AsNoTracking()
                .FirstOrDefaultAsync(l => l.Id == request.ListingId.Value, ct);

            if (existingListing is null)
            {
                return Failure(category.Id, "ListingNotFound", "Listing not found.", category.Name, category.MinStartingBid, category.MinBidIncrement);
            }

            if (existingListing.CategoryId != request.CategoryId)
            {
                return Failure(category.Id, "ListingCategoryMismatch", "Listing does not belong to this category.", category.Name, category.MinStartingBid, category.MinBidIncrement);
            }
        }
        else if (!string.IsNullOrWhiteSpace(request.ListingUrl))
        {
            var trimmedUrl = request.ListingUrl.Trim();
            existingListing = await dbContext.Listings
                .AsNoTracking()
                .FirstOrDefaultAsync(l => l.CategoryId == request.CategoryId && l.Url == trimmedUrl, ct);
        }

        // If existing listing is matched and owner contact email is provided, check email match
        if (existingListing != null && !string.IsNullOrWhiteSpace(request.OwnerContactEmail))
        {
            if (!string.Equals(existingListing.OwnerContactEmail.Trim(), request.OwnerContactEmail.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                return Failure(category.Id, "OwnerEmailMismatch", "Owner contact email does not match the listing on record.",
                    category.Name, category.MinStartingBid, category.MinBidIncrement,
                    existingListing.Id, existingListing.Name, existingListing.CurrentBidAmount);
            }
        }

        // Get current top listing in this category
        var topListing = await dbContext.Listings
            .AsNoTracking()
            .Where(l => l.CategoryId == request.CategoryId)
            .OrderByDescending(l => l.CurrentBidAmount)
            .ThenBy(l => l.FirstBidAt)
            .Select(l => new { l.Id, l.Name, l.CurrentBidAmount })
            .FirstOrDefaultAsync(ct);

        var existingListingCurrentBid = existingListing?.CurrentBidAmount ?? 0m;

        var requiredMinimum = topListing != null
            ? topListing.CurrentBidAmount + category.MinBidIncrement
            : category.MinStartingBid;

        var expectedCharge = Math.Max(0m, request.TargetBidAmount - existingListingCurrentBid);

        var becameTop = topListing is null ||
                        request.TargetBidAmount > topListing.CurrentBidAmount ||
                        (existingListing != null && existingListing.Id == topListing.Id);

        if (request.TargetBidAmount < requiredMinimum)
        {
            return new CalculateBidQuoteResponseDto(
                Success: false,
                ErrorCode: "BidTooLow",
                ErrorMessage: $"Target bid must be at least ₹{requiredMinimum:0.00} to claim Rank #1.",
                CategoryId: category.Id,
                CategoryName: category.Name,
                CategoryMinStartingBid: category.MinStartingBid,
                CategoryMinBidIncrement: category.MinBidIncrement,
                CurrentTopBidInCategory: topListing?.CurrentBidAmount,
                CurrentTopListingId: topListing?.Id,
                CurrentTopListingName: topListing?.Name,
                ListingId: existingListing?.Id,
                ListingName: existingListing?.Name,
                ExistingListingCurrentBid: existingListingCurrentBid,
                TargetBidAmount: request.TargetBidAmount,
                RequiredMinimumBid: requiredMinimum,
                ExpectedChargeAmount: expectedCharge,
                BecameCategoryTop: becameTop);
        }

        if (existingListing != null && request.TargetBidAmount <= existingListingCurrentBid)
        {
            return new CalculateBidQuoteResponseDto(
                Success: false,
                ErrorCode: "BidNotHigher",
                ErrorMessage: $"Target bid must be greater than your existing bid of ₹{existingListingCurrentBid:0.00}.",
                CategoryId: category.Id,
                CategoryName: category.Name,
                CategoryMinStartingBid: category.MinStartingBid,
                CategoryMinBidIncrement: category.MinBidIncrement,
                CurrentTopBidInCategory: topListing?.CurrentBidAmount,
                CurrentTopListingId: topListing?.Id,
                CurrentTopListingName: topListing?.Name,
                ListingId: existingListing.Id,
                ListingName: existingListing.Name,
                ExistingListingCurrentBid: existingListingCurrentBid,
                TargetBidAmount: request.TargetBidAmount,
                RequiredMinimumBid: requiredMinimum,
                ExpectedChargeAmount: expectedCharge,
                BecameCategoryTop: becameTop);
        }

        return new CalculateBidQuoteResponseDto(
            Success: true,
            ErrorCode: null,
            ErrorMessage: null,
            CategoryId: category.Id,
            CategoryName: category.Name,
            CategoryMinStartingBid: category.MinStartingBid,
            CategoryMinBidIncrement: category.MinBidIncrement,
            CurrentTopBidInCategory: topListing?.CurrentBidAmount,
            CurrentTopListingId: topListing?.Id,
            CurrentTopListingName: topListing?.Name,
            ListingId: existingListing?.Id,
            ListingName: existingListing?.Name,
            ExistingListingCurrentBid: existingListingCurrentBid,
            TargetBidAmount: request.TargetBidAmount,
            RequiredMinimumBid: requiredMinimum,
            ExpectedChargeAmount: expectedCharge,
            BecameCategoryTop: becameTop);
    }

    private static CalculateBidQuoteResponseDto Failure(
        int categoryId,
        string errorCode,
        string errorMessage,
        string categoryName = "",
        decimal minStartingBid = 0m,
        decimal minBidIncrement = 0m,
        int? listingId = null,
        string? listingName = null,
        decimal existingBid = 0m) =>
        new(
            Success: false,
            ErrorCode: errorCode,
            ErrorMessage: errorMessage,
            CategoryId: categoryId,
            CategoryName: categoryName,
            CategoryMinStartingBid: minStartingBid,
            CategoryMinBidIncrement: minBidIncrement,
            CurrentTopBidInCategory: null,
            CurrentTopListingId: null,
            CurrentTopListingName: null,
            ListingId: listingId,
            ListingName: listingName,
            ExistingListingCurrentBid: existingBid,
            TargetBidAmount: 0m,
            RequiredMinimumBid: 0m,
            ExpectedChargeAmount: 0m,
            BecameCategoryTop: false);
}
