import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import {
  CreateOrderRequest,
  CreateOrderResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from '../models/payment.model';
import { RazorpaySuccessResponse } from '../models/razorpay';

export interface CheckoutResult {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
  /** Charge amount in rupees (paise ÷ 100), as confirmed by the gateway. */
  amountInRupees: number;
}

@Injectable({ providedIn: 'root' })
export class RazorpayService {
  private readonly http = inject(HttpClient);

  /** KEY_ID only — safe to expose in the browser. Never send KeySecret to the frontend. */
  private readonly keyId = 'rzp_test_Tfq0iv9Bla07Du';

  // ── HTTP helpers ─────────────────────────────────────────────────────────

  createOrder(request: CreateOrderRequest): Observable<CreateOrderResponse> {
    return this.http.post<CreateOrderResponse>(
      `${API_BASE_URL}/api/payments/create-order`,
      request,
    );
  }

  verifyPayment(request: VerifyPaymentRequest): Observable<VerifyPaymentResponse> {
    return this.http.post<VerifyPaymentResponse>(
      `${API_BASE_URL}/api/payments/verify-payment`,
      request,
    );
  }

  // ── Main entry point ─────────────────────────────────────────────────────

  /**
   * Full Razorpay checkout flow:
   * 1. Creates a backend order for the given amount (in rupees → converted to paise).
   * 2. Opens the Razorpay modal.
   * 3. On success, calls the backend to verify the signature.
   * 4. Resolves with CheckoutResult so the caller can proceed to place the bid.
   *
   * Rejects on: order creation failure, modal dismiss, payment failure, or signature mismatch.
   */
  async checkout(params: {
    amountInRupees: number;
    email: string;
    description?: string;
  }): Promise<CheckoutResult> {
    const amountInPaise = Math.round(params.amountInRupees * 100);

    if (amountInPaise < 100) {
      throw new Error(`Amount must be at least ₹1. Got ₹${params.amountInRupees}.`);
    }

    // Step 1: create backend order
    const order = await firstValueFrom(
      this.createOrder({
        amountInPaise,
        currency: 'INR',
        receipt: `bid_${Date.now()}`,
      }),
    );

    // Step 2: open modal and wait for success / dismiss / failure
    const paymentResult = await this.openModal({
      keyId: this.keyId,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      email: params.email,
      description: params.description ?? 'Bid payment',
    });

    // Step 3: verify signature server-side
    const verification = await firstValueFrom(
      this.verifyPayment({
        razorpayOrderId: paymentResult.razorpay_order_id,
        razorpayPaymentId: paymentResult.razorpay_payment_id,
        razorpaySignature: paymentResult.razorpay_signature,
      }),
    );

    if (!verification.verified) {
      throw new Error('Payment signature verification failed. Please contact support.');
    }

    return {
      razorpayPaymentId: paymentResult.razorpay_payment_id,
      razorpayOrderId: paymentResult.razorpay_order_id,
      razorpaySignature: paymentResult.razorpay_signature,
      amountInRupees: params.amountInRupees,
    };
  }

  // ── Private: modal wrapper ────────────────────────────────────────────────

  private openModal(opts: {
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    email: string;
    description: string;
  }): Promise<RazorpaySuccessResponse> {
    return new Promise((resolve, reject) => {
      const rzp = new window.Razorpay({
        key: opts.keyId,
        amount: opts.amount,
        currency: opts.currency,
        name: 'RankIt',
        description: opts.description,
        order_id: opts.orderId,
        prefill: { email: opts.email },
        theme: { color: '#6366f1' },
        handler: (response) => resolve(response),
        modal: {
          ondismiss: () => reject(new Error('Payment cancelled.')),
        },
      });

      rzp.on('payment.failed', (response) => {
        reject(
          new Error(
            response.error?.description ?? 'Payment failed. Please try again.',
          ),
        );
      });

      rzp.open();
    });
  }
}
