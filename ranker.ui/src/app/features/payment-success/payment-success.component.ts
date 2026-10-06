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
      const pid = params.get('payment_id');
      const st = params.get('status');
      const em = params.get('email');
      const sid = params.get('session_id') || params.get('sessionId');

      this.paymentId.set(pid);
      this.status.set(st);
      this.email.set(em);

      if (pid) {
        this.verify(pid);
      } else if (sid) {
        this.dodoPayments.getSessionStatus(sid).subscribe({
          next: (sess) => {
            if (sess.paymentId) {
              this.paymentId.set(sess.paymentId);
              this.verify(sess.paymentId);
            } else {
              this.loading.set(false);
            }
          },
          error: () => this.loading.set(false),
        });
      } else {
        this.loading.set(false);
      }
    });
  }

  private verify(pid: string): void {
    this.loading.set(true);
    this.dodoPayments.verifyPayment(pid).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.verification.set(res);
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
