import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { DodoPaymentsService } from '../../core/services/dodo-payments.service';
import { VerifyPaymentResponse } from '../../core/models/payment.model';

@Component({
  selector: 'app-payment-success',
  standalone: true,
  imports: [RouterLink, DecimalPipe, DatePipe],
  templateUrl: './payment-success.component.html',
  styleUrl: './payment-success.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentSuccessComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly dodoPayments = inject(DodoPaymentsService);
  private readonly titleService = inject(Title);

  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly verification = signal<VerifyPaymentResponse | null>(null);

  readonly paymentId = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly email = signal<string | null>(null);
  readonly copied = signal<boolean>(false);
  readonly now = new Date();

  // From-URL for "Try Again" navigation — sanitized to only allow relative paths
  readonly fromUrl = signal<string>('/');

  // Link to the listing/leaderboard after a successful placement
  readonly leaderboardLink = signal<string>('/');

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const pid = params.get('payment_id') || undefined;
      const st = params.get('status') || undefined;
      const em = params.get('email') || undefined;
      const sid = params.get('session_id') || params.get('sessionId') || undefined;
      const from = params.get('from') || '';

      if (pid) this.paymentId.set(pid);
      if (st) this.status.set(st);
      if (em) this.email.set(em);

      // Sanitize fromUrl — must start with '/', no protocol-relative or JS URLs
      const safeFrom = from && from.startsWith('/') && !from.startsWith('//') && !from.toLowerCase().includes('javascript:')
        ? from
        : '/';
      this.fromUrl.set(safeFrom);

      // Set browser tab title based on status
      const titleMap: Record<string, string> = {
        succeeded: 'Payment Confirmed | RankIt',
        cancelled: 'Payment Cancelled | RankIt',
        failed: 'Payment Failed | RankIt',
      };
      this.titleService.setTitle(st ? (titleMap[st] ?? 'Payment | RankIt') : 'Payment | RankIt');

      // Only verify when payment actually succeeded (or no status = legacy flow)
      if (st === 'cancelled' || st === 'failed') {
        this.loading.set(false);
      } else if (pid || sid) {
        this.verify(pid, sid);
      } else {
        this.loading.set(false);
      }
    });
  }

  private verify(pid?: string, sid?: string): void {
    this.loading.set(true);
    this.dodoPayments.verifyPaymentPost({ paymentId: pid, sessionId: sid }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.verification.set(res);
        if (res.paymentId) {
          this.paymentId.set(res.paymentId);
        }
        if (!res.verified && res.error) {
          this.error.set(res.error);
        }
        // Build leaderboard/listing link from verify response
        const link = res.listingId ? `/listings/${res.listingId}` : '/';
        this.leaderboardLink.set(link);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = this.dodoPayments.describeHttpError(err, 'Failed to verify payment status.');
        this.error.set(msg);
      },
    });
  }

  copyPaymentId(): void {
    const id = this.paymentId();
    if (!id) return;
    navigator.clipboard?.writeText(id).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
