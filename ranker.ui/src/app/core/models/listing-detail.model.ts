export interface ClaimHistoryEntryDto {
  amount: number;
  paymentAmount: number;
  createdAt: string;
  paymentReferenceMasked: string;
}

export interface ListingDetailDto {
  listingId: number;
  listingName: string;
  listingUrl: string;
  categoryName: string;
  categorySlug: string;
  currentRankInCategory: number;
  currentClaimAmount: number;
  firstClaimAt: string;
  lastClaimAt: string;
  clickCount: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
  claims: ClaimHistoryEntryDto[];
}

export interface ListingLookupResultDto {
  found: boolean;
  listingId: number | null;
  listingName: string | null;
  listingUrl: string | null;
  currentClaimAmount: number;
  currentRankInCategory: number | null;
  ownerContactEmailMasked: string | null;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
}
