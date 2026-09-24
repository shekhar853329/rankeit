import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { catchError, of, switchMap } from 'rxjs';
import { CategoryLeaderboardResponseDto, LeaderboardEntryDto } from '../../core/models/leaderboard.model';
import { CategoryDto } from '../../core/models/category.model';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { CategoryService } from '../../core/services/category.service';
import { BidService } from '../../core/services/bid.service';
import { SignalrService } from '../../core/services/signalr.service';
import { ListingService } from '../../core/services/listing.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalService } from '../../core/services/modal.service';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe, DatePipe],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaderboardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly leaderboardService = inject(LeaderboardService);
  private readonly categoryService = inject(CategoryService);
  private readonly bidService = inject(BidService);
  private readonly signalr = inject(SignalrService);
  private readonly listingService = inject(ListingService);
  private readonly toast = inject(ToastService);
  private readonly modalService = inject(ModalService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Category metadata ──────────────────────────────────────
  readonly categorySlug = signal('');
  readonly categoryId = signal<number | null>(null);
  readonly categoryName = signal('');
  readonly minBidIncrement = signal(0);
  readonly minStartingBid = signal(0);

  // ── Feed state ─────────────────────────────────────────────
  readonly entries = signal<LeaderboardEntryDto[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly clickCounts = signal<Record<number, number>>({});

  // ── Sidebar: trending ──────────────────────────────────────
  readonly trendingCategories = signal<CategoryDto[]>([]);

  // ── Sidebar: claim card ────────────────────────────────────
  /** Standalone URL input in the sidebar — kept separate from the bid form's bidListingUrl. */
  readonly sidebarUrl = signal('');
  /** Set once we have category data; drives the claim card's price display. */
  readonly claimCategoryData = signal<CategoryLeaderboardResponseDto | null>(null);
  /** Manually-picked target bid amount (set when "Claim this position" is clicked on a row). */
  readonly claimAmount = signal<number | null>(null);
  /** Rank the current claim amount would take; defaults to #1. */
  readonly targetRank = signal(1);
  /** Whether the claim card is in active "targeting" mode. */
  readonly claimSlug = computed(() => this.categorySlug() || null);

  /** Price to become #1: top bid + increment, or minStartingBid if no bids yet. */
  readonly claimPrice = computed<number | null>(() => {
    const data = this.claimCategoryData();
    if (!data) return null;
    const currentTop = data.leaderboard.items[0]?.currentBidAmount;
    return currentTop !== undefined ? currentTop + data.minBidIncrement : data.minStartingBid;
  });

  /** claimAmount() when a specific row was targeted, otherwise the default #1 price. */
  readonly effectiveClaimAmount = computed<number | null>(() => this.claimAmount() ?? this.claimPrice());

  // ── Bid form state ─────────────────────────────────────────
  readonly bidListingId = signal<number | null>(null);
  readonly bidListingName = signal('');
  readonly bidListingUrl = signal('');
  readonly bidOwnerEmail = signal('');
  readonly bidTargetAmount = signal<number | null>(null);
  readonly bidPaymentReference = signal('');
  readonly bidConfirmedAmount = signal<number | null>(null);

  ngOnInit(): void {
    const prefillUrl = this.route.snapshot.queryParamMap.get('url');
    if (prefillUrl) this.bidListingUrl.set(prefillUrl);

    const prefillAmount = Number(this.route.snapshot.queryParamMap.get('amount'));
    if (Number.isFinite(prefillAmount) && prefillAmount > 0) {
      this.bidTargetAmount.set(prefillAmount);
    }

    // Load trending categories for the sidebar
    this.categoryService.getCategories({ sortBy: 'Trending', pageSize: 6 }).subscribe((result) => {
      this.trendingCategories.set(result.items);
    });

    // Watch route param changes (covers navigation between category leaderboards)
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const slug = params.get('categorySlug') ?? '';
          this.categorySlug.set(slug);
          this.loading.set(true);
          this.claimAmount.set(null);
          this.targetRank.set(1);
          void this.joinGroup(slug);
          return this.leaderboardService.getCategoryLeaderboard(slug, this.page(), this.pageSize()).pipe(
            catchError(() => of(null as CategoryLeaderboardResponseDto | null)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (!result) {
          this.notFound.set(true);
          return;
        }
        this.notFound.set(false);
        this.categoryId.set(result.categoryId);
        this.categoryName.set(result.categoryName);
        this.minBidIncrement.set(result.minBidIncrement);
        this.minStartingBid.set(result.minStartingBid);
        this.entries.set(result.leaderboard.items);
        this.totalCount.set(result.leaderboard.totalCount);
        this.claimCategoryData.set(result);
      });

    this.signalr.rankUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((payload) => {
      if (payload.categorySlug === this.categorySlug()) {
        this.refresh();
      }
    });

    this.signalr.listingClicked$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ listingId, clickCount }) => {
      this.clickCounts.update((map) => ({ ...map, [listingId]: clickCount }));
    });

    this.destroyRef.onDestroy(() => {
      void this.signalr.leaveCategoryGroup(this.categorySlug());
    });
  }

  private async joinGroup(slug: string): Promise<void> {
    if (slug) await this.signalr.joinCategoryGroup(slug);
  }

  refresh(): void {
    this.leaderboardService
      .getCategoryLeaderboard(this.categorySlug(), this.page(), this.pageSize())
      .subscribe((result) => {
        this.entries.set(result.leaderboard.items);
        this.totalCount.set(result.leaderboard.totalCount);
        this.claimCategoryData.set(result);
      });
  }

  goToPage(page: number): void {
    if (page < 1) return;
    this.page.set(page);
    this.refresh();
  }

  /** "Claim this position" overlay on a row — pre-targets that rank in the sidebar claim card. */
  claimPosition(entry: LeaderboardEntryDto, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.claimAmount.set(entry.currentBidAmount + this.minBidIncrement());
    this.targetRank.set(entry.rank);
  }

  incrementClaimAmount(): void {
    const current = this.effectiveClaimAmount() ?? 0;
    this.claimAmount.set(current + this.minBidIncrement());
  }

  decrementClaimAmount(): void {
    const floor = this.claimPrice() ?? 0;
    const current = this.effectiveClaimAmount() ?? floor;
    this.claimAmount.set(Math.max(current - this.minBidIncrement(), floor));
  }

  /** Sidebar "Claim rank" button — opens confirmation modal. On confirm, pre-fills the bid form without changing page state. */
  initiateClaim(): void {
    const amount = this.effectiveClaimAmount() ?? 0;
    const url = this.sidebarUrl();
    this.modalService.openClaimModal({
      rank: this.targetRank(),
      categoryName: this.categoryName(),
      amount,
      onConfirm: () => {
        // Pre-fill the bid form and scroll to it — no navigation
        this.bidTargetAmount.set(amount);
        if (url) this.bidListingUrl.set(url);
        setTimeout(() => {
          document.querySelector('.bid-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      },
    });
  }

  clickCountFor(entry: LeaderboardEntryDto): number {
    return this.clickCounts()[entry.listingId] ?? entry.clickCount;
  }

  openListing(entry: LeaderboardEntryDto): void {
    window.open(entry.listingUrl, '_blank', 'noopener,noreferrer');
    this.listingService.recordClick(entry.listingId).subscribe((count) => {
      this.clickCounts.update((map) => ({ ...map, [entry.listingId]: count }));
    });
  }

  selectListingToRebid(entry: LeaderboardEntryDto): void {
    this.bidListingId.set(entry.listingId);
    this.bidListingName.set(entry.listingName);
    this.bidListingUrl.set(entry.listingUrl);
  }

  startNewListing(): void {
    this.bidListingId.set(null);
    this.bidListingName.set('');
    this.bidListingUrl.set('');
  }

  submitBid(): void {
    const targetAmount = this.bidTargetAmount();
    const confirmedAmount = this.bidConfirmedAmount();
    const categoryId = this.categoryId();
    if (
      categoryId === null ||
      targetAmount === null ||
      confirmedAmount === null ||
      !this.bidOwnerEmail() ||
      !this.bidPaymentReference()
    ) {
      this.toast.show('Please fill in all bid fields.', 'error');
      return;
    }

    this.submitting.set(true);
    this.bidService
      .placeBid({
        categoryId,
        listingId: this.bidListingId(),
        listingName: this.bidListingName() || null,
        listingUrl: this.bidListingUrl() || null,
        ownerContactEmail: this.bidOwnerEmail(),
        targetBidAmount: targetAmount,
        paymentReference: this.bidPaymentReference(),
        confirmedPaymentAmount: confirmedAmount,
      })
      .subscribe({
        next: (result) => {
          this.submitting.set(false);
          if (result.success) {
            this.toast.show(`Bid confirmed! New bid: ${result.newCurrentBidAmount}`, 'success');
            this.refresh();
          } else {
            this.toast.show(result.errorMessage ?? 'Bid rejected.', 'error');
          }
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('Something went wrong placing your bid.', 'error');
        },
      });
  }

  readonly submitting = signal(false);
}
