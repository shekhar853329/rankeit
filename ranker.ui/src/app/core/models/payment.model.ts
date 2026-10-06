export interface CreateDodoSessionRequest {
  amountInMinorUnits: number;
  currency?: string;
  customerEmail?: string;
  customerName?: string;
  returnUrl?: string;
  listingName?: string;
  listingId?: string;
  categoryId?: string;
  billingStreet?: string;
  billingCity?: string;
  billingState?: string;
  billingCountry?: string;
  billingZipcode?: string;
  metadata?: Record<string, string>;
}

export interface CreateDodoSessionResponse {
  sessionId: string;
  checkoutUrl: string;
}

export interface DodoSessionStatusResponse {
  sessionId: string;
  paymentId?: string;
  paymentStatus?: string;
  isPaid: boolean;
}

export interface VerifyPaymentResponse {
  verified: boolean;
  paymentId?: string;
  status?: string;
  amount?: number;
  error?: string;
  listingId?: number;
  newClaimAmount?: number;
}
