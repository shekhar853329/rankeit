import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, filter, firstValueFrom, of, Subject, switchMap } from 'rxjs';
import { ModalService } from '../../core/services/modal.service';
import { BidService } from '../../core/services/bid.service';
import { CategoryService } from '../../core/services/category.service';
import { ListingService } from '../../core/services/listing.service';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { UrlMetadataService } from '../../core/services/url-metadata.service';
import { ToastService } from '../../core/services/toast.service';
import { RazorpayService, CheckoutResult } from '../../core/services/razorpay.service';
import { CategoryDto } from '../../core/models/category.model';

export interface CompletedTransactionDetails {
  success: boolean;
  paymentId?: string;
  orderId?: string;
  amountPaid?: number;
  newBidAmount?: number;
  targetBidAmount?: number;
  categoryName: string;
  listingName: string;
  listingUrl: string;
  errorMessage?: string;
  timestamp: Date;
}

@Component({
  selector: 'app-confirm-claim-modal',
  standalone: true,
  imports: [FormsModule, DecimalPipe, DatePipe],
  templateUrl: './confirm-claim-modal.component.html',
  styleUrl: './confirm-claim-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmClaimModalComponent implements OnInit {
  protected readonly modal = inject(ModalService);
  private readonly bidService = inject(BidService);
  private readonly categoryService = inject(CategoryService);
  private readonly listingService = inject(ListingService);
  private readonly leaderboardService = inject(LeaderboardService);
  private readonly urlMetadataService = inject(UrlMetadataService);
  private readonly toast = inject(ToastService);
  private readonly razorpay = inject(RazorpayService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Form State ─────────────────────────────────────────────
  protected readonly agreed = signal(false);
  protected readonly selectedCategoryId = signal<number>(1);
  protected readonly selectedCategoryName = signal<string>('');
  protected readonly domainUrl = signal<string>('');
  protected readonly listingName = signal<string>('');
  protected readonly ownerEmail = signal<string>('');
  protected readonly targetAmount = signal<number | null>(null);

  // Metadata
  protected readonly siteName = signal<string | null>(null);
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly description = signal<string | null>(null);
  protected readonly faviconUrl = signal<string | null>(null);

  // Dynamic identification state
  protected readonly isRebid = signal<boolean>(false);
  protected readonly listingId = signal<number | null>(null);
  protected readonly existingBidAmount = signal<number>(0);
  protected readonly matchedRank = signal<number | null>(null);
  protected readonly maskedOwnerEmail = signal<string | null>(null);
  protected readonly checkingDomain = signal<boolean>(false);

  // Benchmarks for selected category
  protected readonly currentTopBid = signal<number | null>(null);
  protected readonly minStartingBid = signal<number>(1);
  protected readonly minBidIncrement = signal<number>(1);

  // Categories list
  protected readonly categories = signal<CategoryDto[]>([]);
  protected readonly loadingCategories = signal<boolean>(false);

  // Submission / Quote states
  protected readonly submitting = signal(false);
  protected readonly quoteValidating = signal(false);
  protected readonly quoteError = signal<string | null>(null);

  // Transaction completion states
  protected readonly transactionStatus = signal<'idle' | 'processing' | 'success' | 'failed'>('idle');
  protected readonly transactionDetails = signal<CompletedTransactionDetails | null>(null);
  protected readonly copied = signal(false);

  // Stream for debounced domain/category lookup
  private readonly domainChange$ = new Subject<{ categoryId: number; url: string }>();

  // ── Computeds ──────────────────────────────────────────────
  protected readonly creditedAmount = computed(() =>
    this.isRebid() ? this.existingBidAmount() : 0,
  );

  // Minimum required to claim Rank #1
  protected readonly minRank1Bid = computed(() => {
    const top = this.currentTopBid();
    const inc = this.minBidIncrement();
    const start = this.minStartingBid();
    return top !== null && top !== undefined ? top + inc : start;
  });

  // Minimum bid allowed to enter this arena or raise bid
  protected readonly absoluteMinimumBid = computed(() => {
    if (this.isRebid()) {
      return this.existingBidAmount() + this.minBidIncrement();
    }
    return 1;
  });

  protected readonly payableAmount = computed(() => {
    const target = this.targetAmount() ?? 0;
    const credit = this.creditedAmount();
    return Math.max(0, Math.round((target - credit) * 100) / 100);
  });

  protected readonly isBelowMinimum = computed(() => {
    const target = this.targetAmount();
    if (target === null || target === undefined) return false;
    return target < this.absoluteMinimumBid();
  });

  protected readonly isBelowRank1 = computed(() => {
    const target = this.targetAmount();
    if (target === null || target === undefined) return false;
    return target < this.minRank1Bid();
  });

  protected readonly isNotHigherThanExisting = computed(() => {
    if (!this.isRebid()) return false;
    const target = this.targetAmount();
    if (target === null || target === undefined) return false;
    return target <= this.existingBidAmount();
  });

  protected readonly isFormValid = computed(() => {
    if (!this.agreed()) return false;
    if (!this.ownerEmail().trim()) return false;
    if (!this.domainUrl().trim()) return false;
    const target = this.targetAmount();
    if (target === null || target <= 0) return false;
    if (this.payableAmount() < 1) return false;
    if (this.isBelowMinimum()) return false;
    if (this.isNotHigherThanExisting()) return false;
    if (!this.listingName().trim() && !this.domainUrl().trim()) return false;
    return true;
  });

  constructor() {
    // Reset state every time modal opens with payload
    effect(() => {
      const payload = this.modal.claimModal();
      if (!payload) return;

      this.agreed.set(false);
      this.selectedCategoryId.set(payload.categoryId);
      this.selectedCategoryName.set(payload.categoryName);
      const url = payload.listingUrl || '';
      const fallbackTitle = payload.listingName?.trim() || payload.siteName?.trim() || url.trim();
      this.domainUrl.set(url);
      this.listingName.set(fallbackTitle);
      this.ownerEmail.set('');
      this.existingBidAmount.set(payload.currentBidAmount ?? 0);
      this.listingId.set(payload.listingId ?? null);
      this.isRebid.set(payload.listingId !== null || (payload.currentBidAmount ?? 0) > 0);
      this.currentTopBid.set(payload.currentTopBid ?? null);
      this.minStartingBid.set(payload.minStartingBid);
      this.minBidIncrement.set(payload.minBidIncrement);
      this.siteName.set(payload.siteName?.trim() || (fallbackTitle || null));
      this.logoUrl.set(payload.logoUrl ?? null);
      this.description.set(payload.description ?? null);
      this.faviconUrl.set(payload.faviconUrl ?? null);
      this.submitting.set(false);
      this.quoteValidating.set(false);
      this.quoteError.set(null);
      this.transactionStatus.set('idle');
      this.transactionDetails.set(null);
      this.copied.set(false);

      // Refresh benchmark & verify domain if URL already provided
      if (payload.listingUrl) {
        this.triggerDomainLookup(payload.categoryId, payload.listingUrl);
      }
      this.loadCategoryBenchmarks(payload.categoryId, payload.categorySlug);

      // Default target amount
      const minReq = payload.currentTopBid !== null && payload.currentTopBid !== undefined
        ? payload.currentTopBid + payload.minBidIncrement
        : payload.minStartingBid;
      const initialTarget = payload.amount !== undefined && payload.amount !== null && payload.amount > 0
        ? payload.amount
        : minReq;
      this.targetAmount.set(initialTarget);
    });
  }

  ngOnInit(): void {
    // Load all categories for dropdown
    this.loadingCategories.set(true);
    this.categoryService.getCategories({ pageSize: 100 }).subscribe({
      next: (res) => {
        this.categories.set(res.items);
        this.loadingCategories.set(false);
      },
      error: () => this.loadingCategories.set(false),
    });

    // Reactive domain & category lookup stream
    this.domainChange$
      .pipe(
        debounceTime(350),
        distinctUntilChanged((a, b) => a.categoryId === b.categoryId && a.url.trim() === b.url.trim()),
        filter(({ url }) => url.trim().length > 3),
        switchMap(({ categoryId, url }) => {
          this.checkingDomain.set(true);
          return this.listingService.lookupListing(categoryId, url);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (lookup) => {
          this.checkingDomain.set(false);
          if (lookup.found && lookup.listingId) {
            // Existing listing identified!
            this.isRebid.set(true);
            this.listingId.set(lookup.listingId);
            this.existingBidAmount.set(lookup.currentBidAmount);
            this.matchedRank.set(lookup.currentRankInCategory);
            this.maskedOwnerEmail.set(lookup.ownerContactEmailMasked);
            if (!this.listingName() && lookup.listingName) {
              this.listingName.set(lookup.listingName);
            }
            if (lookup.siteName) this.siteName.set(lookup.siteName);
            if (lookup.logoUrl) this.logoUrl.set(lookup.logoUrl);
            if (lookup.description) this.description.set(lookup.description);
            if (lookup.faviconUrl) this.faviconUrl.set(lookup.faviconUrl);

            // Ensure target is above current bid
            const nextTarget = lookup.currentBidAmount + this.minBidIncrement();
            if ((this.targetAmount() ?? 0) < nextTarget) {
              this.targetAmount.set(nextTarget);
            }
          } else {
            // Brand-new listing
            this.isRebid.set(false);
            this.listingId.set(null);
            this.existingBidAmount.set(0);
            this.matchedRank.set(null);
            this.maskedOwnerEmail.set(null);

            // Scrape URL metadata if listing name is empty
            const currentUrl = this.domainUrl().trim();
            if (currentUrl.length > 5) {
              this.urlMetadataService.fetch(currentUrl).subscribe((meta) => {
                if (meta?.siteName?.trim()) {
                  this.listingName.set(meta.siteName.trim());
                  this.siteName.set(meta.siteName.trim());
                } else if (!this.listingName().trim()) {
                  this.listingName.set(currentUrl);
                  this.siteName.set(currentUrl);
                }
                if (meta?.logoUrl) this.logoUrl.set(meta.logoUrl);
                if (meta?.description) this.description.set(meta.description);
                if (meta?.faviconUrl) this.faviconUrl.set(meta.faviconUrl);
              });
            }
          }
        },
        error: () => this.checkingDomain.set(false),
      });
  }

  protected onDomainInput(val: string): void {
    this.domainUrl.set(val);
    this.quoteError.set(null);
    this.triggerDomainLookup(this.selectedCategoryId(), val);
  }

  protected onCategorySelectChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const catId = Number(select.value);
    const cat = this.categories().find((c) => c.id === catId);
    if (cat) {
      this.selectedCategoryId.set(cat.id);
      this.selectedCategoryName.set(cat.name);
      this.minStartingBid.set(cat.minStartingBid);
      this.minBidIncrement.set(cat.minBidIncrement);
      this.loadCategoryBenchmarks(cat.id, cat.slug);
      this.triggerDomainLookup(cat.id, this.domainUrl());
    }
  }

  private triggerDomainLookup(categoryId: number, url: string): void {
    if (!url || url.trim().length < 3) {
      this.isRebid.set(false);
      this.listingId.set(null);
      this.existingBidAmount.set(0);
      this.matchedRank.set(null);
      return;
    }
    this.domainChange$.next({ categoryId, url });
  }

  private loadCategoryBenchmarks(categoryId: number, slug?: string): void {
    const s = slug || this.categories().find((c) => c.id === categoryId)?.slug;
    if (!s) return;
    this.leaderboardService.getCategoryLeaderboard(s, 1, 5, 'alltime').subscribe({
      next: (res) => {
        this.minStartingBid.set(res.minStartingBid);
        this.minBidIncrement.set(res.minBidIncrement);
        const top = res.leaderboard.items[0]?.currentBidAmount ?? null;
        this.currentTopBid.set(top);
      },
    });
  }

  protected setRank1Target(): void {
    this.targetAmount.set(this.minRank1Bid());
    this.quoteError.set(null);
  }

  protected addIncrement(amount: number): void {
    const current = this.targetAmount() ?? this.minRank1Bid();
    this.targetAmount.set(current + amount);
    this.quoteError.set(null);
  }

  protected subtractIncrement(amount: number): void {
    const current = this.targetAmount() ?? this.minRank1Bid();
    const floor = this.absoluteMinimumBid();
    this.targetAmount.set(Math.max(floor, current - amount));
    this.quoteError.set(null);
  }

  protected close(): void {
    if (this.transactionStatus() === 'processing') return;
    if (this.transactionStatus() === 'success') {
      this.finishSuccess();
      return;
    }
    if (this.submitting() || this.quoteValidating()) return;
    this.modal.closeClaimModal();
  }

  protected finishSuccess(): void {
    const payload = this.modal.claimModal();
    this.modal.closeClaimModal();
    if (payload?.onSuccess) {
      payload.onSuccess();
    }
  }

  protected retryPayment(): void {
    this.transactionStatus.set('idle');
    this.transactionDetails.set(null);
    this.submitting.set(false);
    this.quoteValidating.set(false);
    this.quoteError.set(null);
  }

  protected copyPaymentId(id: string): void {
    if (typeof navigator !== 'undefined' && navigator?.clipboard) {
      navigator.clipboard.writeText(id).then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      });
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }

  // ── Checkout ───────────────────────────────────────────────

  protected async proceedToCheckout(): Promise<void> {
    const payload = this.modal.claimModal();
    const target = this.targetAmount();
    const email = this.ownerEmail().trim();
    const domain = this.domainUrl().trim();
    const categoryId = this.selectedCategoryId();

    if (!target || !email || !domain) {
      this.toast.show('Please fill in domain, email, and target bid.', 'error');
      return;
    }

    if (!this.isFormValid()) {
      return;
    }

    this.submitting.set(true);
    this.quoteValidating.set(true);
    this.quoteError.set(null);

    try {
      // Step 1: Request authoritative server quote and verify rules
      const quote = await firstValueFrom(
        this.bidService.calculateBidQuote({
          categoryId,
          listingId: this.isRebid() ? this.listingId() : null,
          listingUrl: domain,
          ownerContactEmail: email,
          targetBidAmount: target,
        }),
      );

      this.quoteValidating.set(false);

      if (!quote.success) {
        this.submitting.set(false);
        const errMessage = quote.errorMessage || 'Bid calculation failed.';
        this.quoteError.set(errMessage);
        this.toast.show(errMessage, 'error');
        return;
      }

      const chargeAmount = quote.expectedChargeAmount;
      if (chargeAmount < 1) {
        this.submitting.set(false);
        this.quoteError.set('Payable amount must be at least ₹1.00.');
        this.toast.show('Payable amount must be at least ₹1.00.', 'error');
        return;
      }

      const resolvedTitle = this.listingName()?.trim() || quote.listingName?.trim() || this.siteName()?.trim() || domain;
      const resolvedSiteName = this.siteName()?.trim() || payload?.siteName?.trim() || resolvedTitle;
      const resolvedLogoUrl = this.logoUrl() ?? payload?.logoUrl ?? null;
      const resolvedDescription = this.description() ?? payload?.description ?? null;
      const resolvedFaviconUrl = this.faviconUrl() ?? payload?.faviconUrl ?? null;
      const resolvedListingId = quote.listingId ?? this.listingId();

      // Keep confirmation modal pop up open, update state to processing
      this.transactionStatus.set('processing');

      // Step 2: Open Razorpay for the exact net charge amount
      let payment: CheckoutResult;
      try {
        payment = await this.razorpay.checkout({
          amountInRupees: chargeAmount,
          email: email,
          description: this.isRebid()
            ? `Raise bid to ₹${target} (Paid ₹${chargeAmount}) for ${quote.listingName || this.listingName()}`
            : `Claim rank with ₹${target} for ${this.listingName()}`,
        });
      } catch (checkoutErr: unknown) {
        // Return to confirmation modal screen and show failed transaction details
        this.submitting.set(false);
        this.transactionStatus.set('failed');
        const failMsg = checkoutErr instanceof Error ? checkoutErr.message : 'Payment was not completed.';
        this.transactionDetails.set({
          success: false,
          amountPaid: chargeAmount,
          targetBidAmount: target,
          categoryName: this.selectedCategoryName(),
          listingName: resolvedTitle,
          listingUrl: domain,
          errorMessage: failMsg,
          timestamp: new Date(),
        });
        this.toast.show(failMsg, failMsg === 'Payment cancelled.' ? 'info' : 'error');
        return;
      }

      // Step 3: Place bid with matching targetBidAmount and confirmedPaymentAmount
      this.bidService
        .placeBid({
          categoryId,
          listingId: resolvedListingId,
          listingName: resolvedTitle,
          listingUrl: domain,
          ownerContactEmail: email,
          targetBidAmount: quote.targetBidAmount,
          paymentReference: payment.razorpayPaymentId,
          confirmedPaymentAmount: payment.amountInRupees,
          siteName: resolvedSiteName,
          logoUrl: resolvedLogoUrl,
          description: resolvedDescription,
          faviconUrl: resolvedFaviconUrl,
        })
        .subscribe({
          next: (result) => {
            this.submitting.set(false);
            if (result.success) {
              this.transactionStatus.set('success');
              this.transactionDetails.set({
                success: true,
                paymentId: payment.razorpayPaymentId,
                orderId: payment.razorpayOrderId,
                amountPaid: result.amountCharged ?? payment.amountInRupees,
                newBidAmount: result.newCurrentBidAmount ?? target,
                targetBidAmount: target,
                categoryName: this.selectedCategoryName(),
                listingName: resolvedTitle,
                listingUrl: domain,
                timestamp: new Date(),
              });
              this.toast.show(
                `🎉 Success! New bid: ₹${result.newCurrentBidAmount} (Amount paid: ₹${result.amountCharged})`,
                'success',
              );
            } else {
              const errMsg = result.errorMessage ?? 'Bid placement was rejected by server.';
              this.transactionStatus.set('failed');
              this.transactionDetails.set({
                success: false,
                paymentId: payment.razorpayPaymentId,
                orderId: payment.razorpayOrderId,
                amountPaid: payment.amountInRupees,
                targetBidAmount: target,
                categoryName: this.selectedCategoryName(),
                listingName: resolvedTitle,
                listingUrl: domain,
                errorMessage: errMsg,
                timestamp: new Date(),
              });
              this.toast.show(errMsg, 'error');
            }
          },
          error: (err) => {
            this.submitting.set(false);
            const msg = err.error?.errorMessage || err.message || 'Something went wrong placing your bid.';
            this.transactionStatus.set('failed');
            this.transactionDetails.set({
              success: false,
              paymentId: payment.razorpayPaymentId,
              orderId: payment.razorpayOrderId,
              amountPaid: payment.amountInRupees,
              targetBidAmount: target,
              categoryName: this.selectedCategoryName(),
              listingName: resolvedTitle,
              listingUrl: domain,
              errorMessage: msg,
              timestamp: new Date(),
            });
            this.toast.show(msg, 'error');
          },
        });
    } catch (err: unknown) {
      this.submitting.set(false);
      this.quoteValidating.set(false);
      const message = err instanceof Error ? err.message : 'Calculation error occurred.';
      this.transactionStatus.set('failed');
      this.transactionDetails.set({
        success: false,
        amountPaid: target,
        targetBidAmount: target,
        categoryName: this.selectedCategoryName(),
        listingName: this.listingName() || domain,
        listingUrl: domain,
        errorMessage: message,
        timestamp: new Date(),
      });
      this.toast.show(message, 'error');
    }
  }
}
