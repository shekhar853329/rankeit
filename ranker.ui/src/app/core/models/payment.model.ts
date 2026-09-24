export interface CreateOrderRequest {
  amountInPaise: number;
  currency: string;
  receipt?: string;
}

export interface CreateOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
}

export interface VerifyPaymentRequest {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface VerifyPaymentResponse {
  verified: boolean;
  error?: string;
}
