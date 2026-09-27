import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import type * as echarts from 'echarts';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { CategoryLeaderboardResponseDto, GlobalLeaderboardEntryDto, PlatformStatsDto } from '../../core/models/leaderboard.model';
import { CategoryDto } from '../../core/models/category.model';
import { DailyListingEntryDto } from '../../core/models/daily-listing.model';
import { UrlMetadataDto } from '../../core/models/url-metadata.model';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { CategoryService } from '../../core/services/category.service';
import { SignalrService } from '../../core/services/signalr.service';
import { ListingService } from '../../core/services/listing.service';
import { UrlMetadataService } from '../../core/services/url-metadata.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalService } from '../../core/services/modal.service';

export interface FeedRow {
  rank: number;
  listingId: number;
  listingName: string;
  listingUrl: string;
  currentBidAmount: number;
  categoryName: string;
  categorySlug: string;
  categoryIcon?: string | null;
  clickCount: number;
  bidCount: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
}

export interface LiveStreamEvent {
  icon: string;
  iconClass: string;
  user: string;
  action: string;
  timeAgo: string;
  highlight: string;
}

export interface HallOfFameItem {
  id: number;
  rank: number;
  name: string;
  siteName: string | null;
  url: string;
  bid: number;
  clickCount: number;
}

