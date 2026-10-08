export interface PlaceClaimRequestDto {
  categoryId: number;
  listingId: number | null;
  listingName: string | null;
  listingUrl: string | null;
  ownerContactEmail: string;
  targetClaimAmount: number;
  paymentReference: string;
  confirmedPaymentAmount: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
  isAllTimeMode?: boolean;
}

export interface PlaceClaimResultDto {
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  listingId: number | null;
  newCurrentClaimAmount: number | null;
  amountCharged: number | null;
}

export interface CalculateClaimQuoteRequestDto {
  categoryId: number;
  listingId?: number | null;
  listingUrl?: string | null;
  ownerContactEmail?: string | null;
  targetClaimAmount: number;
  isAllTimeMode?: boolean;
}

export interface CalculateClaimQuoteResponseDto {
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  categoryId: number;
  categoryName: string;
  categoryMinStartingClaim: number;
  categoryMinClaimIncrement: number;
  currentTopClaimInCategory: number | null;
  currentTopListingId: number | null;
  currentTopListingName: string | null;
  listingId: number | null;
  listingName: string | null;
  existingListingCurrentClaim: number;
  targetClaimAmount: number;
  requiredMinimumClaim: number;
  expectedChargeAmount: number;
  becameCategoryTop: boolean;
}
