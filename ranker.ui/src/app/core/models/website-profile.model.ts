export interface RelatedListingDto {
  listingId: number;
  listingName: string;
  listingUrl: string;
  categoryName: string;
  categorySlug: string;
  rank: number;
  currentBidAmount: number;
  clickCount: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
}

export interface WebsiteProfileDto {
  listingId: number;
  listingName: string;
  listingUrl: string;
  slug: string;
  categoryName: string;
  categorySlug: string;
  categoryIcon: string | null;
  currentRankInCategory: number;
  totalListingsInCategory: number;
  currentBidAmount: number;
  firstBidAt: string;
  lastBidAt: string;
  clickCount: number;
  bidCount: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
  ownerContactEmailMasked: string | null;
  sameCategoryListings: RelatedListingDto[];
}
