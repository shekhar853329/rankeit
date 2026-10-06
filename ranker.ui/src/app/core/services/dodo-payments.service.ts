import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import {
  CreateDodoSessionRequest,
  CreateDodoSessionResponse,
  DodoSessionStatusResponse,
  VerifyPaymentResponse,
} from '../models/payment.model';
import { DodoPayments, CheckoutEvent, CheckoutBreakdownData } from 'dodopayments-checkout';

export interface TerminalEventCallbacks {
  onOpened?: () => void;
  onFormReady?: () => void;
  onBreakdown?: (data: CheckoutBreakdownData) => void;
  onPayClicked?: () => void;
  onSuccess?: (paymentId?: string) => void;
  onError?: (errorMessage: string) => void;
  onClosed?: () => void;
}

@Injectable({ providedIn: 'root' })
export class DodoPaymentsService {
  private readonly http = inject(HttpClient);
  private currentDisplayType: 'inline' | 'overlay' = 'inline';

  // ── Backend API Endpoints ──────────────────────────────────────────────────

  createSession(request: CreateDodoSessionRequest): Observable<CreateDodoSessionResponse> {
    return this.http.post<CreateDodoSessionResponse>(
      `${API_BASE_URL}/api/payments/dodo/create-session`,
      request,
    );
  }

  getSessionStatus(sessionId: string): Observable<DodoSessionStatusResponse> {
    return this.http.get<DodoSessionStatusResponse>(
      `${API_BASE_URL}/api/payments/dodo/status/${encodeURIComponent(sessionId)}`,
    );
  }

  verifyPayment(paymentId: string): Observable<VerifyPaymentResponse> {
    return this.http.get<VerifyPaymentResponse>(
      `${API_BASE_URL}/api/payments/dodo/verify/${encodeURIComponent(paymentId)}`,
    );
  }

  verifyPaymentPost(request: { paymentId?: string; sessionId?: string }): Observable<VerifyPaymentResponse> {
    return this.http.post<VerifyPaymentResponse>(
      `${API_BASE_URL}/api/payments/dodo/verify`,
      request,
    );
  }


  // ── Terminal Management ───────────────────────────────────────────────────

  /**
   * Initializes and opens the Dodo Payment Terminal.
   * If elementId is provided, renders inline into the specified container.
   * Otherwise, opens as an overlay modal.
   */
  async openTerminal(params: {
    checkoutUrl: string;
    sessionId?: string;
    elementId?: string;
    displayType?: 'inline' | 'overlay';
    callbacks?: TerminalEventCallbacks;
  }): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('Dodo Payments Terminal can only run in the browser.');
    }

    const displayType = params.displayType ?? (params.elementId ? 'inline' : 'overlay');

    // Close any prior session to ensure clean state
    try {
      if (DodoPayments.Checkout.isOpen()) {
        DodoPayments.Checkout.close();
      }
    } catch {
      // Ignore if not open
    }

    this.currentDisplayType = displayType;

    DodoPayments.Initialize({
      mode: 'test',
      displayType: displayType,
      onEvent: (event: CheckoutEvent) => {
        console.log('[Dodo Payments Terminal Event]', event.event_type, event.data);

        switch (event.event_type) {
          case 'checkout.opened':
            params.callbacks?.onOpened?.();
            break;

          case 'checkout.form_ready':
            params.callbacks?.onFormReady?.();
            break;

          case 'checkout.breakdown':
            if (event.data?.['message']) {
              params.callbacks?.onBreakdown?.(event.data['message'] as CheckoutBreakdownData);
            }
            break;

          case 'checkout.pay_button_clicked':
            params.callbacks?.onPayClicked?.();
            break;

          case 'checkout.status': {
            const status = event.data?.['status'] as string | undefined;
            const paymentId = (event.data?.['payment_id'] ?? event.data?.['paymentId']) as string | undefined;
            if (status === 'succeeded' || paymentId) {
              params.callbacks?.onSuccess?.(paymentId);
            }
            break;
          }

          case 'checkout.redirect':
          case 'checkout.redirect_requested': {
            const redirPaymentId = (event.data?.['payment_id'] ?? event.data?.['paymentId']) as string | undefined;
            params.callbacks?.onSuccess?.(redirPaymentId);
            break;
          }

          case 'checkout.closed':
            params.callbacks?.onClosed?.();
            break;

          case 'checkout.error': {
            const err = typeof event.data?.['message'] === 'string'
              ? (event.data['message'] as string)
              : 'Payment error encountered.';
            params.callbacks?.onError?.(err);
            break;
          }
        }
      },
    });

    DodoPayments.Checkout.open({
      checkoutUrl: params.checkoutUrl,
      elementId: params.elementId,
      options: {
        showTimer: true,
        showSecurityBadge: true,
      },
    });
  }

  /**
   * Programmatically closes the checkout terminal iframe and cleans up.
   */
  closeTerminal(): void {
    if (typeof window === 'undefined') return;
    try {
      DodoPayments.Checkout.close();
    } catch (e) {
      console.warn('Error closing Dodo checkout:', e);
    }
  }

  isTerminalOpen(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return DodoPayments.Checkout.isOpen();
    } catch {
      return false;
    }
  }

  // ── Polling & Verification ─────────────────────────────────────────────────

  /**
   * Polls the backend endpoint until the checkout session is marked paid or max attempts reached.
   */
  async pollUntilPaid(
    sessionId: string,
    maxAttempts: number = 30,
    intervalMs: number = 2000,
  ): Promise<DodoSessionStatusResponse> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const status = await firstValueFrom(this.getSessionStatus(sessionId));
        if (status.isPaid || status.paymentStatus === 'succeeded' || status.paymentId) {
          return status;
        }
      } catch (err) {
        console.warn(`[Dodo status check attempt ${attempt + 1}]`, err);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('Payment confirmation timed out. If your funds were deducted, please contact support with your session ID.');
  }

  /**
   * Describes HTTP errors in a human-friendly format.
   */
  describeHttpError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as Record<string, string> | null;
      if (body?.['error']) {
        return body['detail'] ? `${body['error']} ${body['detail']}` : body['error'];
      }
      if (err.status === 401) return 'Payment gateway authentication failed.';
      if (err.status === 0) return 'Could not reach payment server. Check your connection.';
      return `${fallback} (${err.status})`;
    }
    return err instanceof Error ? err.message : fallback;
  }
}
