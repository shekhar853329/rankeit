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
  currentBidAmount: number;
  firstBidAt: string;
  lastBidAt: string;
  bids: BidHistoryEntryDto[];
}
