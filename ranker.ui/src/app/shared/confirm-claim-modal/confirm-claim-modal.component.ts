import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { ModalService } from '../../core/services/modal.service';
import { BidService } from '../../core/services/bid.service';
import { ToastService } from '../../core/services/toast.service';
import { RazorpayService } from '../../core/services/razorpay.service';

@Component({
  selector: 'app-confirm-claim-modal',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe],
  templateUrl: './confirm-claim-modal.component.html',
  styleUrl: './confirm-claim-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmClaimModalComponent {
  protected readonly modal = inject(ModalService);
  private readonly bidService = inject(BidService);
  private readonly toast = inject(ToastService);
  private readonly razorpay = inject(RazorpayService);

  // ── Form state ─────────────────────────────────────────────
  protected readonly agreed = signal(false);
  protected readonly listingId = signal<number | null>(null);
  protected readonly listingName = signal('');
  protected readonly listingUrl = signal('');
  protected readonly ownerEmail = signal('');
  protected readonly targetAmount = signal<number | null>(null);
  protected readonly submitting = signal(false);

  protected readonly isRebid = computed(() => this.listingId() !== null);

  protected readonly title = computed(() =>
    this.isRebid()
      ? `✏️ Raise bid for "${this.listingName()}"`
      : '🆕 Claim a rank',
  );

  constructor() {
    // Reset form state every time the modal opens with a new payload.
    effect(() => {
      const payload = this.modal.claimModal();
      if (!payload) return;
      this.agreed.set(false);
      this.listingId.set(payload.listingId);
      this.listingName.set(payload.listingName);
      this.listingUrl.set(payload.listingUrl);
      this.ownerEmail.set('');
      this.targetAmount.set(payload.amount);
      this.submitting.set(false);
    });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.modal.closeClaimModal();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }

  protected switchMode(): void {
    const payload = this.modal.claimModal();
    if (!payload) return;
    if (this.isRebid()) {
      // Switch to new listing mode
      this.listingId.set(null);
      this.listingName.set('');
      this.listingUrl.set('');
    } else {
      // Restore original listing from payload
      this.listingId.set(payload.listingId);
      this.listingName.set(payload.listingName);
      this.listingUrl.set(payload.listingUrl);
    }
  }

  // ── Checkout ───────────────────────────────────────────────

  protected async proceedToCheckout(): Promise<void> {
    debugger;
    const payload = this.modal.claimModal();
    const amount = this.targetAmount();

    if (!payload || amount === null || !this.ownerEmail()) {
      this.toast.show('Please fill in your email and target bid amount.', 'error');
      return;
    }

    if (!this.isRebid() && (!this.listingName().trim() || !this.listingUrl().trim())) {
      this.toast.show('Please provide a listing name and URL.', 'error');
      return;
    }

    this.submitting.set(true);

    try {
      const payment = await this.razorpay.checkout({
        amountInRupees: amount,
        email: this.ownerEmail(),
        description: `Bid on ${this.listingName() || 'listing'} in ${payload.categoryName}`,
      });

      this.bidService
        .placeBid({
          categoryId: payload.categoryId,
          listingId: this.listingId(),
          listingName: this.listingName() || null,
          listingUrl: this.listingUrl() || null,
          ownerContactEmail: this.ownerEmail(),
          targetBidAmount: amount,
          paymentReference: payment.razorpayPaymentId,
          confirmedPaymentAmount: payment.amountInRupees,
        })
        .subscribe({
          next: (result) => {
            this.submitting.set(false);
            if (result.success) {
              this.toast.show(`Bid confirmed! New bid: ₹${result.newCurrentBidAmount}`, 'success');
              this.modal.closeClaimModal();
              payload.onSuccess();
            } else {
              this.toast.show(result.errorMessage ?? 'Bid rejected.', 'error');
            }
          },
          error: () => {
            this.submitting.set(false);
            this.toast.show('Something went wrong placing your bid.', 'error');
          },
        });
    } catch (err: unknown) {
      this.submitting.set(false);
      const message = err instanceof Error ? err.message : 'Payment was not completed.';
      this.toast.show(message, 'error');
    }
  }
}
