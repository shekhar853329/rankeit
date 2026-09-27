import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import type * as echarts from 'echarts';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { Subject } from 'rxjs';
import { CategoryLeaderboardResponseDto, LeaderboardEntryDto, PlatformStatsDto } from '../../core/models/leaderboard.model';
import { CategoryDto } from '../../core/models/category.model';
import { DailyListingEntryDto } from '../../core/models/daily-listing.model';
import { UrlMetadataDto } from '../../core/models/url-metadata.model';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { CategoryService } from '../../core/services/category.service';
import { SignalrService } from '../../core/services/signalr.service';
import { ListingService } from '../../core/services/listing.service';
import { ModalService } from '../../core/services/modal.service';
import { UrlMetadataService } from '../../core/services/url-metadata.service';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaderboardComponent implements OnInit, AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly leaderboardService = inject(LeaderboardService);
  private readonly categoryService = inject(CategoryService);
  private readonly signalr = inject(SignalrService);
  private readonly listingService = inject(ListingService);
  private readonly modalService = inject(ModalService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlMetadataService = inject(UrlMetadataService);
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild('bidChartContainer') chartContainerRef?: ElementRef<HTMLDivElement>;
  private echartsModule: typeof import('echarts') | null = null;
  private echartsInstance: echarts.ECharts | null = null;
  private chartResizeObserver: ResizeObserver | null = null;

  /* ── Category Bid Pressure Chart State ── */
  readonly categoryStats = signal<PlatformStatsDto | null>(null);
  readonly chartViewMode = signal<'timeline' | 'hourly' | 'weekly'>('timeline');
  readonly chartMetric = signal<'both' | 'volume' | 'count'>('both');
  readonly chartTimePreset = signal<'1h' | '6h' | 'today' | 'all'>('today');

  readonly todayTotalVolume = computed(() => {
    const stats = this.categoryStats();
    if (!stats) return 0;
    if (stats.recentBidsTimeline && stats.recentBidsTimeline.length > 0) {
      return stats.recentBidsTimeline.reduce((acc, b) => acc + Number(b.amount || 0), 0);
    }
    return stats.hourlyBidPressures.reduce((acc, h) => acc + Number(h.volume || 0), 0);
  });

  readonly todayTotalBids = computed(() => {
    const stats = this.categoryStats();
    if (!stats) return 0;
    if (stats.recentBidsTimeline && stats.recentBidsTimeline.length > 0) {
      return stats.recentBidsTimeline.length;
    }
    return stats.hourlyBidPressures.reduce((acc, h) => acc + h.bidCount, 0);
  });

  readonly peakBidInfo = computed(() => {
    const stats = this.categoryStats();
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

  // ── Category metadata ──────────────────────────────────────
  readonly categorySlug = signal('');
  readonly categoryId = signal<number | null>(null);
  readonly categoryName = signal('');
  readonly minBidIncrement = signal(1);
  readonly minStartingBid = signal(1);

  // ── Feed state ─────────────────────────────────────────────
  readonly entries = signal<LeaderboardEntryDto[]>([]);
  readonly totalCount = signal(0);
  readonly timeMode = signal<'alltime' | 'today'>('alltime');
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly clickCounts = signal<Record<number, number>>({});
  readonly Math = Math;

  // ── Sidebar: trending ──────────────────────────────────────
  readonly trendingCategories = signal<CategoryDto[]>([]);

  // ── Stats bar: top 3 bidders of today ─────────────────────
  readonly top3Bidders = signal<DailyListingEntryDto[]>([]);

  // ── Timer & Clock ──────────────────────────────────────────
  private countdownTimerId: ReturnType<typeof setInterval> | null = null;
  readonly countdownText = signal('00h : 00m : 00s');
  readonly currentUtcTime = signal('00:00 UTC');

  // ── Command bar form state ─────────────────────────────────
  readonly sidebarUrl = signal('');
  readonly sidebarUrlDirty = signal(false);
  readonly productTitle = signal('');
  readonly urlMetadata = signal<UrlMetadataDto | null>(null);
  readonly metadataLoading = signal(false);
  private readonly urlChange$ = new Subject<string>();
  readonly claimCategoryData = signal<CategoryLeaderboardResponseDto | null>(null);
  readonly claimAmount = signal<number | null>(null);
  readonly isAmountFieldFocused = signal(false);
  readonly targetRank = signal(1);

  readonly claimPrice = computed<number | null>(() => {
    const data = this.claimCategoryData();
    if (!data) return this.minStartingBid();
    const currentTop = data.leaderboard.items[0]?.currentBidAmount;
    return currentTop !== undefined ? currentTop + data.minBidIncrement : data.minStartingBid;
  });

  readonly effectiveClaimAmount = computed<number | null>(() => this.claimAmount() ?? this.claimPrice());

  readonly currencySymbol = '₹';

  readonly reigningChampion = computed<LeaderboardEntryDto | null>(() => {
    const items = this.entries();
    return items.length > 0 ? items[0] : null;
  });

  ngOnInit(): void {
    this.startCountdownTimer();

    // Load trending categories for the sidebar
    this.categoryService.getCategories({ sortBy: 'Trending', pageSize: 6 }).subscribe((result) => {
      this.trendingCategories.set(result.items);
    });

    this.loadTop3Bidders();

    this.route.fragment.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((fragment) => {
      if (fragment === 'claim-rank-section') {
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          const el = document.getElementById('claim-rank-section');
          if (el) {
            el.classList.add('command-bar-wrapper--highlight');
            setTimeout(() => el.classList.remove('command-bar-wrapper--highlight'), 2200);
          }
          const input = document.getElementById('category-claim-url') as HTMLInputElement | null;
          if (input) input.focus({ preventScroll: true });
        }, 400);
      }
    });

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
          this.loadCategoryStats(slug);
          return this.leaderboardService.getCategoryLeaderboard(slug, this.page(), this.pageSize(), this.timeMode()).pipe(
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
        this.loadCategoryStats(this.categorySlug());
      }
      this.loadTop3Bidders();
    });

    this.signalr.listingClicked$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ listingId, clickCount }) => {
      this.clickCounts.update((map) => ({ ...map, [listingId]: clickCount }));
    });

    this.destroyRef.onDestroy(() => {
      this.chartResizeObserver?.disconnect();
      this.echartsInstance?.dispose();
      this.echartsInstance = null;
      void this.signalr.leaveCategoryGroup(this.categorySlug());
      if (this.countdownTimerId) clearInterval(this.countdownTimerId);
    });

    // Debounced URL metadata fetch for the field
    this.urlChange$
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap((url) => {
          this.metadataLoading.set(true);
          return this.urlMetadataService.fetch(url);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((meta) => {
        this.urlMetadata.set(meta);
        if (meta?.siteName && !this.productTitle()) {
          this.productTitle.set(meta.siteName);
        }
        this.metadataLoading.set(false);
      });
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

  setTimeMode(mode: 'alltime' | 'today'): void {
    if (this.timeMode() === mode) return;
    this.timeMode.set(mode);
    this.page.set(1);
    this.refresh();
  }

  refresh(): void {
    this.leaderboardService
      .getCategoryLeaderboard(this.categorySlug(), this.page(), this.pageSize(), this.timeMode())
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

  isSidebarUrlValid(): boolean {
    const v = this.sidebarUrl().trim();
    if (!v) return false;
    if (/^@\S+$/.test(v)) return true;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      /* fall */
    }
    return /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}(\/\S*)?$/.test(
      v
    );
  }

  faviconDisplayUrl(): string | null {
    const v = this.sidebarUrl().trim();
    if (!v || !this.isSidebarUrlValid()) return null;
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
  }

  onSidebarUrlChange(value: string): void {
    this.sidebarUrl.set(value);
    this.sidebarUrlDirty.set(true);
    if (this.isSidebarUrlValid()) {
      this.urlChange$.next(value.trim());
    } else {
      this.urlMetadata.set(null);
      this.metadataLoading.set(false);
    }
  }

  onFaviconError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  onListingFaviconError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  incrementClaimAmount(): void {
    const current = this.effectiveClaimAmount() ?? (this.claimPrice() ?? 1);
    this.claimAmount.set(current + Math.max(this.minBidIncrement(), 1));
  }

  decrementClaimAmount(): void {
    const floor = 1;
    const current = this.effectiveClaimAmount() ?? (this.claimPrice() ?? 1);
    const inc = Math.max(this.minBidIncrement(), 1);
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
      const fallback = this.claimPrice() ?? this.minStartingBid() ?? 1;
      this.claimAmount.set(fallback);
    } else {
      this.claimAmount.set(Math.max(1, Math.round(num * 100) / 100));
    }
  }

  moveToClaimRank(targetAmount?: number, rank?: number): void {
    const minInc = this.minBidIncrement() || 1;
    const currentTop = this.entries()[0]?.currentBidAmount;
    const minReq = currentTop !== undefined ? currentTop + minInc : this.minStartingBid();
    const amount = targetAmount ?? minReq;

    this.claimAmount.set(Math.max(amount, 1));
    this.targetRank.set(rank ?? (amount >= minReq ? 1 : 2));

    // NEVER auto populate website URL or product title!

    window.scrollTo({ top: 0, behavior: 'smooth' });

    const section = document.getElementById('claim-rank-section');
    if (section) {
      section.classList.add('command-bar-wrapper--highlight');
      setTimeout(() => section.classList.remove('command-bar-wrapper--highlight'), 2200);
    }

    const input = document.getElementById('category-claim-url') as HTMLInputElement | null;
    if (input) {
      setTimeout(() => input.focus({ preventScroll: true }), 350);
    }
  }

  prepareOutbid(entry: LeaderboardEntryDto, minAmount?: number, rank?: number): void {
    this.moveToClaimRank(minAmount, rank);
  }

  initiateClaim(targetListingUrl?: string): void {
    const categoryId = this.categoryId();
    if (categoryId === null) return;
    const minInc = this.minBidIncrement() || 1;
    const currentTop = this.entries()[0]?.currentBidAmount ?? null;
    const minReq = currentTop !== null ? currentTop + minInc : this.minStartingBid();
    const amount = Math.max(this.effectiveClaimAmount() ?? minReq, 1);

    let rank = 1;
    if (currentTop !== null && amount <= currentTop) {
      const higherCount = this.entries().filter((e) => e.currentBidAmount >= amount).length;
      rank = higherCount + 1;
    }

    const meta = this.urlMetadata();
    const title = this.productTitle() || meta?.siteName || '';
    const url = targetListingUrl || this.sidebarUrl() || '';
    const enteredUrl = url.trim().toLowerCase();

    // Check if this URL already exists in this category
    const existing = this.entries().find(
      (e) => e.listingUrl.trim().toLowerCase() === enteredUrl
    );

    this.modalService.openClaimModal({
      rank,
      categoryName: this.categoryName(),
      amount,
      categoryId,
      minStartingBid: this.minStartingBid(),
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
      categorySlug: this.categorySlug(),
      onSuccess: () => this.refresh(),
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

  /* ── Timer & Dropdown Helpers ── */
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

  onProductTitleChange(value: string): void {
    this.productTitle.set(value);
  }

  canClaimRank(): boolean {
    return this.isSidebarUrlValid() && this.categoryId() !== null;
  }

  /* ── Interactive Bid Pressure Chart Methods ── */
  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      void this.initChart();
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

  loadCategoryStats(slug: string): void {
    if (!slug) return;
    this.leaderboardService.getPlatformStats(slug).subscribe({
      next: (stats) => {
        this.categoryStats.set(stats);
        if (isPlatformBrowser(this.platformId)) {
          setTimeout(() => this.updateChart(), 40);
        }
      },
    });
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
    const stats = this.categoryStats();
    if (!stats) return;

    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const currency = '₹';
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