@Component({
  selector: 'app-global-leaderboard',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './global-leaderboard.component.html',
  styleUrl: './global-leaderboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalLeaderboardComponent implements OnInit, AfterViewInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly leaderboardService = inject(LeaderboardService);
  private readonly categoryService = inject(CategoryService);
  private readonly signalr = inject(SignalrService);
  private readonly listingService = inject(ListingService);
  private readonly urlMetadataService = inject(UrlMetadataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly modalService = inject(ModalService);
  private readonly elementRef = inject(ElementRef);

  @ViewChild('bidChartContainer') chartContainerRef?: ElementRef<HTMLDivElement>;
  private echartsModule: typeof import('echarts') | null = null;
  private echartsInstance: echarts.ECharts | null = null;
  private chartResizeObserver: ResizeObserver | null = null;

  /* ── Interactive Bid Pressure Chart Controls ── */
  readonly chartViewMode = signal<'timeline' | 'hourly' | 'weekly'>('timeline');
  readonly chartMetric = signal<'both' | 'volume' | 'count'>('both');
  readonly chartTimePreset = signal<'1h' | '6h' | 'today' | 'all'>('today');

  readonly todayTotalVolume = computed(() => {
    const stats = this.platformStats();
    if (!stats) return 0;
    if (stats.recentBidsTimeline && stats.recentBidsTimeline.length > 0) {
      return stats.recentBidsTimeline.reduce((acc, b) => acc + Number(b.amount || 0), 0);
    }
    return stats.hourlyBidPressures.reduce((acc, h) => acc + Number(h.volume || 0), 0);
  });

  readonly todayTotalBids = computed(() => {
    const stats = this.platformStats();
    if (!stats) return 0;
    if (stats.recentBidsTimeline && stats.recentBidsTimeline.length > 0) {
      return stats.recentBidsTimeline.length;
    }
    return stats.hourlyBidPressures.reduce((acc, h) => acc + h.bidCount, 0);
  });

  readonly peakBidInfo = computed(() => {
    const stats = this.platformStats();
    if (!stats) return null;
    const timeline = stats.recentBidsTimeline ?? [];
    if (timeline.length > 0) {
      const highest = [...timeline].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
      return {
        amount: highest.amount,
        label: highest.listingName,
        category: highest.categoryName,
        paymentRef: highest.paymentReference,
        time: highest.createdAt,
      };
    }
    const hourly = stats.hourlyBidPressures;
    const peakHour = [...hourly].sort((a, b) => Number(b.volume) - Number(a.volume))[0];
    if (peakHour && peakHour.volume > 0) {
      return {
        amount: peakHour.volume,
        label: `${String(peakHour.hour).padStart(2, '0')}:00 UTC`,
        category: 'Hourly Peak',
        paymentRef: null,
        time: null,
      };
    }
    return null;
  });

  readonly avgBidAmount = computed(() => {
    const count = this.todayTotalBids();
    const vol = this.todayTotalVolume();
    return count > 0 ? vol / count : 0;
  });

  private joinedCategoryGroup: string | null = null;
  private countdownTimerId: ReturnType<typeof setInterval> | null = null;
  private toastTimerId: ReturnType<typeof setTimeout> | null = null;

  /* ── Time & Currency Controls ── */
  readonly timeMode = signal<'today' | 'alltime'>('today');
  readonly selectedCurrency = signal<'USD' | 'EUR' | 'INR'>('USD');
  readonly countdownText = signal('05h : 42m : 18s');
  readonly currentUtcTime = signal('18:00 UTC');

  readonly currencySymbol = computed(() => {
    switch (this.selectedCurrency()) {
      case 'EUR': return '€';
      case 'INR': return '₹';
      default: return '$';
    }
  });

  /* ── Search & Filter Controls ── */
  readonly searchQuery = signal('');
  readonly visibleCount = signal(10);
  readonly loadingMore = signal(false);
  readonly hasMoreProducts = signal(true);
  private readonly searchChange$ = new Subject<string>();

  /* ── Categories & Tabs ── */
  readonly tabs = signal<CategoryDto[]>([]);
  readonly allCategories = signal<CategoryDto[]>([]);
  readonly claimHeroCategories = computed(() =>
    this.allCategories().map((category) => ({
      slug: category.slug,
      name: category.name,
      icon: this.categoryIcon(category.slug),
    }))
  );
  readonly selectedSlug = signal<string | null>(null);

  readonly allCategoriesCount = computed(() => {
    const isToday = this.timeMode() === 'today';
    const cats = this.allCategories();
    const list = cats.length > 0 ? cats : this.tabs();
    if (isToday) {
      return list.reduce((sum, c) => sum + (c.todayListingCount ?? 0), 0);
    }
    return list.reduce((sum, c) => sum + (c.listingCount || 0), 0);
  });

  categoryBidCount(cat: CategoryDto): number {
    return this.timeMode() === 'today' ? (cat.todayListingCount ?? 0) : cat.listingCount;
  }

  readonly selectedCategoryName = computed(() => {
    const slug = this.selectedSlug();
    if (!slug) return null;
    return (
      this.allCategories().find((c) => c.slug === slug)?.name ??
      this.tabs().find((c) => c.slug === slug)?.name ??
      slug
    );
  });

  /* ── Custom Category Dropdown State ── */
  readonly categoryDropdownOpen = signal(false);
  readonly categorySearchQuery = signal('');

  readonly selectedClaimCategory = computed(() => {
    const slug = this.claimSlug();
    if (!slug) return null;
    return this.claimHeroCategories().find((c) => c.slug === slug) ?? null;
  });

  readonly filteredClaimCategories = computed(() => {
    const q = this.categorySearchQuery().trim().toLowerCase();
    const all = this.claimHeroCategories();
    if (!q) return all;
    return all.filter((c) => c.name.toLowerCase().includes(q));
  });

  /* ── Hero / Command Bar Form State ── */
  readonly heroUrl = signal('');
  readonly heroUrlDirty = signal(false);
  readonly productTitle = signal('');
  readonly urlMetadata = signal<UrlMetadataDto | null>(null);
  readonly metadataLoading = signal(false);
  private readonly urlChange$ = new Subject<string>();

  /* ── Leaderboard Data Signals ── */
  readonly loading = signal(true);
  readonly globalEntries = signal<GlobalLeaderboardEntryDto[]>([]);
  readonly categoryData = signal<CategoryLeaderboardResponseDto | null>(null);
  readonly top3Bidders = signal<DailyListingEntryDto[]>([]);
  readonly clickCounts = signal<Record<number, number>>({});

  /* ── Claim Target State ── */
  readonly claimSlug = signal<string | null>(null);
  readonly claimCategoryData = signal<CategoryLeaderboardResponseDto | null>(null);
  readonly claimAmount = signal<number | null>(null);
  readonly isAmountFieldFocused = signal(false);
  readonly targetRank = signal(1);

  private readonly claimPositionSlug = signal<string | null>(null);
  private readonly claimPositionData = signal<CategoryLeaderboardResponseDto | null>(null);

  /* ── Toast Notification ── */
  readonly toastVisible = signal(false);
  readonly toastMessage = signal('');

  /* ── Live Activity Stream (Loaded from DB) ── */
  readonly liveEvents = signal<LiveStreamEvent[]>([]);

  /* ── Platform Stats & Audit Metrics (Loaded from DB) ── */
  readonly platformStats = signal<PlatformStatsDto | null>(null);

  /* ── All-Time Hall of Fame & Today's Top Lists ── */
  readonly allTimeHallOfFame = signal<HallOfFameItem[]>([]);
  readonly todayAuctionTop = signal<HallOfFameItem[]>([]);
  readonly hallOfFameLoading = signal(false);

  // Inverted view: If viewing today's auction in main stage, Hall of Fame card shows all-time pantheon, and vice versa
  readonly hallOfFameMode = computed<'today' | 'alltime'>(() =>
    this.timeMode() === 'today' ? 'alltime' : 'today'
  );

  readonly hallOfFameList = computed<HallOfFameItem[]>(() =>
    this.hallOfFameMode() === 'alltime' ? this.allTimeHallOfFame() : this.todayAuctionTop()
  );

  categoryIcon(slug: string): string {
    const found =
      this.allCategories().find((c) => c.slug === slug)?.icon ??
      this.tabs().find((c) => c.slug === slug)?.icon;
    return found || '📂';
  }

  /* ── Dynamic Hourly Chart Computed Signals (Generated from DB Hourly Pressures) ── */
  readonly hourlyChartPoints = computed(() => {
    const stats = this.platformStats();
    const pressures = stats?.hourlyBidPressures ?? [];
    if (pressures.length === 0) {
      return Array.from({ length: 24 }, (_, i) => ({
        x: Math.round((i / 23) * 600),
        y: 85,
        volume: 0,
        hour: i,
      }));
    }
    const volumes = pressures.map((p) => p.volume);
    const max = Math.max(...volumes, 1);

    return pressures.map((p, idx) => {
      const x = Math.round((idx / Math.max(1, pressures.length - 1)) * 600);
      const ratio = Number(p.volume) / Number(max);
      const y = Math.round(85 - ratio * 70); // Min y=15, baseline y=85
      return { x, y, volume: p.volume, hour: p.hour };
    });
  });

  readonly hourlyChartPath = computed(() => {
    const pts = this.hourlyChartPoints();
    if (pts.length === 0) return 'M 0 85 L 600 85';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i].x} ${pts[i].y}`;
    }
    return d;
  });

  readonly hourlyChartAreaPath = computed(() => {
    const pts = this.hourlyChartPoints();
    if (pts.length === 0) return 'M 0 85 L 600 85 L 600 100 L 0 100 Z';
    let d = `M 0 100 L ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i].x} ${pts[i].y}`;
    }
    d += ` L 600 100 Z`;
    return d;
  });

  readonly chartPingPoint = computed(() => {
    const pts = this.hourlyChartPoints();
    const currentHour = new Date().getUTCHours();
    const point = pts.find((p) => p.hour === currentHour) ?? pts[pts.length - 1];
    return point ? { cx: point.x, cy: point.y } : { cx: 600, cy: 85 };
  });

  /* ── Computed Rows ── */
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
        categoryIcon: e.categoryIcon ?? this.categoryIcon(e.categorySlug),
        clickCount: clickOverrides[e.listingId] ?? e.clickCount,
        bidCount: e.bidCount ?? 1,
        siteName: e.siteName,
        logoUrl: e.logoUrl,
        description: e.description,
        faviconUrl: e.faviconUrl,
      }));
    }

    const data = this.categoryData();
    if (!data) return [];
    return data.leaderboard.items.map((e) => ({
      rank: e.rank,
      listingId: e.listingId,
      listingName: e.listingName,
      listingUrl: e.listingUrl,
      currentBidAmount: e.currentBidAmount,
      categoryName: data.categoryName,
      categorySlug: data.categorySlug,
      categoryIcon: data.categoryIcon ?? this.categoryIcon(data.categorySlug),
      clickCount: clickOverrides[e.listingId] ?? e.clickCount,
      bidCount: e.bidCount ?? 1,
      siteName: e.siteName,
      logoUrl: e.logoUrl,
      description: e.description,
      faviconUrl: e.faviconUrl,
    }));
  });

  readonly allMatchingRows = computed<FeedRow[]>(() => {
    return this.rows();
  });

  readonly displayedRows = computed<FeedRow[]>(() => {
    return this.allMatchingRows();
  });

  readonly nextChunkCount = computed(() => (this.hasMoreProducts() ? 10 : 0));
  readonly hasMoreBidders = computed(() => this.hasMoreProducts());
  readonly showAllRows = computed(() => !this.hasMoreProducts());

  private readonly leadChampion = signal<FeedRow | null>(null);

  readonly reigningChampion = computed<FeedRow | null>(() => {
    if (this.searchQuery().trim() && this.leadChampion()) {
      return this.leadChampion();
    }
    const r = this.rows();
    return r.length > 0 ? r[0] : null;
  });

  /* ── Pricing & Validation ── */
  readonly claimPrice = computed<number | null>(() => {
    const slug = this.claimSlug();
    if (!slug) return null;

    const data = this.claimCategoryData();
    if (data && data.categorySlug === slug) {
      const currentTop = data.leaderboard.items[0]?.currentBidAmount;
      return currentTop !== undefined ? currentTop + data.minBidIncrement : data.minStartingBid;
    }

    const cat =
      this.allCategories().find((c) => c.slug === slug) ??
      this.tabs().find((c) => c.slug === slug);
    return cat ? cat.minStartingBid : null;
  });

  readonly globalDefaultPrice = computed<number | null>(() => {
    const top = this.rows()[0];
    if (!top) return 10;
    const category =
      this.allCategories().find((c) => c.slug === top.categorySlug) ??
      this.tabs().find((c) => c.slug === top.categorySlug);
    const increment = category?.minBidIncrement ?? 1;
    return top.currentBidAmount + increment;
  });

  readonly effectiveClaimAmount = computed<number | null>(() =>
    this.claimAmount() ?? this.claimPrice() ?? this.globalDefaultPrice()
  );

  readonly isHeroUrlValid = computed(() => {
    const v = this.heroUrl().trim();
    if (!v) return false;
    if (/^@\S+$/.test(v)) return true;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      /* fall through */
    }
    return /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}(\/\S*)?$/.test(
      v
    );
  });

  readonly canClaimRank = computed(() => {
    const hasCategory = !!this.claimSlug();
    return !!(hasCategory && this.isHeroUrlValid());
  });

  readonly faviconDisplayUrl = computed<string | null>(() => {
    const v = this.heroUrl().trim();
    if (!v || !this.isHeroUrlValid()) return null;
    try {
      let urlToParse = v;
      if (!v.startsWith('http://') && !v.startsWith('https://')) {
        urlToParse = 'https://' + v;
      }
      const host = new URL(urlToParse).hostname;
      return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
    } catch {
      return null;
    }
  });

  ngOnInit(): void {
    this.startCountdownTimer();
    this.loadPlatformStats();
    this.loadLiveStream();
    this.loadAllTimeHallOfFame();
    this.loadTodayAuctionTop();

    this.categoryService.getCategories({ sortBy: 'Trending', pageSize: 12 }).subscribe((result) => {
      this.tabs.set(result.items);
    });

    this.loadTop3Bidders();

    this.categoryService.getCategories({ sortBy: 'Alphabetical', pageSize: 100 }).subscribe((result) => {
      this.allCategories.set(result.items);
    });

    this.loadSelection();
    void this.signalr.joinGlobalGroup();

    // Debounced server-side search
    this.searchChange$
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.visibleCount.set(10);
        this.loading.set(true);
        this.loadSelection(10);
      });

    // Auto-fetch URL metadata 500 ms after typing stops
    this.urlChange$
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap((url) => {
          this.metadataLoading.set(true);
          return this.urlMetadataService.fetch(url);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((meta) => {
        this.urlMetadata.set(meta);
        if (meta?.siteName && !this.productTitle()) {
          this.productTitle.set(meta.siteName);
        }
        this.metadataLoading.set(false);
      });

    this.destroyRef.onDestroy(() => {
      this.chartResizeObserver?.disconnect();
      this.echartsInstance?.dispose();
      this.echartsInstance = null;
      void this.signalr.leaveGlobalGroup();
      if (this.joinedCategoryGroup) {
        void this.signalr.leaveCategoryGroup(this.joinedCategoryGroup);
      }
      if (this.countdownTimerId) clearInterval(this.countdownTimerId);
      if (this.toastTimerId) clearTimeout(this.toastTimerId);
    });

    // Real-time rank and bid updates via SignalR
    this.signalr.rankUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((payload) => {
      const slug = this.selectedSlug();
      const currentCount = this.visibleCount();
      const query = this.searchQuery().trim();
      if (slug === null && payload.becameCategoryTop) {
        this.loadGlobal(currentCount, query);
      } else if (slug !== null && payload.categorySlug === slug) {
        this.loadCategory(slug, currentCount, query);
      }
      this.loadTop3Bidders();
      this.loadTodayAuctionTop();
      this.loadAllTimeHallOfFame();
      this.loadPlatformStats();

      // Push to live activity stream
      this.liveEvents.update((events) => [
        {
          icon: payload.becameCategoryTop ? 'local_fire_department' : 'trending_up',
          iconClass: payload.becameCategoryTop ? 'stream-icon--primary' : 'stream-icon--secondary',
          user: payload.listingName.startsWith('@') ? payload.listingName : '@' + payload.listingName,
          action: payload.becameCategoryTop
            ? `recaptured #1 for ${this.currencySymbol()}${payload.newBidAmount}`
            : `bumped bid to ${this.currencySymbol()}${payload.newBidAmount}`,
          timeAgo: 'Just now',
          highlight: payload.becameCategoryTop ? 'Took Top Spot' : 'Active Bid',
        },
        ...events.slice(0, 4),
      ]);
    });

    this.signalr.listingClicked$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ listingId, clickCount }) => {
      this.clickCounts.update((map) => ({ ...map, [listingId]: clickCount }));
    });
  }

  /* ── Timer & Currency Methods ── */
  private startCountdownTimer(): void {
    const tick = () => {
      const now = new Date();
      const utcMidnight = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
      );
      const diff = Math.max(0, utcMidnight.getTime() - now.getTime());
      const hours = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, '0');
      const minutes = String(Math.floor((diff / (1000 * 60)) % 60)).padStart(2, '0');
      const seconds = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');
      this.countdownText.set(`${hours}h : ${minutes}m : ${seconds}s`);

      const utcHours = String(now.getUTCHours()).padStart(2, '0');
      const utcMins = String(now.getUTCMinutes()).padStart(2, '0');
      this.currentUtcTime.set(`${utcHours}:${utcMins} UTC`);
    };

    tick();
    this.countdownTimerId = setInterval(tick, 1000);
  }

  setTimeMode(mode: 'today' | 'alltime'): void {
    this.timeMode.set(mode);
    this.visibleCount.set(10);
    this.hasMoreProducts.set(true);
    this.loading.set(true);
    this.loadSelection(10);
    if (mode === 'today' && this.allTimeHallOfFame().length === 0) {
      this.loadAllTimeHallOfFame();
    } else if (mode === 'alltime' && this.todayAuctionTop().length === 0) {
      this.loadTodayAuctionTop();
    }
  }

  toggleLeaderboardTimeMode(): void {
    const nextMode = this.timeMode() === 'today' ? 'alltime' : 'today';
    this.setTimeMode(nextMode);
  }

  setCurrency(curr: 'USD' | 'EUR' | 'INR'): void {
    this.selectedCurrency.set(curr);
    this.updateChart();
  }

  /* ── Interactive Actions ── */
  onSearchChange(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.searchQuery.set(val);
    this.searchChange$.next(val.trim());
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.visibleCount.set(10);
    this.loading.set(true);
    this.loadSelection(10);
  }

  loadNextBidders(): void {
    if (this.loadingMore() || !this.hasMoreProducts()) return;
    this.loadingMore.set(true);
    const nextCount = this.visibleCount() + 10;
    this.visibleCount.set(nextCount);
    this.loadSelection(nextCount);
  }

  collapseToTop10(): void {
    this.visibleCount.set(10);
    this.hasMoreProducts.set(true);
    this.loadSelection(10);
  }

  toggleShowAll(): void {
    if (this.hasMoreProducts()) {
      this.loadNextBidders();
    } else {
      this.collapseToTop10();
    }
  }

  onHeroUrlChange(value: string): void {
    this.heroUrl.set(value);
    this.heroUrlDirty.set(true);
    const v = value.trim();
    if (this.isHeroUrlValid()) {
      this.urlChange$.next(v);
    } else {
      this.urlMetadata.set(null);
      this.metadataLoading.set(false);
    }
  }

  onProductTitleChange(value: string): void {
    this.productTitle.set(value);
  }

  onFaviconError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  onListingFaviconError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  selectTab(slug: string | null): void {
    const isSameSlug = slug === this.selectedSlug();
    if (!isSameSlug) {
      this.selectedSlug.set(slug);
      this.visibleCount.set(10);
      this.hasMoreProducts.set(true);
      this.loading.set(true);
      this.loadSelection(10);

      if (this.joinedCategoryGroup) {
        void this.signalr.leaveCategoryGroup(this.joinedCategoryGroup);
        this.joinedCategoryGroup = null;
      }
      if (slug) {
        this.joinedCategoryGroup = slug;
        void this.signalr.joinCategoryGroup(slug);
      }
      this.loadPlatformStats(slug);
    }
  }

  selectClaimCategory(slug: string | null): void {
    this.claimSlug.set(slug);
    this.targetRank.set(1);

    if (!slug) {
      this.claimCategoryData.set(null);
      this.claimAmount.set(null);
      return;
    }

    const cat =
      this.allCategories().find((c) => c.slug === slug) ??
      this.tabs().find((c) => c.slug === slug);

    // If we have cached category data for this slug, use its Rank #1 price immediately
    const cached = this.claimCategoryData();
    if (cached && cached.categorySlug === slug) {
      const minInc = cached.minBidIncrement || 1;
      const currentTop = cached.leaderboard.items[0]?.currentBidAmount ?? null;
      const rank1Amount = currentTop !== null ? currentTop + minInc : cached.minStartingBid;
      this.claimAmount.set(rank1Amount);
    } else if (cat) {
      // Immediately show category minStartingBid while fetching alltime champion
      this.claimAmount.set(cat.minStartingBid);
    }

    // Always fetch alltime to get true reigning Rank 1 champion regardless of today filter
    this.leaderboardService.getCategoryLeaderboard(slug, 1, 20, 'alltime').subscribe({
      next: (data) => {
        this.claimCategoryData.set(data);

        const minInc = data.minBidIncrement || 1;
        const currentTop = data.leaderboard.items[0]?.currentBidAmount ?? null;
        const rank1Amount = currentTop !== null ? currentTop + minInc : data.minStartingBid;

        // Default the bid amount to what is required to get Rank 1
        this.claimAmount.set(rank1Amount);

        this.showToastNotification(
          `Selected ${data.categoryName}. Amount to claim Rank #1 is ${this.currencySymbol()}${rank1Amount}.`
        );
      },
      error: () => {
        if (cat) {
          this.claimAmount.set(cat.minStartingBid);
        }
      },
    });
  }

  toggleCategoryDropdown(event?: Event): void {
    event?.stopPropagation();
    this.categoryDropdownOpen.update((v) => !v);
    if (!this.categoryDropdownOpen()) {
      this.categorySearchQuery.set('');
    }
  }

  closeCategoryDropdown(): void {
    this.categoryDropdownOpen.set(false);
    this.categorySearchQuery.set('');
  }

  selectDropdownCategory(slug: string, event?: Event): void {
    event?.stopPropagation();
    if (this.claimSlug() === slug) {
      this.clearCategorySelection();
    } else {
      this.selectClaimCategory(slug);
    }
    this.closeCategoryDropdown();
  }

  clearCategorySelection(event?: Event): void {
    event?.stopPropagation();
    this.selectClaimCategory(null);
  }

  onCategorySearch(event: Event): void {
    this.categorySearchQuery.set((event.target as HTMLInputElement).value);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.categoryDropdownOpen()) {
      const field = this.elementRef.nativeElement.querySelector('.command-bar__field--category');
      if (field && !field.contains(event.target as Node)) {
        this.closeCategoryDropdown();
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.categoryDropdownOpen()) {
      this.closeCategoryDropdown();
    }
  }

  incrementClaimAmount(): void {
    const step = this.incrementForCategory(this.claimSlug() ?? this.claimPositionSlug());
    const current = this.effectiveClaimAmount() ?? (this.claimPrice() ?? 10);
    this.claimAmount.set(current + Math.max(step, 1));
  }

  decrementClaimAmount(): void {
    const step = this.incrementForCategory(this.claimSlug() ?? this.claimPositionSlug());
    const floor = 1;
    const current = this.effectiveClaimAmount() ?? (this.claimPrice() ?? 10);
    const inc = Math.max(step, 1);
    const nextVal = current > inc ? current - inc : (current > floor ? floor : floor);
    this.claimAmount.set(Math.max(nextVal, floor));
  }

  onClaimAmountInput(val: string): void {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      this.claimAmount.set(num);
    } else {
      this.claimAmount.set(null);
    }
  }

  onClaimAmountBlur(val: string): void {
    this.isAmountFieldFocused.set(false);
    const num = parseFloat(val);
    if (isNaN(num) || num < 1) {
      const fallback = this.claimPrice() ?? this.globalDefaultPrice() ?? 1;
      this.claimAmount.set(fallback);
    } else {
      this.claimAmount.set(Math.max(1, Math.round(num * 100) / 100));
    }
  }

  claimThisPosition(targetAmount?: number, rank?: number): void {
    // On Global Leaderboard: NEVER auto populate category, website url, or title
    if (rank !== undefined) {
      this.targetRank.set(rank);
    } else {
      this.targetRank.set(1);
    }

    if (targetAmount !== undefined && targetAmount > 0) {
      this.claimAmount.set(targetAmount);
    }

    // Move / scroll to Claim Rank section
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const el = document.getElementById('claim-rank-section');
    if (el) {
      el.classList.add('command-bar-wrapper--highlight');
      setTimeout(() => el.classList.remove('command-bar-wrapper--highlight'), 2200);
    }

    const urlInput = document.getElementById('claim-url') as HTMLInputElement | null;
    if (urlInput) {
      setTimeout(() => urlInput.focus({ preventScroll: true }), 350);
    }

    const amountVal = targetAmount ?? this.effectiveClaimAmount() ?? 10;
    this.showToastNotification(
      `Staged at ${this.currencySymbol()}${amountVal}. Select your category and enter domain to claim.`
    );
  }

  prepareOutbid(productName: string, minAmount: number, categorySlug?: string, rank?: number): void {
    this.claimThisPosition(minAmount, rank);
  }

  showToastNotification(message: string): void {
    this.toastMessage.set(message);
    this.toastVisible.set(true);
    if (this.toastTimerId) clearTimeout(this.toastTimerId);
    this.toastTimerId = setTimeout(() => this.toastVisible.set(false), 4000);
  }

  claimRank(): void {
    const slug = this.claimSlug();
    if (!slug) {
      this.showToastNotification('Please select a category first');
      this.toggleCategoryDropdown();
      return;
    }

    const launchModal = (data: CategoryLeaderboardResponseDto) => {
      const minInc = data.minBidIncrement || 1;
      const currentTop = data.leaderboard.items[0]?.currentBidAmount ?? null;
      const rank1Req = currentTop !== null ? currentTop + minInc : data.minStartingBid;
      const amount = Math.max(this.effectiveClaimAmount() ?? rank1Req, 1);

      let rank = 1;
      if (currentTop !== null && amount <= currentTop) {
        const higherCount = data.leaderboard.items.filter((item) => item.currentBidAmount >= amount).length;
        rank = higherCount + 1;
      }

      const url = this.heroUrl();
      const meta = this.urlMetadata();
      const title = this.productTitle() || meta?.siteName || '';

      const enteredUrl = url.trim().toLowerCase();
      const existing = data.leaderboard.items.find(
        (e) => e.listingUrl.trim().toLowerCase() === enteredUrl
      );

      this.modalService.openClaimModal({
        rank,
        categoryName: data.categoryName,
        amount,
        categoryId: data.categoryId,
        minStartingBid: data.minStartingBid,
        minBidIncrement: minInc,
        currentTopBid: currentTop,
        currentBidAmount: existing?.currentBidAmount ?? 0,
        listingId: existing?.listingId ?? null,
        listingName: existing?.listingName || title,
        listingUrl: url,
        siteName: existing?.siteName || title || null,
        logoUrl: (existing?.logoUrl || meta?.logoUrl) ?? null,
        description: (existing?.description || meta?.description) ?? null,
        faviconUrl: (existing?.faviconUrl || meta?.faviconUrl) ?? null,
        categorySlug: slug,
        onSuccess: () => {
          void this.router.navigate(['/leaderboard', slug]);
        },
      });
    };

    const cachedData = this.claimCategoryData() ?? this.claimPositionData();
    if (cachedData) {
      launchModal(cachedData);
    } else {
      this.leaderboardService.getCategoryLeaderboard(slug, 1, 20, 'alltime').subscribe({
        next: (data) => launchModal(data),
        error: () => void this.router.navigate(['/leaderboard', slug]),
      });
    }
  }

  openListing(row: FeedRow): void {
    window.open(row.listingUrl, '_blank', 'noopener,noreferrer');
    this.listingService.recordClick(row.listingId).subscribe((count) => {
      this.clickCounts.update((map) => ({ ...map, [row.listingId]: count }));
    });
  }

  openListingDirect(url: string, id: number): void {
    window.open(url, '_blank', 'noopener,noreferrer');
    this.listingService.recordClick(id).subscribe((count) => {
      this.clickCounts.update((map) => ({ ...map, [id]: count }));
    });
  }

  formatDomain(url: string): string {
    if (!url) return '';
    try {
      let clean = url.trim();
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = 'https://' + clean;
      }
      return new URL(clean).hostname.replace(/^www\./, '');
    } catch {
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    }
  }

  incrementForCategory(slug: string | null): number {
    if (!slug) return 1;
    if (this.claimSlug() === slug) {
      const data = this.claimCategoryData();
      if (data) return data.minBidIncrement;
    }
    const cat =
      this.allCategories().find((c) => c.slug === slug) ??
      this.tabs().find((c) => c.slug === slug);
    return cat?.minBidIncrement ?? 1;
  }

  private loadSelection(count = this.visibleCount()): void {
    const slug = this.selectedSlug();
    const query = this.searchQuery().trim();
    if (slug === null) {
      this.loadGlobal(count, query);
    } else {
      this.loadCategory(slug, count, query);
    }
  }

  private loadTop3Bidders(): void {
    this.leaderboardService.getDailyListings(1, 3).subscribe((result) => {
      const today = result.items[0];
      if (today) this.top3Bidders.set(today.entries.slice(0, 3));
    });
  }

  private loadGlobal(count = this.visibleCount(), query = this.searchQuery().trim()): void {
    // Request count + 1 so we can verify if more records exist on the server
    this.leaderboardService.getGlobalLeaderboard(count + 1, this.timeMode(), query).subscribe({
      next: (entries) => {
        const hasMore = entries.length > count;
        this.hasMoreProducts.set(hasMore);
        const sliced = entries.slice(0, count);
        this.globalEntries.set(sliced);
        this.loading.set(false);
        this.loadingMore.set(false);

        if (!query && sliced.length > 0) {
          const first = sliced[0];
          this.leadChampion.set({
            rank: 1,
            listingId: first.listingId,
            listingName: first.listingName,
            listingUrl: first.listingUrl,
            currentBidAmount: first.currentBidAmount,
            categoryName: first.categoryName,
            categorySlug: first.categorySlug,
            categoryIcon: first.categoryIcon ?? this.categoryIcon(first.categorySlug),
            clickCount: first.clickCount,
            bidCount: first.bidCount ?? 1,
            siteName: first.siteName,
            logoUrl: first.logoUrl,
            description: first.description,
            faviconUrl: first.faviconUrl,
          });
        }

        if (!query) {
          const mappedTop5: HallOfFameItem[] = entries.slice(0, 5).map((e, idx) => ({
            id: e.listingId,
            rank: idx + 1,
            name: e.listingName,
            siteName: e.siteName,
            url: e.listingUrl,
            bid: e.currentBidAmount,
            clickCount: e.clickCount,
          }));

          if (this.timeMode() === 'today') {
            this.todayAuctionTop.set(mappedTop5);
            if (this.allTimeHallOfFame().length === 0) {
              this.loadAllTimeHallOfFame();
            }
          } else {
            this.allTimeHallOfFame.set(mappedTop5);
            if (this.todayAuctionTop().length === 0) {
              this.loadTodayAuctionTop();
            }
          }
        }
      },
      error: () => {
        this.globalEntries.set([]);
        this.hasMoreProducts.set(false);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
    });
  }

  private loadPlatformStats(categorySlug?: string | null): void {
    const targetSlug = categorySlug !== undefined ? categorySlug : this.selectedSlug();
    this.leaderboardService.getPlatformStats(targetSlug).subscribe({
      next: (stats) => {
        this.platformStats.set(stats);
        if (isPlatformBrowser(this.platformId)) {
          setTimeout(() => this.updateChart(), 40);
        }
      },
    });
  }

  private loadLiveStream(): void {
    this.leaderboardService.getLiveStream(5).subscribe({
      next: (events) => {
        if (events && events.length > 0) {
          this.liveEvents.set(
            events.map((e) => ({
              icon: e.isTopBid ? 'local_fire_department' : 'arrow_upward',
              iconClass: e.isTopBid ? 'stream-icon--primary' : 'stream-icon--secondary',
              user: e.siteName || (e.listingName.startsWith('@') ? e.listingName : '@' + e.listingName),
              action: e.actionText,
              timeAgo: e.timeAgo,
              highlight: e.highlightText,
            }))
          );
        }
      },
    });
  }

  private loadAllTimeHallOfFame(): void {
    this.hallOfFameLoading.set(true);
    this.leaderboardService.getHallOfFame(5).subscribe({
      next: (items) => {
        if (items && items.length > 0) {
          this.allTimeHallOfFame.set(items);
          this.hallOfFameLoading.set(false);
        } else {
          this.leaderboardService.getGlobalLeaderboard(5, 'alltime').subscribe({
            next: (entries) => {
              if (entries && entries.length > 0) {
                this.allTimeHallOfFame.set(
                  entries.slice(0, 5).map((e, idx) => ({
                    id: e.listingId,
                    rank: idx + 1,
                    name: e.listingName,
                    siteName: e.siteName,
                    url: e.listingUrl,
                    bid: e.currentBidAmount,
                    clickCount: e.clickCount,
                  }))
                );
              }
              this.hallOfFameLoading.set(false);
            },
            error: () => this.hallOfFameLoading.set(false),
          });
        }
      },
      error: () => {
        this.leaderboardService.getGlobalLeaderboard(5, 'alltime').subscribe({
          next: (entries) => {
            if (entries && entries.length > 0) {
              this.allTimeHallOfFame.set(
                entries.slice(0, 5).map((e, idx) => ({
                  id: e.listingId,
                  rank: idx + 1,
                  name: e.listingName,
                  siteName: e.siteName,
                  url: e.listingUrl,
                  bid: e.currentBidAmount,
                  clickCount: e.clickCount,
                }))
              );
            }
            this.hallOfFameLoading.set(false);
          },
          error: () => this.hallOfFameLoading.set(false),
        });
      },
    });
  }

  private loadTodayAuctionTop(): void {
    this.hallOfFameLoading.set(true);
    this.leaderboardService.getGlobalLeaderboard(5, 'today').subscribe({
      next: (entries) => {
        if (entries && entries.length > 0) {
          this.todayAuctionTop.set(
            entries.slice(0, 5).map((e, idx) => ({
              id: e.listingId,
              rank: idx + 1,
              name: e.listingName,
              siteName: e.siteName,
              url: e.listingUrl,
              bid: e.currentBidAmount,
              clickCount: e.clickCount,
            }))
          );
        }
        this.hallOfFameLoading.set(false);
      },
      error: () => {
        this.hallOfFameLoading.set(false);
      },
    });
  }

  private loadCategory(slug: string, count = this.visibleCount(), query = this.searchQuery().trim()): void {
    this.leaderboardService.getCategoryLeaderboard(slug, 1, count, this.timeMode(), query).subscribe({
      next: (data) => {
        this.categoryData.set(data);
        this.hasMoreProducts.set(data.leaderboard.totalCount > count);
        this.loading.set(false);
        this.loadingMore.set(false);

        if (!query && data.leaderboard.items.length > 0) {
          const first = data.leaderboard.items[0];
          this.leadChampion.set({
            rank: 1,
            listingId: first.listingId,
            listingName: first.listingName,
            listingUrl: first.listingUrl,
            currentBidAmount: first.currentBidAmount,
            categoryName: data.categoryName,
            categorySlug: data.categorySlug,
            categoryIcon: data.categoryIcon ?? this.categoryIcon(data.categorySlug),
            clickCount: first.clickCount,
            bidCount: first.bidCount ?? 1,
            siteName: first.siteName,
            logoUrl: first.logoUrl,
            description: first.description,
            faviconUrl: first.faviconUrl,
          });
        }
      },
      error: () => {
        this.categoryData.set(null);
        this.hasMoreProducts.set(false);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
    });
  }

  /* ══════════════════════════════════════════════════════════════
     APACHE ECHARTS: INTERACTIVE BID PRESSURE & VELOCITY VISUALIZER
     ══════════════════════════════════════════════════════════════ */
  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.initChart(), 60);
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.echartsInstance) {
      this.echartsInstance.resize();
    }
  }

  setChartViewMode(mode: 'timeline' | 'hourly' | 'weekly'): void {
    this.chartViewMode.set(mode);
    this.updateChart();
  }

  setChartMetric(metric: 'both' | 'volume' | 'count'): void {
    this.chartMetric.set(metric);
    this.updateChart();
  }

  setChartTimePreset(preset: '1h' | '6h' | 'today' | 'all'): void {
    this.chartTimePreset.set(preset);
    this.updateChart();
  }

  private async initChart(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.chartContainerRef?.nativeElement) return;

    if (!this.echartsModule) {
      this.echartsModule = await import('echarts');
    }

    if (!this.echartsInstance) {
      this.echartsInstance = this.echartsModule.init(this.chartContainerRef.nativeElement, undefined, {
        renderer: 'svg',
      });

      if (typeof ResizeObserver !== 'undefined') {
        this.chartResizeObserver = new ResizeObserver(() => {
          this.echartsInstance?.resize();
        });
        this.chartResizeObserver.observe(this.chartContainerRef.nativeElement);
      }
    }

    this.updateChart();
  }

  updateChart(): void {
    if (!isPlatformBrowser(this.platformId) || !this.chartContainerRef?.nativeElement) return;
    if (!this.echartsInstance || !this.echartsModule) {
      void this.initChart();
      return;
    }

    const echartsLib = this.echartsModule;
    const stats = this.platformStats();
    if (!stats) return;

    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const currency = this.currencySymbol();
    const mode = this.chartViewMode();
    const metric = this.chartMetric();

    const textColor = isDark ? '#94a3b8' : '#64748b';
    const headingColor = isDark ? '#f8fafc' : '#0f172a';
    const gridLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const tooltipBg = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)';
    const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';

    let option: echarts.EChartsOption;

    if (mode === 'timeline') {
      let bids = stats.recentBidsTimeline ?? [];
      const preset = this.chartTimePreset();
      const now = Date.now();

      if (preset === '1h') {
        const oneHourAgo = now - 60 * 60 * 1000;
        const filtered = bids.filter((b) => new Date(b.createdAt).getTime() >= oneHourAgo);
        if (filtered.length > 0) bids = filtered;
      } else if (preset === '6h') {
        const sixHoursAgo = now - 6 * 60 * 60 * 1000;
        const filtered = bids.filter((b) => new Date(b.createdAt).getTime() >= sixHoursAgo);
        if (filtered.length > 0) bids = filtered;
      } else if (preset === 'today') {
        const startOfTodayUtc = new Date();
        startOfTodayUtc.setUTCHours(0, 0, 0, 0);
        const filtered = bids.filter((b) => new Date(b.createdAt).getTime() >= startOfTodayUtc.getTime());
        if (filtered.length > 0) bids = filtered;
      }

      // Sort bids chronologically
      const sortedBids = [...bids].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const seriesData = sortedBids.map((b) => {
        const t = new Date(b.createdAt).getTime();
        return {
          name: b.listingName,
          value: [t, Number(b.amount)],
          raw: b,
        };
      });

      option = {
        backgroundColor: 'transparent',
        grid: {
          left: '3%',
          right: '4%',
          top: '12%',
          bottom: '22%',
          containLabel: true,
        },
        tooltip: {
          trigger: 'item',
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: [10, 14],
          textStyle: { color: textColor },
          extraCssText:
            'box-shadow: 0 10px 30px rgba(0,0,0,0.3); border-radius: 12px; backdrop-filter: blur(8px);',
          formatter: (params: any) => {
            const raw = params.data?.raw;
            if (!raw) return '';
            const date = new Date(raw.createdAt);
            const timeStr = date.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            const utcTimeStr = `${String(date.getUTCHours()).padStart(2, '0')}:${String(
              date.getUTCMinutes()
            ).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')} UTC`;
            const currentBidDisplay = raw.currentBidLevel ? `
                  <div style="display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px;">
                    <span style="font-size: 11px; color: ${textColor};">Standing Rank Bid:</span>
                    <span style="font-size: 14px; font-weight: 700; font-family: 'Space Grotesk', monospace; color: ${headingColor};">
                      ${currency}${Number(raw.currentBidLevel).toFixed(2)}
                    </span>
                  </div>` : '';
            return `
              <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; min-width: 210px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 8px;">
                  <span style="font-weight: 700; font-size: 13px; color: ${headingColor};">${raw.listingName}</span>
                  <span style="font-size: 10px; padding: 2px 7px; border-radius: 9999px; background: rgba(249,87,56,0.14); color: #f95738; font-weight: 700;">${raw.categoryName}</span>
                </div>
                <div style="display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px;">
                  <span style="font-size: 11px; color: ${textColor};">Payment Received:</span>
                  <span style="font-size: 20px; font-weight: 800; font-family: 'Space Grotesk', monospace; color: #f95738;">
                    ${currency}${Number(raw.amount).toFixed(2)}
                  </span>
                </div>
                ${currentBidDisplay}
                <div style="font-size: 11px; color: ${textColor}; display: flex; flex-direction: column; gap: 3px; border-top: 1px solid ${gridLineColor}; padding-top: 6px;">
                  <div>🕒 <b>Local:</b> ${timeStr} <span style="opacity: 0.65">(${utcTimeStr})</span></div>
                  ${raw.paymentReference ? `<div>💳 <b>Payment ID:</b> <code style="font-family: monospace; background: rgba(249,87,56,0.08); color: #f95738; padding: 1px 4px; border-radius: 3px;">${raw.paymentReference}</code></div>` : ''}
                </div>
              </div>
            `;
          },
        },
        xAxis: {
          type: 'time',
          axisLine: { lineStyle: { color: gridLineColor } },
          axisLabel: {
            color: textColor,
            fontSize: 10,
            formatter: (val: number) => {
              const d = new Date(val);
              return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(
                2,
                '0'
              )}`;
            },
          },
          splitLine: { lineStyle: { color: gridLineColor, type: 'dashed' } },
        },
        yAxis: {
          type: 'value',
          name: `Payment (${currency})`,
          nameTextStyle: { color: textColor, fontSize: 10 },
          axisLine: { show: false },
          axisLabel: {
            color: textColor,
            fontSize: 10,
            formatter: (v: number) => `${currency}${v.toFixed(0)}`,
          },
          splitLine: { lineStyle: { color: gridLineColor } },
        },
        dataZoom: [
          {
            type: 'inside',
            start: 0,
            end: 100,
          },
          {
            type: 'slider',
            start: 0,
            end: 100,
            height: 18,
            bottom: 4,
            borderColor: 'transparent',
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(241, 245, 249, 0.7)',
            fillerColor: 'rgba(249, 87, 56, 0.2)',
            handleStyle: { color: '#f95738' },
            textStyle: { color: textColor, fontSize: 9 },
          },
        ],
        series: [
          {
            name: 'Bid Volume',
            type: 'line',
            smooth: 0.25,
            symbol: 'circle',
            symbolSize: 10,
            itemStyle: {
              color: '#f95738',
              borderColor: isDark ? '#0f172a' : '#ffffff',
              borderWidth: 2,
            },
            lineStyle: {
              color: '#f95738',
              width: 3,
            },
            areaStyle: {
              color: new echartsLib.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(249, 87, 56, 0.42)' },
                { offset: 1, color: 'rgba(249, 87, 56, 0.01)' },
              ]),
            },
            markPoint: {
              data: [{ type: 'max', name: 'Peak Bid' }],
              label: {
                formatter: (p: any) => `${currency}${p.value}`,
                fontSize: 10,
                fontWeight: 'bold',
                color: '#fff',
              },
              itemStyle: { color: '#f95738' },
            },
            markLine: {
              data: [{ type: 'average', name: 'Avg' }],
              lineStyle: { color: '#10b981', type: 'dotted', width: 2 },
              label: {
                formatter: (p: any) => `Avg: ${currency}${Number(p.value).toFixed(1)}`,
                position: 'insideEndTop',
                fontSize: 10,
                color: '#10b981',
                fontWeight: 600,
              },
            },
            data: seriesData,
          },
        ],
      };
    } else if (mode === 'hourly') {
      const hours = stats.hourlyBidPressures;
      const categories = hours.map((h) => `${String(h.hour).padStart(2, '0')}:00`);
      const volumes = hours.map((h) => Number(h.volume));
      const counts = hours.map((h) => h.bidCount);

      const series: any[] = [];
      const yAxes: any[] = [
        {
          type: 'value',
          name: `Volume (${currency})`,
          nameTextStyle: { color: textColor, fontSize: 10 },
          axisLabel: {
            color: textColor,
            fontSize: 10,
            formatter: (v: number) => `${currency}${v}`,
          },
          splitLine: { lineStyle: { color: gridLineColor } },
        },
      ];

      if (metric === 'both' || metric === 'count') {
        yAxes.push({
          type: 'value',
          name: 'Bids (#)',
          nameTextStyle: { color: textColor, fontSize: 10 },
          minInterval: 1,
          axisLabel: { color: textColor, fontSize: 10 },
          splitLine: { show: false },
        });
      }

      if (metric === 'both' || metric === 'volume') {
        series.push({
          name: 'Auction Volume',
          type: 'line',
          smooth: 0.35,
          symbol: 'circle',
          symbolSize: 7,
          itemStyle: { color: '#f95738' },
          lineStyle: { width: 3, color: '#f95738' },
          areaStyle: {
            color: new echartsLib.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(249, 87, 56, 0.4)' },
              { offset: 1, color: 'rgba(249, 87, 56, 0.01)' },
            ]),
          },
          data: volumes,
          markPoint: {
            data: [{ type: 'max', name: 'Peak Hour' }],
            itemStyle: { color: '#f95738' },
            label: { color: '#fff', fontSize: 10, fontWeight: 700 },
          },
        });
      }

      if (metric === 'both' || metric === 'count') {
        series.push({
          name: 'Bid Count',
          type: 'bar',
          yAxisIndex: metric === 'both' ? 1 : 0,
          barMaxWidth: 14,
          itemStyle: {
            color: '#10b981',
            borderRadius: [4, 4, 0, 0],
          },
          data: counts,
        });
      }

      option = {
        backgroundColor: 'transparent',
        grid: {
          left: '3%',
          right: metric === 'both' ? '4%' : '3%',
          top: '15%',
          bottom: '12%',
          containLabel: true,
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross', label: { backgroundColor: '#334155' } },
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: [10, 14],
          textStyle: { color: textColor },
          extraCssText: 'box-shadow: 0 10px 25px -5px rgba(0,0,0,0.25); border-radius: 12px;',
          formatter: (params: any) => {
            if (!Array.isArray(params) || params.length === 0) return '';
            const idx = params[0].dataIndex;
            const hourPoint = hours[idx];
            const avg =
              hourPoint.avgBid ?? (hourPoint.bidCount > 0 ? hourPoint.volume / hourPoint.bidCount : 0);
            return `
              <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; min-width: 170px;">
                <div style="font-weight: 700; font-size: 13px; color: ${headingColor}; margin-bottom: 6px;">
                  ⏱️ ${categories[idx]} UTC
                </div>
                <div style="font-size: 13px; color: #f95738; font-weight: 700; margin-bottom: 4px;">
                  Volume: ${currency}${Number(hourPoint.volume).toFixed(2)}
                </div>
                <div style="font-size: 12px; color: #10b981; font-weight: 600; margin-bottom: 4px;">
                  Bids: ${hourPoint.bidCount} transaction${hourPoint.bidCount === 1 ? '' : 's'}
                </div>
                <div style="font-size: 11px; color: ${textColor}; border-top: 1px solid ${gridLineColor}; padding-top: 4px;">
                  Avg Bid: ${currency}${Number(avg).toFixed(2)}
                </div>
              </div>
            `;
          },
        },
        xAxis: {
          type: 'category',
          data: categories,
          axisLine: { lineStyle: { color: gridLineColor } },
          axisLabel: {
            color: textColor,
            fontSize: 10,
            interval: 2,
          },
        },
        yAxis: yAxes,
        series,
      };
    } else {
      const days = stats.dailyBidPressures ?? [];
      const categories = days.map((d) => d.date);
      const volumes = days.map((d) => Number(d.volume));

      option = {
        backgroundColor: 'transparent',
        grid: {
          left: '3%',
          right: '4%',
          top: '15%',
          bottom: '12%',
          containLabel: true,
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          padding: [10, 14],
          textStyle: { color: textColor },
          extraCssText: 'box-shadow: 0 10px 25px -5px rgba(0,0,0,0.25); border-radius: 12px;',
          formatter: (params: any) => {
            if (!Array.isArray(params) || params.length === 0) return '';
            const idx = params[0].dataIndex;
            const day = days[idx];
            return `
              <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif;">
                <div style="font-weight: 700; font-size: 13px; color: ${headingColor}; margin-bottom: 4px;">
                  📅 ${day.date}
                </div>
                <div style="color: #f95738; font-weight: 700;">Volume: ${currency}${Number(day.volume).toFixed(2)}</div>
                <div style="color: #10b981; font-weight: 600;">Bids: ${day.bidCount} transactions</div>
              </div>
            `;
          },
        },
        xAxis: {
          type: 'category',
          data: categories,
          axisLine: { lineStyle: { color: gridLineColor } },
          axisLabel: { color: textColor, fontSize: 10 },
        },
        yAxis: [
          {
            type: 'value',
            name: `Volume (${currency})`,
            nameTextStyle: { color: textColor, fontSize: 10 },
            axisLabel: {
              color: textColor,
              formatter: (v: number) => `${currency}${v}`,
            },
            splitLine: { lineStyle: { color: gridLineColor } },
          },
        ],
        series: [
          {
            name: 'Daily Volume',
            type: 'bar',
            barMaxWidth: 26,
            itemStyle: {
              color: new echartsLib.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#f95738' },
                { offset: 1, color: '#e04426' },
              ]),
              borderRadius: [6, 6, 0, 0],
            },
            data: volumes,
          },
        ],
      };
    }

    this.echartsInstance.setOption(option, true);
  }
}
