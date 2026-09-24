import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ModalService } from '../../core/services/modal.service';
import { BidService } from '../../core/services/bid.service';
import { ToastService } from '../../core/services/toast.service';
import { RazorpayService } from '../../core/services/razorpay.service';

@Component({
  selector: 'app-bid-form-modal',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './bid-form-modal.component.html',
  styleUrl: './bid-form-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BidFormModalComponent {
  protected readonly modal = inject(ModalService);
  private readonly bidService = inject(BidService);
  private readonly toast = inject(ToastService);
  private readonly razorpay = inject(RazorpayService);

  // ── Local form state (reset when modal opens) ──────────────
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
      : '🆕 Submit a new listing',
  );

  constructor() {
    // Runs whenever bidFormModal signal changes (new payload object = modal just opened).
    // effect() works independently of OnPush CD, so the form always gets fresh values.
    effect(() => {
      const payload = this.modal.bidFormModal();
      if (!payload) return;
      this.listingId.set(payload.listingId);
      this.listingName.set(payload.listingName);
      this.listingUrl.set(payload.listingUrl);
      this.ownerEmail.set('');
      this.targetAmount.set(payload.prefillAmount);
      this.submitting.set(false);
    });
  }

  protected close(): void {
    if (this.submitting()) return; // don't allow close while payment is in flight
    this.modal.closeBidFormModal();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }

  protected switchMode(): void {
    const payload = this.modal.bidFormModal();
    if (!payload) return;
    if (this.isRebid()) {
      // Switch to new listing
      this.listingId.set(null);
      this.listingName.set('');
      this.listingUrl.set('');
    } else {
      // Reset to the payload's original listing (if any)
      this.listingId.set(payload.listingId);
      this.listingName.set(payload.listingName);
      this.listingUrl.set(payload.listingUrl);
    }
  }

  // ── Checkout ───────────────────────────────────────────────

  protected async proceedToCheckout(): Promise<void> {
    const payload = this.modal.bidFormModal();
    const amount = this.targetAmount();

    if (!payload || amount === null || !this.ownerEmail()) {
      this.toast.show('Please fill in your email and target bid amount.', 'error');
      return;
    }

    if (!this.isRebid() && (!this.listingName().trim() || !this.listingUrl().trim())) {
      this.toast.show('Please provide a listing name and URL for a new listing.', 'error');
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
              this.modal.closeBidFormModal();
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
