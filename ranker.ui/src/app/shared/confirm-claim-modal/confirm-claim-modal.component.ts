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
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, filter, firstValueFrom, of, Subject, switchMap } from 'rxjs';
import { ModalService } from '../../core/services/modal.service';
import { BidService } from '../../core/services/bid.service';
import { CategoryService } from '../../core/services/category.service';
import { ListingService } from '../../core/services/listing.service';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { UrlMetadataService } from '../../core/services/url-metadata.service';
import { ToastService } from '../../core/services/toast.service';
import { RazorpayService } from '../../core/services/razorpay.service';
import { CategoryDto } from '../../core/models/category.model';

@Component({
  selector: 'app-confirm-claim-modal',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe],
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
    if (!this.listingName().trim()) return false;
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
      this.domainUrl.set(payload.listingUrl || '');
      this.listingName.set(payload.listingName || '');
      this.ownerEmail.set('');
      this.existingBidAmount.set(payload.currentBidAmount ?? 0);
      this.listingId.set(payload.listingId ?? null);
      this.isRebid.set(payload.listingId !== null || (payload.currentBidAmount ?? 0) > 0);
      this.currentTopBid.set(payload.currentTopBid ?? null);
      this.minStartingBid.set(payload.minStartingBid);
      this.minBidIncrement.set(payload.minBidIncrement);
      this.siteName.set(payload.siteName ?? null);
      this.logoUrl.set(payload.logoUrl ?? null);
      this.description.set(payload.description ?? null);
      this.faviconUrl.set(payload.faviconUrl ?? null);
      this.submitting.set(false);
      this.quoteValidating.set(false);
      this.quoteError.set(null);

      // Refresh benchmark & verify domain if URL already provided
      if (payload.listingUrl) {
        this.triggerDomainLookup(payload.categoryId, payload.listingUrl);
      }
      this.loadCategoryBenchmarks(payload.categoryId, payload.categorySlug);

      // Default target amount
      const minReq = payload.currentTopBid !== null && payload.currentTopBid !== undefined
        ? payload.currentTopBid + payload.minBidIncrement
        : payload.minStartingBid;
      const initialTarget = Math.max(payload.amount || minReq, minReq);
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
            if (currentUrl.length > 5 && !this.listingName()) {
              this.urlMetadataService.fetch(currentUrl).subscribe((meta) => {
                if (meta.siteName && !this.listingName()) {
                  this.listingName.set(meta.siteName);
                }
                if (meta.siteName) this.siteName.set(meta.siteName);
                if (meta.logoUrl) this.logoUrl.set(meta.logoUrl);
                if (meta.description) this.description.set(meta.description);
                if (meta.faviconUrl) this.faviconUrl.set(meta.faviconUrl);
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

  protected close(): void {
    if (this.submitting() || this.quoteValidating()) return;
    this.modal.closeClaimModal();
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

      // Step 2: Open Razorpay for the exact net charge amount
      const payment = await this.razorpay.checkout({
        amountInRupees: chargeAmount,
        email: email,
        description: this.isRebid()
          ? `Raise bid to ₹${target} (Paid ₹${chargeAmount}) for ${quote.listingName || this.listingName()}`
          : `Claim rank with ₹${target} for ${this.listingName()}`,
      });

      // Step 3: Place bid with matching targetBidAmount and confirmedPaymentAmount
      this.bidService
        .placeBid({
          categoryId,
          listingId: quote.listingId ?? this.listingId(),
          listingName: this.listingName() || quote.listingName || null,
          listingUrl: domain,
          ownerContactEmail: email,
          targetBidAmount: quote.targetBidAmount,
          paymentReference: payment.razorpayPaymentId,
          confirmedPaymentAmount: payment.amountInRupees,
          siteName: this.siteName() ?? payload?.siteName ?? null,
          logoUrl: this.logoUrl() ?? payload?.logoUrl ?? null,
          description: this.description() ?? payload?.description ?? null,
          faviconUrl: this.faviconUrl() ?? payload?.faviconUrl ?? null,
        })
        .subscribe({
          next: (result) => {
            this.submitting.set(false);
            if (result.success) {
              this.toast.show(
                `🎉 Success! New bid: ₹${result.newCurrentBidAmount} (Amount paid: ₹${result.amountCharged})`,
                'success',
              );
              this.modal.closeClaimModal();
              if (payload?.onSuccess) payload.onSuccess();
            } else {
              this.toast.show(result.errorMessage ?? 'Bid rejected.', 'error');
            }
          },
          error: (err) => {
            this.submitting.set(false);
            const msg = err.error?.errorMessage || err.message || 'Something went wrong placing your bid.';
            this.toast.show(msg, 'error');
          },
        });
    } catch (err: unknown) {
      this.submitting.set(false);
      this.quoteValidating.set(false);
      const message = err instanceof Error ? err.message : 'Payment was not completed.';
      this.toast.show(message, 'error');
    }
  }
}
