import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CategoryLeaderboardResponseDto, GlobalLeaderboardEntryDto } from '../../core/models/leaderboard.model';
import { CategoryDto } from '../../core/models/category.model';
import { DailyListingEntryDto } from '../../core/models/daily-listing.model';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { CategoryService } from '../../core/services/category.service';
import { SignalrService } from '../../core/services/signalr.service';
import { ListingService } from '../../core/services/listing.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalService } from '../../core/services/modal.service';
import { CategoryTabsComponent } from '../../shared/category-tabs/category-tabs.component';

interface FeedRow {
  rank: number;
  listingId: number;
  listingName: string;
  listingUrl: string;
  currentBidAmount: number;
  categoryName: string;
  categorySlug: string;
  clickCount: number;
}

@Component({
  selector: 'app-global-leaderboard',
  standalone: true,
  imports: [RouterLink, DecimalPipe, FormsModule, CategoryTabsComponent],
  templateUrl: './global-leaderboard.component.html',
  styleUrl: './global-leaderboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalLeaderboardComponent implements OnInit {
  private readonly leaderboardService = inject(LeaderboardService);
  private readonly categoryService = inject(CategoryService);
  private readonly signalr = inject(SignalrService);
  private readonly listingService = inject(ListingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly modalService = inject(ModalService);

  private joinedCategoryGroup: string | null = null;

  readonly tabs = signal<CategoryDto[]>([]);
  readonly allCategories = signal<CategoryDto[]>([]);
  readonly trendingCategories = signal<CategoryDto[]>([]);
  readonly selectedSlug = signal<string | null>(null);
  readonly heroUrl = signal('');

  readonly categoryIcons: Record<string, string> = {
    'ai-agents-infrastructure': '🤖',
    'seo-ai-visibility':        '🔍',
    'marketing-advertising':    '📣',
    'developer-tools':          '🛠️',
    'productivity':             '⚡',
    'ecommerce-tools':          '🛒',
    'crypto-web3':              '🪙',
    'real-estate':              '🏠',
    'legal-services':           '⚖️',
    'finance-investing':        '📈',
    'freelancers':              '💼',
    'games-entertainment':      '🎮',
    'music':                    '🎵',
    'food-beverage':            '🍽️',
    'fashion':                  '👗',
    'pet-care':                 '🐾',
    'travel':                   '✈️',
    'sports':                   '🏆',
    'home-services':            '🔧',
    'automotive':               '🚗',
    'education':                '📚',
    'health-fitness':           '💪',
  };

  categoryIcon(slug: string): string {
    return this.categoryIcons[slug] ?? '📂';
  }

  readonly loading = signal(true);
  readonly globalEntries = signal<GlobalLeaderboardEntryDto[]>([]);
  readonly categoryData = signal<CategoryLeaderboardResponseDto | null>(null);
  /** Live click-through counts pushed by the "ListingClicked" hub event, keyed by listingId; overrides the loaded DTO's count. */
  readonly clickCounts = signal<Record<number, number>>({});

  /** Top-3 bidders of today pulled from the daily listings endpoint. */
  readonly top3Bidders = signal<DailyListingEntryDto[]>([]);
  readonly claimSlug = signal<string | null>(null);
  readonly claimCategoryData = signal<CategoryLeaderboardResponseDto | null>(null);
  /** Manually-picked target bid amount (set by hovering "Claim this position" on a feed row); null falls back to claimPrice(). */
  readonly claimAmount = signal<number | null>(null);
  /** Rank the current claim amount would take; defaults to #1 until a specific row is targeted. */
  readonly targetRank = signal(1);
  /** Drives the glow animation on the sidebar claim card for 3 s after a feed row is clicked. */
  readonly claimCardGlow = signal(false);

  private glowTimer: ReturnType<typeof setTimeout> | null = null;

  readonly rows = computed<FeedRow[]>(() => {
    const clickOverrides = this.clickCounts();
    if (this.selectedSlug() === null) {
      return this.globalEntries().map((e) => ({
        rank: e.rank,
        listingId: e.listingId,
        listingName: e.listingName,
        listingUrl: e.listingUrl,
        currentBidAmount: e.currentBidAmount,
        categoryName: e.categoryName,
        categorySlug: e.categorySlug,
        clickCount: clickOverrides[e.listingId] ?? e.clickCount,
      }));
    }

    const data = this.categoryData();
    if (!data) {
      return [];
    }
    return data.leaderboard.items.map((e) => ({
      rank: e.rank,
      listingId: e.listingId,
      listingName: e.listingName,
      listingUrl: e.listingUrl,
      currentBidAmount: e.currentBidAmount,
      categoryName: data.categoryName,
      categorySlug: data.categorySlug,
      clickCount: clickOverrides[e.listingId] ?? e.clickCount,
    }));
  });

  /** Price to become #1 in the claim card's category; null when no category is targeted yet. */
  readonly claimPrice = computed<number | null>(() => {
    const data = this.claimCategoryData();
    if (this.claimSlug() === null || !data) {
      return null;
    }
    const currentTop = data.leaderboard.items[0]?.currentBidAmount;
    return currentTop !== undefined ? currentTop + data.minBidIncrement : data.minStartingBid;
  });

  /**
   * Fallback price derived from the global feed's current #1 entry when no category
   * has been selected yet. Avoids showing ₹0 on initial page load.
   */
  readonly globalDefaultPrice = computed<number | null>(() => {
    const top = this.rows()[0];
    if (!top) return null;
    // Use the category's minBidIncrement if available, else a safe default of 1
    const category = this.allCategories().find((c) => c.slug === top.categorySlug)
      ?? this.tabs().find((c) => c.slug === top.categorySlug);
    const increment = category?.minBidIncrement ?? 1;
    return top.currentBidAmount + increment;
  });

  /** claimAmount() when a specific row was targeted, otherwise the category price, otherwise the global #1 price. */
  readonly effectiveClaimAmount = computed<number | null>(() =>
    this.claimAmount() ?? this.claimPrice() ?? this.globalDefaultPrice()
  );

  ngOnInit(): void {
    this.categoryService.getCategories({ sortBy: 'Trending', pageSize: 8 }).subscribe((result) => {
      this.tabs.set(result.items);
      this.trendingCategories.set(result.items.slice(0, 6));
    });

    // Load top-3 bidders of today
    this.loadTop3Bidders();

    this.categoryService.getCategories({ sortBy: 'Alphabetical', pageSize: 100 }).subscribe((result) => {
      this.allCategories.set(result.items);
    });

    this.loadSelection();
    void this.signalr.joinGlobalGroup();

    this.destroyRef.onDestroy(() => {
      void this.signalr.leaveGlobalGroup();
      if (this.joinedCategoryGroup) {
        void this.signalr.leaveCategoryGroup(this.joinedCategoryGroup);
      }
      if (this.glowTimer) clearTimeout(this.glowTimer);
    });

    this.signalr.rankUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((payload) => {
      const slug = this.selectedSlug();
      if (slug === null && payload.becameCategoryTop) {
        this.loadGlobal();
      } else if (slug !== null && payload.categorySlug === slug) {
        this.loadCategory(slug);
      }
      // Any new bid could change the top bidders of the day — refresh the bar
      this.loadTop3Bidders();
    });

    this.signalr.listingClicked$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ listingId, clickCount }) => {
      this.clickCounts.update((map) => ({ ...map, [listingId]: clickCount }));
    });
  }

  selectTab(slug: string | null): void {
    if (slug === this.selectedSlug()) {
      return;
    }
    this.selectedSlug.set(slug);
    this.loadSelection();

    if (this.joinedCategoryGroup) {
      void this.signalr.leaveCategoryGroup(this.joinedCategoryGroup);
      this.joinedCategoryGroup = null;
    }
    if (slug) {
      this.joinedCategoryGroup = slug;
      void this.signalr.joinCategoryGroup(slug);
    }
  }

  /** Changes which category the sidebar claim card targets, without touching the main feed's filter. */
  selectClaimCategory(slug: string | null): void {
    if (slug === this.claimSlug()) {
      return;
    }
    this.claimSlug.set(slug);
    this.claimAmount.set(null);
    this.targetRank.set(1);

    if (!slug) {
      this.claimCategoryData.set(null);
      return;
    }
    this.leaderboardService.getCategoryLeaderboard(slug, 1, 20).subscribe((data) => this.claimCategoryData.set(data));
  }

  /** Hovering a feed row reveals a "Claim this position" button; clicking it targets that row's rank/amount
   *  in the claim card only - it never changes the main feed's category filter. */
  claimPosition(row: FeedRow, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const increment = this.incrementForCategory(row.categorySlug);
    this.selectClaimCategory(row.categorySlug);
    this.claimAmount.set(row.currentBidAmount + increment);
    this.targetRank.set(row.rank);

    // Pulse the sidebar claim card for 3 s
    if (this.glowTimer) clearTimeout(this.glowTimer);
    this.claimCardGlow.set(true);
    this.glowTimer = setTimeout(() => this.claimCardGlow.set(false), 3000);
  }

  incrementClaimAmount(): void {
    const step = this.incrementForCategory(this.claimSlug());
    const current = this.effectiveClaimAmount() ?? 0;
    this.claimAmount.set(current + step);
  }

  decrementClaimAmount(): void {
    const step = this.incrementForCategory(this.claimSlug());
    const floor = this.claimPrice() ?? 0;
    const current = this.effectiveClaimAmount() ?? floor;
    this.claimAmount.set(Math.max(current - step, floor));
  }

  claimRank(): void {
    const slug = this.claimSlug();
    if (!slug) {
      this.toast.show('Choose a category first', 'info');
      return;
    }
    const data = this.claimCategoryData();
    if (!data) {
      // No category data yet — navigate directly so the leaderboard page can open the modal
      void this.router.navigate(['/leaderboard', slug]);
      return;
    }
    const amount = this.effectiveClaimAmount() ?? 0;
    const url = this.heroUrl();
    this.modalService.openClaimModal({
      rank: this.targetRank(),
      categoryName: data.categoryName,
      amount,
      categoryId: data.categoryId,
      minStartingBid: data.minStartingBid,
      minBidIncrement: data.minBidIncrement,
      listingId: null,
      listingName: '',
      listingUrl: url,
      onSuccess: () => {
        void this.router.navigate(['/leaderboard', slug]);
      },
    });
  }

  /** Clicking a bidder card opens the product URL/handle that was submitted with the bid, and records the click. */
  openListing(row: FeedRow): void {
    window.open(row.listingUrl, '_blank', 'noopener,noreferrer');
    this.listingService.recordClick(row.listingId).subscribe((count) => {
      this.clickCounts.update((map) => ({ ...map, [row.listingId]: count }));
    });
  }

  private incrementForCategory(slug: string | null): number {
    if (!slug) {
      return 0;
    }
    if (this.claimSlug() === slug) {
      const data = this.claimCategoryData();
      if (data) {
        return data.minBidIncrement;
      }
    }
    const category = this.allCategories().find((c) => c.slug === slug) ?? this.tabs().find((c) => c.slug === slug);
    return category?.minBidIncrement ?? 0;
  }

  private loadSelection(): void {
    this.loading.set(true);
    const slug = this.selectedSlug();
    if (slug === null) {
      this.loadGlobal();
    } else {
      this.loadCategory(slug);
    }
  }

  private loadTop3Bidders(): void {
    this.leaderboardService.getDailyListings(1, 3).subscribe((result) => {
      const today = result.items[0];
      if (today) this.top3Bidders.set(today.entries.slice(0, 3));
    });
  }

  private loadGlobal(): void {
    this.leaderboardService.getGlobalLeaderboard(20).subscribe((entries) => {
      this.globalEntries.set(entries);
      this.loading.set(false);
    });
  }

  private loadCategory(slug: string): void {
    this.leaderboardService.getCategoryLeaderboard(slug, 1, 20).subscribe({
      next: (data) => {
        this.categoryData.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.categoryData.set(null);
        this.loading.set(false);
      },
    });
  }
}
