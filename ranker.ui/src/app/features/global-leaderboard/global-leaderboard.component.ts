import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
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
export class GlobalLeaderboardComponent implements OnInit {
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
    let list = [...this.rows()];
    const query = this.searchQuery().trim().toLowerCase();
    if (query) {
      list = list.filter(
        (r) =>
          r.listingName.toLowerCase().includes(query) ||
          (r.siteName && r.siteName.toLowerCase().includes(query)) ||
          (r.description && r.description.toLowerCase().includes(query)) ||
          r.categoryName.toLowerCase().includes(query)
      );
    }

    return list;
  });

  readonly displayedRows = computed<FeedRow[]>(() => {
    return this.allMatchingRows();
  });

  readonly nextChunkCount = computed(() => (this.hasMoreProducts() ? 10 : 0));
  readonly hasMoreBidders = computed(() => this.hasMoreProducts());
  readonly showAllRows = computed(() => !this.hasMoreProducts());

  readonly reigningChampion = computed<FeedRow | null>(() => {
    const r = this.rows();
    return r.length > 0 ? r[0] : null;
  });

  /* ── Pricing & Validation ── */
  readonly claimPrice = computed<number | null>(() => {
    const data = this.claimCategoryData();
    if (this.claimSlug() === null || !data) return null;
    const currentTop = data.leaderboard.items[0]?.currentBidAmount;
    return currentTop !== undefined ? currentTop + data.minBidIncrement : data.minStartingBid;
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
    const hasCategory = !!(this.claimSlug() || this.claimPositionSlug() || this.allCategories().length > 0);
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
      if (!this.claimSlug() && result.items.length > 0) {
        this.selectClaimCategory(result.items[0].slug);
      }
    });

    this.loadSelection();
    void this.signalr.joinGlobalGroup();

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
      if (slug === null && payload.becameCategoryTop) {
        this.loadGlobal(currentCount);
      } else if (slug !== null && payload.categorySlug === slug) {
        this.loadCategory(slug, currentCount);
      }
      this.loadTop3Bidders();
      this.loadTodayAuctionTop();
      this.loadAllTimeHallOfFame();

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
  }

  /* ── Interactive Actions ── */
  onSearchChange(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
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
    if (slug === this.selectedSlug()) return;
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
  }

  selectClaimCategory(slug: string | null): void {
    if (slug === this.claimSlug()) return;
    this.claimSlug.set(slug);
    this.claimAmount.set(null);
    this.targetRank.set(1);

    if (!slug) {
      this.claimCategoryData.set(null);
      return;
    }
    this.leaderboardService.getCategoryLeaderboard(slug, 1, 20).subscribe((data) =>
      this.claimCategoryData.set(data)
    );
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
    this.selectClaimCategory(slug);
    this.closeCategoryDropdown();
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
    const current = this.effectiveClaimAmount() ?? 0;
    this.claimAmount.set(current + Math.max(step, 1));
  }

  decrementClaimAmount(): void {
    const step = this.incrementForCategory(this.claimSlug() ?? this.claimPositionSlug());
    const floor = this.claimPrice() ?? 1;
    const current = this.effectiveClaimAmount() ?? floor;
    this.claimAmount.set(Math.max(current - Math.max(step, 1), floor));
  }

  prepareOutbid(productName: string, minAmount: number, categorySlug?: string, rank?: number): void {
    this.claimAmount.set(minAmount);
    if (rank !== undefined) {
      this.targetRank.set(rank);
    }
    if (categorySlug) {
      this.selectClaimCategory(categorySlug);
    }

    const urlInput = document.getElementById('claim-url') as HTMLInputElement | null;
    if (urlInput) {
      urlInput.focus();
      urlInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    this.showToastNotification(
      `Outbid staged against ${productName} for ${this.currencySymbol()}${minAmount}`
    );
  }

  showToastNotification(message: string): void {
    this.toastMessage.set(message);
    this.toastVisible.set(true);
    if (this.toastTimerId) clearTimeout(this.toastTimerId);
    this.toastTimerId = setTimeout(() => this.toastVisible.set(false), 4000);
  }

  claimRank(): void {
    let slug = this.claimSlug() ?? this.claimPositionSlug();
    if (!slug && this.allCategories().length > 0) {
      slug = this.allCategories()[0].slug;
      this.selectClaimCategory(slug);
    }

    if (!slug) {
      this.toast.show('Choose a category first', 'info');
      return;
    }

    const data = this.claimCategoryData() ?? this.claimPositionData();
    if (!data) {
      void this.router.navigate(['/leaderboard', slug]);
      return;
    }

    const amount = this.effectiveClaimAmount() ?? 10;
    const url = this.heroUrl();
    const meta = this.urlMetadata();
    const title = this.productTitle() || meta?.siteName || '';

    this.modalService.openClaimModal({
      rank: this.targetRank(),
      categoryName: data.categoryName,
      amount,
      categoryId: data.categoryId,
      minStartingBid: data.minStartingBid,
      minBidIncrement: data.minBidIncrement,
      listingId: null,
      listingName: title,
      listingUrl: url,
      siteName: title || null,
      logoUrl: meta?.logoUrl ?? null,
      description: meta?.description ?? null,
      faviconUrl: meta?.faviconUrl ?? null,
      onSuccess: () => {
        void this.router.navigate(['/leaderboard', slug]);
      },
    });
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
    if (slug === null) {
      this.loadGlobal(count);
    } else {
      this.loadCategory(slug, count);
    }
  }

  private loadTop3Bidders(): void {
    this.leaderboardService.getDailyListings(1, 3).subscribe((result) => {
      const today = result.items[0];
      if (today) this.top3Bidders.set(today.entries.slice(0, 3));
    });
  }

  private loadGlobal(count = this.visibleCount()): void {
    // Request count + 1 so we can verify if more records exist on the server
    this.leaderboardService.getGlobalLeaderboard(count + 1, this.timeMode()).subscribe({
      next: (entries) => {
        const hasMore = entries.length > count;
        this.hasMoreProducts.set(hasMore);
        this.globalEntries.set(entries.slice(0, count));
        this.loading.set(false);
        this.loadingMore.set(false);

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
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
      },
    });
  }

  private loadPlatformStats(): void {
    this.leaderboardService.getPlatformStats().subscribe({
      next: (stats) => this.platformStats.set(stats),
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

  private loadCategory(slug: string, count = this.visibleCount()): void {
    this.leaderboardService.getCategoryLeaderboard(slug, 1, count).subscribe({
      next: (data) => {
        this.categoryData.set(data);
        this.hasMoreProducts.set(data.leaderboard.totalCount > count);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        this.categoryData.set(null);
        this.hasMoreProducts.set(false);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
    });
  }
}
