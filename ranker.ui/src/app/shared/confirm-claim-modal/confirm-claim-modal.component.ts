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
import { DatePipe, DecimalPipe, Location } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, filter, firstValueFrom, Subject, switchMap } from 'rxjs';
import { ModalService } from '../../core/services/modal.service';
import { ClaimService } from '../../core/services/claim.service';
import { CategoryService } from '../../core/services/category.service';
import { ListingService } from '../../core/services/listing.service';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { UrlMetadataService } from '../../core/services/url-metadata.service';
import { ToastService } from '../../core/services/toast.service';
import { DodoPaymentsService } from '../../core/services/dodo-payments.service';
import { CategoryDto } from '../../core/models/category.model';

export interface CompletedTransactionDetails {
  success: boolean;
  paymentId?: string;
  orderId?: string;
  amountPaid?: number;
  newClaimAmount?: number;
  targetClaimAmount?: number;
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
  private readonly claimService = inject(ClaimService);
  private readonly categoryService = inject(CategoryService);
  private readonly listingService = inject(ListingService);
  private readonly leaderboardService = inject(LeaderboardService);
  private readonly urlMetadataService = inject(UrlMetadataService);
  private readonly toast = inject(ToastService);
  private readonly dodoPayments = inject(DodoPaymentsService);
  private readonly location = inject(Location);
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
  protected readonly isReclaim = signal<boolean>(false);
  protected readonly listingId = signal<number | null>(null);
  protected readonly existingClaimAmount = signal<number>(0);
  protected readonly matchedRank = signal<number | null>(null);
  protected readonly maskedOwnerEmail = signal<string | null>(null);
  protected readonly checkingDomain = signal<boolean>(false);

  // Benchmarks for selected category
  protected readonly currentTopClaim = signal<number | null>(null);
  protected readonly minStartingClaim = signal<number>(1);
  protected readonly minClaimIncrement = signal<number>(1);

  // Categories list
  protected readonly categories = signal<CategoryDto[]>([]);
  protected readonly loadingCategories = signal<boolean>(false);

  // Submission / Quote states
  protected readonly submitting = signal(false);
  protected readonly quoteError = signal<string | null>(null);

  // Checkout stage for dynamic button label
  protected readonly checkoutStage = signal<'idle' | 'quoting' | 'creating' | 'redirecting'>('idle');

  // Transaction completion states
  protected readonly transactionStatus = signal<'idle' | 'processing' | 'success' | 'failed'>('idle');
  protected readonly transactionDetails = signal<CompletedTransactionDetails | null>(null);
  protected readonly copied = signal(false);

  // Stream for debounced domain/category lookup
  private readonly domainChange$ = new Subject<{ categoryId: number; url: string }>();

  // ── Computeds ──────────────────────────────────────────────
  protected readonly creditedAmount = computed(() => {
    if (!this.isReclaim()) return 0;
    const payload = this.modal.claimModal();
    if (!payload?.isAllTimeMode) return 0; // today mode: no credit deduction
    return this.existingClaimAmount();
  });

  // Minimum required to claim Rank #1
  protected readonly minRank1Claim = computed(() => {
    const top = this.currentTopClaim();
    const inc = this.minClaimIncrement();
    const start = this.minStartingClaim();
    return top !== null && top !== undefined ? top + inc : start;
  });

  // Minimum claim allowed to enter this arena or raise claim
  protected readonly absoluteMinimumClaim = computed(() => {
    const payload = this.modal.claimModal();
    const isAllTimeMode = payload?.isAllTimeMode ?? false;
    if (this.isReclaim() && isAllTimeMode) {
      // All-time mode: must exceed the cumulative amount already paid
      return this.existingClaimAmount() + this.minClaimIncrement();
    }
    return this.minStartingClaim();
  });

  protected readonly payableAmount = computed(() => {
    const target = this.targetAmount() ?? 0;
    const credit = this.creditedAmount();
    return Math.max(0, Math.round((target - credit) * 100) / 100);
  });

  protected readonly isBelowMinimum = computed(() => {
    const target = this.targetAmount();
    if (target === null || target === undefined) return false;
    return target < this.absoluteMinimumClaim();
  });

  protected readonly isBelowRank1 = computed(() => {
    const target = this.targetAmount();
    if (target === null || target === undefined) return false;
    return target < this.minRank1Claim();
  });

