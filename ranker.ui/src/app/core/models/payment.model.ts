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

export interface VerifyPaymentRequest {
  paymentId?: string;
  sessionId?: string;
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

export interface PaymentTransactionItem {
  id: number;
  action: string;
  transactionStatus: string | null;
  paymentId: string | null;
  sessionId: string | null;
  orderId: string | null;
  amount: number | null;
  currency: string | null;
  isSuccess: boolean;
  errorMessage: string | null;
  createdAt: string;
}
