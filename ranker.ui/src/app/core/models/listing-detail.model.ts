export interface BidHistoryEntryDto {
  amount: number;
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
  currentBidAmount: number;
  firstBidAt: string;
  lastBidAt: string;
  clickCount: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
  bids: BidHistoryEntryDto[];
}

export interface ListingLookupResultDto {
  found: boolean;
  listingId: number | null;
  listingName: string | null;
  listingUrl: string | null;
  currentBidAmount: number;
  currentRankInCategory: number | null;
  ownerContactEmailMasked: string | null;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
}
