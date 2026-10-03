export interface RelatedListingDto {
  listingId: number;
  listingName: string;
  listingUrl: string;
  categoryName: string;
  categorySlug: string;
  rank: number;
  currentClaimAmount: number;
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
  currentClaimAmount: number;
  firstClaimAt: string;
  lastClaimAt: string;
  clickCount: number;
  claimCount: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
  ownerContactEmailMasked: string | null;
  sameCategoryListings: RelatedListingDto[];
}
