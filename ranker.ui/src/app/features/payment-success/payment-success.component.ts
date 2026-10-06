import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
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

  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly verification = signal<VerifyPaymentResponse | null>(null);

  readonly paymentId = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly email = signal<string | null>(null);
  readonly copied = signal<boolean>(false);
  readonly now = new Date();

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const pid = params.get('payment_id') || undefined;
      const st = params.get('status') || undefined;
      const em = params.get('email') || undefined;
      const sid = params.get('session_id') || params.get('sessionId') || undefined;

      if (pid) this.paymentId.set(pid);
      if (st) this.status.set(st);
      if (em) this.email.set(em);

      if (pid || sid) {
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