  protected readonly isNotHigherThanExisting = computed(() => {
    if (!this.isReclaim()) return false;
    const payload = this.modal.claimModal();
    // In today mode there is no "existing" score to exceed — user always pays full amount
    if (!payload?.isAllTimeMode) return false;
    const target = this.targetAmount();
    if (target === null || target === undefined) return false;
    return target <= this.existingClaimAmount();
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
      this.existingClaimAmount.set(payload.currentClaimAmount ?? 0);
      this.listingId.set(payload.listingId ?? null);
      this.isReclaim.set(payload.listingId !== null || (payload.currentClaimAmount ?? 0) > 0);
      this.currentTopClaim.set(payload.currentTopClaim ?? null);
      this.minStartingClaim.set(payload.minStartingClaim);
      this.minClaimIncrement.set(payload.minClaimIncrement);
      this.siteName.set(payload.siteName?.trim() || (fallbackTitle || null));
      this.logoUrl.set(payload.logoUrl ?? null);
      this.description.set(payload.description ?? null);
      this.faviconUrl.set(payload.faviconUrl ?? null);
      this.submitting.set(false);
      this.quoteError.set(null);
      this.transactionStatus.set('idle');
      this.transactionDetails.set(null);
      this.copied.set(false);
      this.checkoutStage.set('idle');

      // Refresh benchmark & verify domain if URL already provided
      if (payload.listingUrl) {
        this.triggerDomainLookup(payload.categoryId, payload.listingUrl);
      }
      this.loadCategoryBenchmarks(payload.categoryId, payload.categorySlug);

      // Default target amount
      const minReq =
        payload.currentTopClaim !== null && payload.currentTopClaim !== undefined
          ? payload.currentTopClaim + payload.minClaimIncrement
          : payload.minStartingClaim;
      const initialTarget =
        payload.amount !== undefined && payload.amount !== null && payload.amount > 0
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
            this.isReclaim.set(true);
            this.listingId.set(lookup.listingId);
            this.existingClaimAmount.set(lookup.currentClaimAmount);
            this.matchedRank.set(lookup.currentRankInCategory);
            this.maskedOwnerEmail.set(lookup.ownerContactEmailMasked);
            if (!this.listingName() && lookup.listingName) {
              this.listingName.set(lookup.listingName);
            }
            if (lookup.siteName) this.siteName.set(lookup.siteName);
            if (lookup.logoUrl) this.logoUrl.set(lookup.logoUrl);
            if (lookup.description) this.description.set(lookup.description);
            if (lookup.faviconUrl) this.faviconUrl.set(lookup.faviconUrl);

            // Ensure target is above the effective minimum for the current mode.
            // All-time mode: must exceed the all-time cumulative total already paid.
            // Today mode: the minimum is just absoluteMinimumClaim() (minStartingClaim), not the all-time total.
            const isAllTimeMode = this.modal.claimModal()?.isAllTimeMode ?? false;
            const nextTarget = isAllTimeMode
              ? lookup.currentClaimAmount + this.minClaimIncrement()
              : this.absoluteMinimumClaim();
            if ((this.targetAmount() ?? 0) < nextTarget) {
              this.targetAmount.set(nextTarget);
            }
          } else {
            // Brand-new listing
            this.isReclaim.set(false);
            this.listingId.set(null);
            this.existingClaimAmount.set(0);
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
      this.minStartingClaim.set(cat.minStartingClaim);
      this.minClaimIncrement.set(cat.minClaimIncrement);
      this.loadCategoryBenchmarks(cat.id, cat.slug);
      this.triggerDomainLookup(cat.id, this.domainUrl());
    }
  }

