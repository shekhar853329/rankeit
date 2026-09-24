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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { catchError, of, switchMap } from 'rxjs';
import { CategoryLeaderboardResponseDto, LeaderboardEntryDto } from '../../core/models/leaderboard.model';
import { CategoryDto } from '../../core/models/category.model';
import { DailyListingEntryDto } from '../../core/models/daily-listing.model';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { CategoryService } from '../../core/services/category.service';
import { SignalrService } from '../../core/services/signalr.service';
import { ListingService } from '../../core/services/listing.service';
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
  private readonly leaderboardService = inject(LeaderboardService);
  private readonly categoryService = inject(CategoryService);
  private readonly signalr = inject(SignalrService);
  private readonly listingService = inject(ListingService);
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

  // ── Stats bar: top 3 bidders of today ─────────────────────
  readonly top3Bidders = signal<DailyListingEntryDto[]>([]);

  // ── Sidebar: claim card ────────────────────────────────────
  readonly sidebarUrl = signal('');
  readonly claimCategoryData = signal<CategoryLeaderboardResponseDto | null>(null);
  readonly claimAmount = signal<number | null>(null);
  readonly targetRank = signal(1);
  readonly claimSlug = computed(() => this.categorySlug() || null);

  readonly claimPrice = computed<number | null>(() => {
    const data = this.claimCategoryData();
    if (!data) return null;
    const currentTop = data.leaderboard.items[0]?.currentBidAmount;
    return currentTop !== undefined ? currentTop + data.minBidIncrement : data.minStartingBid;
  });

  readonly effectiveClaimAmount = computed<number | null>(() => this.claimAmount() ?? this.claimPrice());

  // ── URL pre-fill (carried through to the modal) ────────────
  private prefillUrl = '';

  ngOnInit(): void {
    this.prefillUrl = this.route.snapshot.queryParamMap.get('url') ?? '';

    // Load trending categories for the sidebar
    this.categoryService.getCategories({ sortBy: 'Trending', pageSize: 6 }).subscribe((result) => {
      this.trendingCategories.set(result.items);
    });

    // Load top-3 bidders of today
    this.loadTop3Bidders();

    // Watch route param changes
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
        if (!result) { this.notFound.set(true); return; }
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
      if (payload.categorySlug === this.categorySlug()) this.refresh();
      this.loadTop3Bidders();
    });

    this.signalr.listingClicked$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ listingId, clickCount }) => {
      this.clickCounts.update((map) => ({ ...map, [listingId]: clickCount }));
    });

    this.destroyRef.onDestroy(() => void this.signalr.leaveCategoryGroup(this.categorySlug()));
  }

  private loadTop3Bidders(): void {
    this.leaderboardService.getDailyListings(1, 3).subscribe((result) => {
      const today = result.items[0];
      if (today) this.top3Bidders.set(today.entries.slice(0, 3));
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

  // ── Claim card interactions ────────────────────────────────

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

  /**
   * Sidebar "Claim rank" — opens the single combined modal (ToS + listing form + checkout).
   */
  initiateClaim(): void {
    const categoryId = this.categoryId();
    if (categoryId === null) return;
    const amount = this.effectiveClaimAmount() ?? 0;
    this.modalService.openClaimModal({
      rank: this.targetRank(),
      categoryName: this.categoryName(),
      amount,
      categoryId,
      minStartingBid: this.minStartingBid(),
      minBidIncrement: this.minBidIncrement(),
      listingId: null,
      listingName: '',
      listingUrl: this.sidebarUrl(),
      onSuccess: () => this.refresh(),
    });
  }

  // ── Feed row interactions ──────────────────────────────────

  clickCountFor(entry: LeaderboardEntryDto): number {
    return this.clickCounts()[entry.listingId] ?? entry.clickCount;
  }

  openListing(entry: LeaderboardEntryDto): void {
    window.open(entry.listingUrl, '_blank', 'noopener,noreferrer');
    this.listingService.recordClick(entry.listingId).subscribe((count) => {
      this.clickCounts.update((map) => ({ ...map, [entry.listingId]: count }));
    });
  }

  /** "Claim this position" overlay — opens the single combined modal pre-filled for this listing. */
  claimPositionBid(entry: LeaderboardEntryDto, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const categoryId = this.categoryId();
    if (categoryId === null) return;
    const amount = entry.currentBidAmount + this.minBidIncrement();
    this.claimAmount.set(amount);
    this.targetRank.set(entry.rank);
    this.modalService.openClaimModal({
      rank: entry.rank,
      categoryName: this.categoryName(),
      amount,
      categoryId,
      minStartingBid: this.minStartingBid(),
      minBidIncrement: this.minBidIncrement(),
      listingId: entry.listingId,
      listingName: entry.listingName,
      listingUrl: entry.listingUrl,
      onSuccess: () => this.refresh(),
    });
  }
}
