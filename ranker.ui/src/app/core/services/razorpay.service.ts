import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import {
  CreateOrderRequest,
  CreateOrderResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from '../models/payment.model';
import { RazorpayFailureResponse, RazorpaySuccessResponse } from '../models/razorpay';

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
  private readonly keyId = 'rzp_test_TiMfW1UWvzbfs2';

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
   * 4. Resolves with CheckoutResult so the caller can proceed to place the claim.
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
    let order: CreateOrderResponse;
    try {
      order = await firstValueFrom(
        this.createOrder({
          amountInPaise,
          currency: 'INR',
          receipt: `claim_${Date.now()}`,
        }),
      );
    } catch (err) {
      throw new Error(this.describeHttpError(err, 'Could not create payment order.'));
    }

    // Step 2: open Razorpay modal and wait for success / dismiss / failure
    let paymentResult: RazorpaySuccessResponse;
    try {
      paymentResult = await this.openModal({
        keyId: this.keyId,
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        email: params.email,
        description: params.description ?? 'Claim placement fee',
      });
    } catch (err) {
      // Re-throw as-is — openModal already produces friendly Error messages
      // (cancelled, payment.failed description, etc.)
      throw err instanceof Error ? err : new Error('Payment was not completed.');
    }

    // Step 3: verify signature server-side
    let verification: VerifyPaymentResponse;
    try {
      verification = await firstValueFrom(
        this.verifyPayment({
          razorpayOrderId: paymentResult.razorpay_order_id,
          razorpayPaymentId: paymentResult.razorpay_payment_id,
          razorpaySignature: paymentResult.razorpay_signature,
        }),
      );
    } catch (err) {
      throw new Error(this.describeHttpError(err, 'Payment verification failed.'));
    }

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

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Extracts a human-readable message from an HttpErrorResponse.
   * Falls back to `fallback` when no server message is available.
   */
  private describeHttpError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      // Try the structured error body our backend returns: { error: string, detail?: string }
      const body = err.error as Record<string, string> | null;
      if (body?.['error']) {
        return body['detail'] ? `${body['error']} ${body['detail']}` : body['error'];
      }
      if (err.status === 401) return 'Payment gateway authentication failed. Please contact support.';
      if (err.status === 0) return 'Could not reach the server. Check your connection.';
      return `${fallback} (${err.status})`;
    }
    return err instanceof Error ? err.message : fallback;
  }

  // ── Private: dynamic script loader & modal wrapper ────────────────────────

  private scriptPromise: Promise<void> | null = null;

  /**
   * Lazily loads the Razorpay Standard Checkout SDK only when payment is initiated.
   * This eliminates ~311 KiB from initial page load and prevents 3rd-party cookies
   * on landing pages.
   */
  private loadScript(): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('Razorpay checkout can only run in the browser.'));
    }
    if ((window as any).Razorpay) {
      return Promise.resolve();
    }
    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.scriptPromise = null;
        reject(new Error('Failed to load Razorpay payment gateway. Please check your connection.'));
      };
      document.body.appendChild(script);
    });

    return this.scriptPromise;
  }

  private async openModal(opts: {
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    email: string;
    description: string;
  }): Promise<RazorpaySuccessResponse> {
    await this.loadScript();

    return new Promise((resolve, reject) => {
      let settled = false;
      let lastFailureReason: string | null = null;

      const rzp = new window.Razorpay({
        key: opts.keyId,
        amount: opts.amount,
        currency: opts.currency,
        name: 'RankUp',
        description: opts.description,
        order_id: opts.orderId,
        prefill: { email: opts.email },
        theme: { color: '#6366f1' },
        handler: (response: RazorpaySuccessResponse) => {
          settled = true;
          resolve(response);
        },
        modal: {
          ondismiss: () => {
            if (settled) return;
            settled = true;
            if (lastFailureReason) {
              reject(new Error(lastFailureReason));
            } else {
              reject(new Error('Payment cancelled.'));
            }
          },
        },
      });

      rzp.on('payment.failed', (response: RazorpayFailureResponse) => {
        // Record the failure reason in case the user dismisses the modal without a successful payment.
        // DO NOT reject here because Razorpay allows the user to retry payment within the same modal session.
        lastFailureReason = response.error?.description ?? 'Payment failed. Please try again.';
      });

      rzp.open();
    });
  }
}
