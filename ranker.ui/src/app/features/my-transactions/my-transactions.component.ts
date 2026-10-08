import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { DodoPaymentsService } from '../../core/services/dodo-payments.service';
import { SeoService } from '../../core/services/seo.service';
import { PaymentTransactionItem } from '../../core/models/payment.model';

@Component({
  selector: 'app-my-transactions',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe, FormsModule],
  templateUrl: './my-transactions.component.html',
  styleUrl: './my-transactions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyTransactionsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly dodoPayments = inject(DodoPaymentsService);
  private readonly seo = inject(SeoService);
  private readonly titleService = inject(Title);

  readonly email = signal('');
  readonly transactions = signal<PaymentTransactionItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searched = signal(false);

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'My Payment Transactions | RankUp',
      description:
        'Look up your pending, failed, or cancelled payment attempts by email.',
      url: 'https://rankup.cyou/my-transactions',
    });

    this.route.queryParamMap.subscribe((params) => {
      const emailParam = params.get('email');
      if (emailParam) {
        this.email.set(emailParam);
        this.search();
      }
    });
  }

  search(): void {
    if (!this.email().trim()) {
      this.error.set('Please enter an email address to look up your transactions.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.searched.set(false);

    this.dodoPayments.getTransactions(this.email().trim()).subscribe({
      next: (res) => {
        this.transactions.set(res);
        this.searched.set(true);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(
          this.dodoPayments.describeHttpError(err, 'Failed to load transactions.'),
        );
        this.loading.set(false);
      },
    });
  }

  statusLabel(status: string | null): string {
    if (!status) return 'Unknown';
    const map: Record<string, string> = {
      succeeded: 'Succeeded',
      success: 'Succeeded',
      pending: 'Pending',
      failed: 'Failed',
      cancelled: 'Cancelled',
      canceled: 'Cancelled',
      processing: 'Processing',
      refunded: 'Refunded',
    };
    return map[status.toLowerCase()] ?? status;
  }

  statusClass(status: string | null): string {
    if (!status) return 'status-chip status--unknown';
    const lower = status.toLowerCase();
    if (lower === 'succeeded' || lower === 'success') return 'status-chip status--success';
    if (lower === 'pending' || lower === 'processing') return 'status-chip status--pending';
    if (lower === 'failed') return 'status-chip status--failed';
    if (lower === 'cancelled' || lower === 'canceled') return 'status-chip status--cancelled';
    return 'status-chip status--unknown';
  }

  truncateId(id: string | null): string {
    if (!id) return '—';
    return id.length > 12 ? id.slice(0, 12) + '...' : id;
  }
}
