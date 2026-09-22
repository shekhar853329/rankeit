export interface PlaceBidRequestDto {
  categoryId: number;
  listingId: number | null;
  listingName: string | null;
  listingUrl: string | null;
  ownerContactEmail: string;
  targetBidAmount: number;
  paymentReference: string;
  confirmedPaymentAmount: number;
}

export interface PlaceBidResultDto {
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  listingId: number | null;
  newCurrentBidAmount: number | null;
  amountCharged: number | null;
}