  private triggerDomainLookup(categoryId: number, url: string): void {
    if (!url || url.trim().length < 3) {
      this.isReclaim.set(false);
      this.listingId.set(null);
      this.existingClaimAmount.set(0);
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
        this.minStartingClaim.set(res.minStartingClaim);
        this.minClaimIncrement.set(res.minClaimIncrement);
        const top = res.leaderboard.items[0]?.currentClaimAmount ?? null;
        this.currentTopClaim.set(top);
      },
    });
  }

  protected setRank1Target(): void {
    this.targetAmount.set(this.minRank1Claim());
    this.quoteError.set(null);
  }

  protected addIncrement(amount: number): void {
    const current = this.targetAmount() ?? this.minRank1Claim();
    this.targetAmount.set(current + amount);
    this.quoteError.set(null);
  }

  protected subtractIncrement(amount: number): void {
    const current = this.targetAmount() ?? this.minRank1Claim();
    const floor = this.absoluteMinimumClaim();
    this.targetAmount.set(Math.max(floor, current - amount));
    this.quoteError.set(null);
  }

  protected onTargetAmountInput(val: string): void {
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      const floor = this.absoluteMinimumClaim();
      const inc = this.minClaimIncrement();
      // Snap to nearest valid increment above floor
      const snapped = Math.max(floor, Math.round(parsed / inc) * inc);
      this.targetAmount.set(Math.round(snapped * 100) / 100);
    }
    this.quoteError.set(null);
  }

  protected close(): void {
    if (this.submitting() && this.transactionStatus() === 'processing') return;
    this.modal.closeClaimModal();
  }

  protected finishSuccess(): void {
    const payload = this.modal.claimModal();
    this.modal.closeClaimModal();
    if (payload?.onSuccess) {
      payload.onSuccess();
    }
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
    if (event.key === 'Escape' && !this.submitting()) {
      this.close();
    }
  }

  // ── Checkout ───────────────────────────────────────────────

  protected async proceedToCheckout(): Promise<void> {
    const payload = this.modal.claimModal();
    const target = this.targetAmount();
    const email = this.ownerEmail().trim();
    const domain = this.domainUrl().trim();
    const categoryId = this.selectedCategoryId();

    if (!target || !email || !domain) {
      this.toast.show('Please fill in domain, email, and target placement amount.', 'error');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.quoteError.set('Please enter a valid email address.');
      this.toast.show('Please enter a valid email address.', 'error');
      return;
    }

    if (!this.isFormValid()) {
      return;
    }

    this.submitting.set(true);
    this.checkoutStage.set('quoting');
    this.quoteError.set(null);

    try {
      // Step 1: Request authoritative server quote and verify rules
      const quote = await firstValueFrom(
        this.claimService.calculateClaimQuote({
          categoryId,
          listingId: this.isReclaim() ? this.listingId() : null,
          listingUrl: domain,
          ownerContactEmail: email,
          targetClaimAmount: target,
          isAllTimeMode: payload?.isAllTimeMode ?? false,
        }),
      );

      this.quoteError.set(null);

      if (!quote.success) {
        this.submitting.set(false);
        this.checkoutStage.set('idle');
        const errMessage = quote.errorMessage || 'Placement calculation failed.';
        this.quoteError.set(errMessage);
        this.toast.show(errMessage, 'error');
        return;
      }

      const chargeAmount = quote.expectedChargeAmount;
      if (chargeAmount < 1) {
        this.submitting.set(false);
        this.checkoutStage.set('idle');
        this.quoteError.set('Payable amount must be at least $1.00.');
        this.toast.show('Payable amount must be at least $1.00.', 'error');
        return;
      }

      const resolvedTitle = this.listingName()?.trim() || quote.listingName?.trim() || this.siteName()?.trim() || domain;
      const resolvedSiteName = this.siteName()?.trim() || payload?.siteName?.trim() || resolvedTitle;
      const resolvedLogoUrl = this.logoUrl() ?? payload?.logoUrl ?? null;
      const resolvedDescription = this.description() ?? payload?.description ?? null;
      const resolvedFaviconUrl = this.faviconUrl() ?? payload?.faviconUrl ?? null;
      const resolvedListingId = quote.listingId ?? this.listingId();

      // Step 2: Request Dodo Payments Checkout Session
      this.checkoutStage.set('creating');
      let session: { sessionId: string; checkoutUrl: string };
      try {
        const metadata: Record<string, string> = {
          categoryId: categoryId.toString(),
          listingId: resolvedListingId ? resolvedListingId.toString() : '',
          listingName: resolvedTitle,
          listingUrl: domain,
          ownerContactEmail: email,
          targetClaimAmount: target.toFixed(2),
          chargeAmount: chargeAmount.toFixed(2),
          siteName: resolvedSiteName,
          logoUrl: resolvedLogoUrl || '',
          description: resolvedDescription || '',
          faviconUrl: resolvedFaviconUrl || '',
        };

        // Include current path as 'from' context for the return URL
        const currentPath = this.location.path();
        const safePath = currentPath && currentPath.startsWith('/') ? currentPath : '/';
        const returnUrl = typeof window !== 'undefined'
          ? `${window.location.origin}/payment-success?from=${encodeURIComponent(safePath)}`
          : `http://localhost:4200/payment-success?from=${encodeURIComponent(safePath)}`;

        session = await firstValueFrom(
          this.dodoPayments.createSession({
            amountInMinorUnits: Math.max(100, Math.round(chargeAmount * 100)),
            currency: 'INR',
            customerEmail: email,
            customerName: resolvedTitle,
            listingName: resolvedTitle,
            listingId: resolvedListingId ? resolvedListingId.toString() : undefined,
            categoryId: categoryId.toString(),
            returnUrl: returnUrl,
            metadata: metadata,
          }),
        );
      } catch (e) {
        this.submitting.set(false);
        this.checkoutStage.set('idle');
        const errMessage = this.dodoPayments.describeHttpError(e, 'Could not initiate Dodo Payments session.');
        this.quoteError.set(errMessage);
        this.toast.show(errMessage, 'error');
        return;
      }

      // Step 3: Redirect directly to the official Dodo Payments checkout detail page
      if (typeof window !== 'undefined' && session.checkoutUrl) {
        this.checkoutStage.set('redirecting');
        // Brief delay so the user sees the "Redirecting you now..." label
        await new Promise((r) => setTimeout(r, 300));
        this.modal.closeClaimModal();
        window.location.href = session.checkoutUrl;
      } else {
        throw new Error('Checkout URL was not returned by Dodo Payments.');
      }
    } catch (err: unknown) {
      this.submitting.set(false);
      this.checkoutStage.set('idle');
      const message = err instanceof Error ? err.message : 'Calculation error occurred.';
      this.quoteError.set(message);
      this.toast.show(message, 'error');
    }
  }
}
