using MediatR;
using Microsoft.EntityFrameworkCore;
using Ranker.Data;
using Ranker.Domain.Entities;
using Ranker.Dtos;
using Ranker.Repositories;

namespace Ranker.Application.Claims;

public sealed record CalculateClaimQuoteQuery(
    int CategoryId,
    int? ListingId,
    string? ListingUrl,
    string? OwnerContactEmail,
    decimal TargetClaimAmount,
    bool IsAllTimeMode = false) : IRequest<CalculateClaimQuoteResponseDto>;

public class CalculateClaimQuoteQueryHandler(
    RankerDbContext dbContext,
    ICategoryRepository categoryRepository)
    : IRequestHandler<CalculateClaimQuoteQuery, CalculateClaimQuoteResponseDto>
{
    public async Task<CalculateClaimQuoteResponseDto> Handle(CalculateClaimQuoteQuery request, CancellationToken ct)
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
                return Failure(category.Id, "ListingNotFound", "Listing not found.", category.Name, category.MinStartingClaim, category.MinClaimIncrement);
            }

            if (existingListing.CategoryId != request.CategoryId)
            {
                return Failure(category.Id, "ListingCategoryMismatch", "Listing does not belong to this category.", category.Name, category.MinStartingClaim, category.MinClaimIncrement);
            }
        }
        else if (!string.IsNullOrWhiteSpace(request.ListingUrl))
        {
            var trimmedUrl = request.ListingUrl.Trim();
            existingListing = await dbContext.Listings
                .AsNoTracking()
                .FirstOrDefaultAsync(l => l.CategoryId == request.CategoryId && l.Url == trimmedUrl, ct);
        }

        // If existing listing is matched and owner contact email is provided, skip email match check
        // to allow reclaims with any email address.

        // Get current top listing in this category
        var topListing = await dbContext.Listings
            .AsNoTracking()
            .Where(l => l.CategoryId == request.CategoryId)
            .OrderByDescending(l => l.CurrentClaimAmount)
            .ThenBy(l => l.FirstClaimAt)
            .Select(l => new { l.Id, l.Name, l.CurrentClaimAmount })
            .FirstOrDefaultAsync(ct);

        var existingListingCurrentClaim = existingListing?.CurrentClaimAmount ?? 0m;

        var rank1Minimum = topListing != null
            ? topListing.CurrentClaimAmount + category.MinClaimIncrement
            : category.MinStartingClaim;

        // Mode-aware credit: all-time mode credits the listing's cumulative total; today mode does not.
        var existingCredit = request.IsAllTimeMode ? existingListingCurrentClaim : 0m;
        var expectedCharge = Math.Max(0m, request.TargetClaimAmount - existingCredit);

        var becameTop = topListing is null ||
                        request.TargetClaimAmount > topListing.CurrentClaimAmount ||
                        (existingListing != null && existingListing.Id == topListing.Id);

        if (request.TargetClaimAmount < 1m)
        {
            return new CalculateClaimQuoteResponseDto(
                Success: false,
                ErrorCode: "ClaimTooLow",
                ErrorMessage: "Target claim must be at least $1.00.",
                CategoryId: category.Id,
                CategoryName: category.Name,
                CategoryMinStartingClaim: category.MinStartingClaim,
                CategoryMinClaimIncrement: category.MinClaimIncrement,
                CurrentTopClaimInCategory: topListing?.CurrentClaimAmount,
                CurrentTopListingId: topListing?.Id,
                CurrentTopListingName: topListing?.Name,
                ListingId: existingListing?.Id,
                ListingName: existingListing?.Name,
                ExistingListingCurrentClaim: existingListingCurrentClaim,
                TargetClaimAmount: request.TargetClaimAmount,
                RequiredMinimumClaim: 1m,
                ExpectedChargeAmount: expectedCharge,
                BecameCategoryTop: becameTop);
        }

        // All-time mode only: a listing's new target must exceed the all-time cumulative total already paid.
        // In today mode the user always pays the full target amount, so no lower-bound check against the
        // existing claim applies — the score resets to the amount paid today.
        if (request.IsAllTimeMode && existingListing != null && request.TargetClaimAmount <= existingListingCurrentClaim)
        {
            var minRequired = existingListingCurrentClaim + category.MinClaimIncrement;
            return new CalculateClaimQuoteResponseDto(
                Success: false,
                ErrorCode: "AllTimeCumulativeTooLow",
                ErrorMessage: $"In all-time mode, your new claim must exceed the listing's all-time total of ${existingListingCurrentClaim:0.00}. Minimum accepted: ${minRequired:0.00}.",
                CategoryId: category.Id,
                CategoryName: category.Name,
                CategoryMinStartingClaim: category.MinStartingClaim,
                CategoryMinClaimIncrement: category.MinClaimIncrement,
                CurrentTopClaimInCategory: topListing?.CurrentClaimAmount,
                CurrentTopListingId: topListing?.Id,
                CurrentTopListingName: topListing?.Name,
                ListingId: existingListing.Id,
                ListingName: existingListing.Name,
                ExistingListingCurrentClaim: existingListingCurrentClaim,
                TargetClaimAmount: request.TargetClaimAmount,
                RequiredMinimumClaim: minRequired,
                ExpectedChargeAmount: expectedCharge,
                BecameCategoryTop: becameTop);
        }

        return new CalculateClaimQuoteResponseDto(
            Success: true,
            ErrorCode: null,
            ErrorMessage: null,
            CategoryId: category.Id,
            CategoryName: category.Name,
            CategoryMinStartingClaim: category.MinStartingClaim,
            CategoryMinClaimIncrement: category.MinClaimIncrement,
            CurrentTopClaimInCategory: topListing?.CurrentClaimAmount,
            CurrentTopListingId: topListing?.Id,
            CurrentTopListingName: topListing?.Name,
            ListingId: existingListing?.Id,
            ListingName: existingListing?.Name,
            ExistingListingCurrentClaim: existingListingCurrentClaim,
            TargetClaimAmount: request.TargetClaimAmount,
            RequiredMinimumClaim: rank1Minimum,
            ExpectedChargeAmount: expectedCharge,
            BecameCategoryTop: becameTop);
    }

    private static CalculateClaimQuoteResponseDto Failure(
        int categoryId,
        string errorCode,
        string errorMessage,
        string categoryName = "",
        decimal minStartingClaim = 0m,
        decimal minClaimIncrement = 0m,
        int? listingId = null,
        string? listingName = null,
        decimal existingClaim = 0m) =>
        new(
            Success: false,
            ErrorCode: errorCode,
            ErrorMessage: errorMessage,
            CategoryId: categoryId,
            CategoryName: categoryName,
            CategoryMinStartingClaim: minStartingClaim,
            CategoryMinClaimIncrement: minClaimIncrement,
            CurrentTopClaimInCategory: null,
            CurrentTopListingId: null,
            CurrentTopListingName: null,
            ListingId: listingId,
            ListingName: listingName,
            ExistingListingCurrentClaim: existingClaim,
            TargetClaimAmount: 0m,
            RequiredMinimumClaim: 0m,
            ExpectedChargeAmount: 0m,
            BecameCategoryTop: false);
}
