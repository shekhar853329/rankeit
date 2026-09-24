// Ambient type declaration for the Razorpay Standard Checkout script
// loaded via <script src="https://checkout.razorpay.com/v1/checkout.js">

export interface RazorpayOptions {
  key: string;
  amount: number;         // paise
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: RazorpayFailureResponse) => void): void;
}

export interface RazorpayFailureResponse {
  error: {
    code: string;
    description: string;
    reason: string;
    source: string;
    step: string;
    metadata: {
      order_id: string;
      payment_id: string;
    };
  };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}
