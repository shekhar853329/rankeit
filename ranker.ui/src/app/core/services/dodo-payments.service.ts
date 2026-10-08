import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import {
  CreateDodoSessionRequest,
  CreateDodoSessionResponse,
  DodoSessionStatusResponse,
  PaymentTransactionItem,
  VerifyPaymentResponse,
} from '../models/payment.model';

@Injectable({ providedIn: 'root' })
export class DodoPaymentsService {
  private readonly http = inject(HttpClient);

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

  getTransactions(email: string): Observable<PaymentTransactionItem[]> {
    return this.http.get<PaymentTransactionItem[]>(
      `${API_BASE_URL}/api/payments/transactions?email=${encodeURIComponent(email)}`,
    );
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
