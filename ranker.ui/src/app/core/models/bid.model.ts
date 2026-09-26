export interface PlaceBidRequestDto {
  categoryId: number;
  listingId: number | null;
  listingName: string | null;
  listingUrl: string | null;
  ownerContactEmail: string;
  targetBidAmount: number;
  paymentReference: string;
  confirmedPaymentAmount: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
}

export interface PlaceBidResultDto {
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  listingId: number | null;
  newCurrentBidAmount: number | null;
  amountCharged: number | null;
}

export interface CalculateBidQuoteRequestDto {
  categoryId: number;
  listingId?: number | null;
  listingUrl?: string | null;
  ownerContactEmail?: string | null;
  targetBidAmount: number;
}

export interface CalculateBidQuoteResponseDto {
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  categoryId: number;
  categoryName: string;
  categoryMinStartingBid: number;
  categoryMinBidIncrement: number;
  currentTopBidInCategory: number | null;
  currentTopListingId: number | null;
  currentTopListingName: string | null;
  listingId: number | null;
  listingName: string | null;
  existingListingCurrentBid: number;
  targetBidAmount: number;
  requiredMinimumBid: number;
  expectedChargeAmount: number;
  becameCategoryTop: boolean;
}
