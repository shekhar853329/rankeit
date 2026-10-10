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
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import type * as echarts from 'echarts';
import { Subject, catchError, combineLatest, combineLatestWith, debounceTime, distinctUntilChanged, filter, map, of, switchMap } from 'rxjs';
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
import { SeoService } from '../../core/services/seo.service';
import { ClaimService } from '../../core/services/claim.service';

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
  private readonly router = inject(Router);
  private readonly leaderboardService = inject(LeaderboardService);
  private readonly categoryService = inject(CategoryService);
  private readonly signalr = inject(SignalrService);
  private readonly listingService = inject(ListingService);
  private readonly modalService = inject(ModalService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlMetadataService = inject(UrlMetadataService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly seo = inject(SeoService);
  private readonly claimService = inject(ClaimService);

  @ViewChild('claimChartContainer') chartContainerRef?: ElementRef<HTMLDivElement>;
  private echartsModule: typeof import('echarts') | null = null;
  private echartsInstance: echarts.ECharts | null = null;
  private chartResizeObserver: ResizeObserver | null = null;
  private chartIntersectionObserver: IntersectionObserver | null = null;

  /* ── Category Claim Pressure Chart State ── */
  readonly categoryStats = signal<PlatformStatsDto | null>(null);
  readonly chartViewMode = signal<'timeline' | 'hourly' | 'weekly'>('timeline');
  readonly chartMetric = signal<'both' | 'volume' | 'count'>('both');
  readonly chartTimePreset = signal<'1h' | '6h' | 'today' | 'all'>('all');
  private currentLoadedState = { slug: '', mode: '' };

  /* ── Selection-Aware Filtered Claims Computed Signal ── */
  readonly currentFilteredClaims = computed(() => {
    const stats = this.categoryStats();
    if (!stats?.recentClaimsTimeline) return [];
    const claims = stats.recentClaimsTimeline;
    const preset = this.chartTimePreset();
    const mode = this.timeMode();
    const now = Date.now();

    if (preset === '1h') {
      const oneHourAgo = now - 60 * 60 * 1000;
      return claims.filter((b) => new Date(b.createdAt).getTime() >= oneHourAgo);
    }
    if (preset === '6h') {
      const sixHoursAgo = now - 6 * 60 * 60 * 1000;
      return claims.filter((b) => new Date(b.createdAt).getTime() >= sixHoursAgo);
    }
    if (preset === 'today') {
      const startOfTodayUtc = new Date();
      startOfTodayUtc.setUTCHours(0, 0, 0, 0);
      return claims.filter((b) => new Date(b.createdAt).getTime() >= startOfTodayUtc.getTime());
    }
    if (preset === 'all') {
      return claims;
    }
    if (mode === 'today') {
      const startOfTodayUtc = new Date();
      startOfTodayUtc.setUTCHours(0, 0, 0, 0);
      return claims.filter((b) => new Date(b.createdAt).getTime() >= startOfTodayUtc.getTime());
    }
    return claims;
  });

  readonly kpiVolumeLabel = computed(() => {
    if (this.chartViewMode() === 'timeline') {
      const preset = this.chartTimePreset();
      if (preset === '1h') return '1H Vol';
      if (preset === '6h') return '6H Vol';
      if (preset === 'all') return 'All-Time Vol';
      return "Today's Vol";
    }
    return this.timeMode() === 'today' ? "Today's Vol" : "All-Time Vol";
  });

  readonly displayedTotalVolume = computed(() => {
    const claims = this.currentFilteredClaims();
    if (claims.length > 0) {
      return claims.reduce((acc, b) => acc + Number(b.amount || 0), 0);
    }
    if ((this.chartTimePreset() === 'today' || this.timeMode() === 'today') && this.chartTimePreset() !== 'all') {
      const stats = this.categoryStats();
      if (stats?.hourlyClaimPressures && stats.hourlyClaimPressures.length > 0) {
        return stats.hourlyClaimPressures.reduce((acc, h) => acc + Number(h.volume || 0), 0);
      }
    }
    return 0;
  });

  readonly todayTotalVolume = computed(() => this.displayedTotalVolume());

  readonly displayedTotalClaims = computed(() => {
    const claims = this.currentFilteredClaims();
    if (claims.length > 0) {
      return claims.length;
    }
    if ((this.chartTimePreset() === 'today' || this.timeMode() === 'today') && this.chartTimePreset() !== 'all') {
      const stats = this.categoryStats();
      if (stats?.hourlyClaimPressures && stats.hourlyClaimPressures.length > 0) {
        return stats.hourlyClaimPressures.reduce((acc, h) => acc + h.claimCount, 0);
      }
    }
    return 0;
  });

  readonly todayTotalClaims = computed(() => this.displayedTotalClaims());

  readonly peakClaimInfo = computed(() => {
    const claims = this.currentFilteredClaims();
    if (claims.length > 0) {
      const highest = [...claims].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
      if (Number(highest.amount) > 0) {
        return {
          amount: highest.amount,
          label: highest.listingName,
          category: highest.categoryName,
          paymentRef: highest.paymentReference,
          time: highest.createdAt,
        };
      }
    }
    if ((this.chartTimePreset() === 'today' || this.timeMode() === 'today') && this.chartTimePreset() !== 'all') {
      const stats = this.categoryStats();
      const hourly = stats?.hourlyClaimPressures ?? [];
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
    }
    return null;
  });

  readonly avgClaimAmount = computed(() => {
    const count = this.displayedTotalClaims();
    const vol = this.displayedTotalVolume();
    return count > 0 ? vol / count : 0;
  });

  // ── Category metadata ──────────────────────────────────────
  readonly categorySlug = signal('');
  readonly categoryId = signal<number | null>(null);
  readonly categoryName = signal('');
  readonly minClaimIncrement = signal(1);
  readonly minStartingClaim = signal(1);

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

  // ── Stats bar: top 3 sponsors of today ─────────────────────
  readonly top3Sponsors = signal<DailyListingEntryDto[]>([]);

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
    if (!data) return this.minStartingClaim();
    const currentTop = data.leaderboard.items[0]?.currentClaimAmount;
    return currentTop !== undefined ? currentTop + data.minClaimIncrement : data.minStartingClaim;
  });

  readonly effectiveClaimAmount = computed<number | null>(() => this.claimAmount() ?? this.claimPrice());

  readonly claimAmountDisplayLength = computed<number>(() => {
    const val = this.isAmountFieldFocused()
      ? (this.claimAmount() !== null ? String(this.claimAmount()) : '')
      : String(this.effectiveClaimAmount() ?? this.minStartingClaim());
    return Math.max(1, val.length);
  });

  /** Whether the all-time validation API call is in-flight. */
  readonly allTimeValidating = signal(false);
  /** Validation error message from the calculate endpoint, or null when valid. */
  readonly allTimeValidationError = signal<string | null>(null);

  /** Observable driving the all-time cumulative validation — subscribed imperatively in ngOnInit. */
  private readonly allTimeValidation$ = toObservable(this.effectiveClaimAmount).pipe(
    combineLatestWith(
      toObservable(this.timeMode),
      toObservable(this.categorySlug),
      toObservable(this.sidebarUrl),
    ),
    debounceTime(400),
    distinctUntilChanged((a, b) =>
      a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
    ),
    switchMap(([amount, timeMode, categorySlug, url]) => {
      // Only validate in all-time mode when URL and category are both present
      if (timeMode !== 'alltime' || !categorySlug || !this.isSidebarUrlValid() || (amount ?? 0) <= 0) {
        return of({ status: 'clear' } as const);
      }

      const categoryId = this.categoryId();
      if (!categoryId) {
        return of({ status: 'clear' } as const);
      }

      this.allTimeValidating.set(true);

      return this.claimService.calculateClaimQuote({
        categoryId,
        listingUrl: url.trim(),
        targetClaimAmount: amount ?? 0,
        isAllTimeMode: true,
      }).pipe(
        map((res) => ({ status: 'done', res } as const)),
        catchError(() => of({ status: 'clear' } as const)),
      );
    }),
  );

  readonly spotRank = toSignal(
    toObservable(this.effectiveClaimAmount).pipe(
      combineLatestWith(
        toObservable(this.timeMode),
        toObservable(this.categorySlug),
      ),
      map(([amount, timeMode, categorySlug]) => ({
        amount: amount ?? 0,
        timeMode,
        categorySlug,
      })),
      debounceTime(300),
      distinctUntilChanged((a, b) =>
        a.amount === b.amount &&
        a.timeMode === b.timeMode &&
        a.categorySlug === b.categorySlug
      ),
      switchMap(({ amount, timeMode, categorySlug }) => {
        if (amount <= 0 || !categorySlug) return of(null);
        return this.leaderboardService.getSpotRank(amount, timeMode, categorySlug).pipe(
          catchError(() => of(null))
        );
      }),
      map((res) => res?.rank ?? null),
    ),
    { initialValue: null },
  );

  readonly currencySymbol = '$';

  readonly reigningChampion = computed<LeaderboardEntryDto | null>(() => {
    const items = this.entries();
    return items.length > 0 ? items[0] : null;
  });

  ngOnInit(): void {
    this.startCountdownTimer();

    // Load trending categories for the sidebar
    this.categoryService.getCategories({ sortBy: 'Trending', pageSize: 6 }).subscribe({
      next: (result) => {
        this.trendingCategories.set(result.items);
      },
      error: () => {},
    });

    this.loadTop3Sponsors();

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

    // Watch route param & query param changes to check whether all-time or today ranking is selected
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(
        map(([params, queryParams]) => {
          const slug = params.get('categorySlug') ?? '';
          const rawTime = (queryParams.get('timeMode') || queryParams.get('time') || '').toLowerCase();
          const mode: 'alltime' | 'today' =
            rawTime === 'today' ? 'today' : rawTime === 'alltime' ? 'alltime' : this.timeMode();
          return { slug, mode };
        }),
        filter(({ slug, mode }) => {
          if (!slug) return false;
          // Avoid duplicate data loading if already processed (e.g. by setTimeMode)
          if (this.currentLoadedState.slug === slug && this.currentLoadedState.mode === mode) {
            return false;
          }
          return true;
        }),
        switchMap(({ slug, mode }) => {
          this.currentLoadedState = { slug, mode };
          this.categorySlug.set(slug);
          this.timeMode.set(mode);
          this.chartTimePreset.set(mode === 'today' ? 'today' : 'all');
          this.loading.set(true);
          this.targetRank.set(1);
          void this.joinGroup(slug);
          this.loadCategoryStats(slug, mode);
          return this.leaderboardService.getCategoryLeaderboard(slug, this.page(), this.pageSize(), mode).pipe(
            catchError(() => of(null as CategoryLeaderboardResponseDto | null)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result: CategoryLeaderboardResponseDto | null) => {
        this.loading.set(false);
        if (!result) {
          this.notFound.set(true);
          return;
        }
        this.notFound.set(false);
        this.categoryId.set(result.categoryId);
        this.categoryName.set(result.categoryName);
        this.minClaimIncrement.set(result.minClaimIncrement);
        this.minStartingClaim.set(result.minStartingClaim);
        this.entries.set(result.leaderboard.items);
        this.totalCount.set(result.leaderboard.totalCount);
        this.claimCategoryData.set(result);

        const catName = result.categoryName;
        const catSlug = result.categorySlug;
        this.seo.updateTags({
          title: `Top ${catName} Products & Live Leaderboard`,
          description: `Browse real-time ${catName} rankings on RankUp. Verified live placements, transparent ranking algorithms, and active competition for the #1 spot in ${catName}.`,
          url: `https://rankup.cyou/leaderboard/${catSlug}`,
          keywords: [catName, `${catName} rankings`, `${catName} leaderboard`, 'product discovery', 'top products'],
          schema: {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: `Top ${catName} Products & Leaderboard`,
            description: `Live competitive rankings for ${catName} products on RankUp.`,
            url: `https://rankup.cyou/leaderboard/${catSlug}`,
            mainEntity: {
              '@type': 'ItemList',
              itemListElement: result.leaderboard.items.slice(0, 10).map((item, idx) => ({
                '@type': 'ListItem',
                position: idx + 1,
                name: item.listingName,
                url: `https://rankup.cyou/listings/${item.listingId}`,
              })),
            },
          },
        });
      });

    this.signalr.rankUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((payload) => {
      if (payload.categorySlug === this.categorySlug()) {
        this.refresh();
        this.loadCategoryStats(this.categorySlug());
      }
      this.loadTop3Sponsors();
    });

    this.signalr.listingClicked$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ listingId, clickCount }) => {
      this.clickCounts.update((map) => ({ ...map, [listingId]: clickCount }));
    });

    this.destroyRef.onDestroy(() => {
      this.chartIntersectionObserver?.disconnect();
      this.chartIntersectionObserver = null;
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
        const dynamicTitle = meta?.siteName?.trim();
        if (dynamicTitle) {
          this.productTitle.set(dynamicTitle);
        } else {
          this.productTitle.set(this.sidebarUrl().trim());
        }
        this.metadataLoading.set(false);
      });

    // All-time cumulative validation — plain subscription so signal writes don't create reactive loops
    this.allTimeValidation$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result.status === 'clear') {
          this.allTimeValidating.set(false);
          this.allTimeValidationError.set(null);
        } else {
          this.allTimeValidating.set(false);
          if (!result.res.success && result.res.errorCode === 'AllTimeCumulativeTooLow') {
            this.allTimeValidationError.set(
              result.res.errorMessage ?? 'Amount must exceed all-time total already paid for this listing.'
            );
          } else {
            this.allTimeValidationError.set(null);
          }
        }
      });
  }

  private loadTop3Sponsors(): void {
    this.leaderboardService.getDailyListings(1, 3).subscribe({
      next: (result) => {
        const today = result.items[0];
        if (today) this.top3Sponsors.set(today.entries.slice(0, 3));
      },
      error: () => {},
    });
  }

  private async joinGroup(slug: string): Promise<void> {
    if (slug) await this.signalr.joinCategoryGroup(slug);
  }

  setTimeMode(mode: 'alltime' | 'today'): void {
    if (this.timeMode() === mode) return;
    this.currentLoadedState = { slug: this.categorySlug(), mode };
    this.timeMode.set(mode);
    this.chartTimePreset.set(mode === 'today' ? 'today' : 'all');
    this.page.set(1);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { timeMode: mode },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.refresh();
    this.loadCategoryStats(this.categorySlug(), mode);
    this.updateChart();
  }

  refresh(): void {
    this.leaderboardService
      .getCategoryLeaderboard(this.categorySlug(), this.page(), this.pageSize(), this.timeMode())
      .subscribe({
        next: (result) => {
          this.entries.set(result.leaderboard.items);
          this.totalCount.set(result.leaderboard.totalCount);
          this.claimCategoryData.set(result);
        },
        error: () => {},
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
      this.productTitle.set('');
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
    this.claimAmount.set(current + Math.max(this.minClaimIncrement(), 1));
  }

  decrementClaimAmount(): void {
    const floor = 1;
    const current = this.effectiveClaimAmount() ?? (this.claimPrice() ?? 1);
    const inc = Math.max(this.minClaimIncrement(), 1);
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
      const fallback = this.claimPrice() ?? this.minStartingClaim() ?? 1;
      this.claimAmount.set(fallback);
    } else {
      this.claimAmount.set(Math.max(1, Math.round(num * 100) / 100));
    }
  }

  openChampionUrl(url: string): void {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  moveToClaimRank(targetAmount?: number, rank?: number): void {

    const minInc = this.minClaimIncrement() || 1;
    const currentTop = this.entries()[0]?.currentClaimAmount;
    const minReq = currentTop !== undefined ? currentTop + minInc : this.minStartingClaim();
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

  prepareClaim(entry: LeaderboardEntryDto, minAmount?: number, rank?: number): void {
    this.moveToClaimRank(minAmount, rank);
  }

  initiateClaim(targetListingUrl?: string): void {
    const categoryId = this.categoryId();
    if (categoryId === null) return;
    const minInc = this.minClaimIncrement() || 1;
    const currentTop = this.entries()[0]?.currentClaimAmount ?? null;
    const minReq = currentTop !== null ? currentTop + minInc : this.minStartingClaim();
    const amount = Math.max(this.effectiveClaimAmount() ?? minReq, 1);

    let rank = 1;
    if (currentTop !== null && amount <= currentTop) {
      const higherCount = this.entries().filter((e) => e.currentClaimAmount >= amount).length;
      rank = higherCount + 1;
    }

    const meta = this.urlMetadata();
    const url = targetListingUrl || this.sidebarUrl() || '';
    const trimmedUrl = url.trim();
    const dynamicTitle = meta?.siteName?.trim() || this.productTitle().trim();
    const title = dynamicTitle || trimmedUrl;
    const enteredUrl = trimmedUrl.toLowerCase();

    // Check if this URL already exists in this category
    const existing = this.entries().find(
      (e) => e.listingUrl.trim().toLowerCase() === enteredUrl
    );

    this.modalService.openClaimModal({
      rank,
      categoryName: this.categoryName(),
      amount,
      categoryId,
      isAllTimeMode: this.timeMode() === 'alltime',
      minStartingClaim: this.minStartingClaim(),
      minClaimIncrement: minInc,
      currentTopClaim: currentTop,
      currentClaimAmount: existing?.currentClaimAmount ?? 0,
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

  /** Converts a listing URL to a slug for the /website/:slug profile page. */
  slugifyUrl(url: string): string {
    try {
      let clean = url.trim();
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = 'https://' + clean;
      }
      return new URL(clean).hostname.replace(/^www\./, '').replace(/\./g, '-');
    } catch {
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].replace(/\./g, '-');
    }
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
    if (isPlatformBrowser(this.platformId)) {
      this.countdownTimerId = setInterval(tick, 1000);
    }
  }

  onProductTitleChange(value: string): void {
    this.productTitle.set(value);
  }

  canClaimRank(): boolean {
    return this.isSidebarUrlValid() && this.categoryId() !== null && this.allTimeValidationError() === null;
  }

  /* ── Interactive Claim Pressure Chart Methods ── */
  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId) && this.chartContainerRef?.nativeElement) {
      if (typeof IntersectionObserver !== 'undefined') {
        this.chartIntersectionObserver = new IntersectionObserver(
          (entries) => {
            if (entries[0]?.isIntersecting) {
              this.chartIntersectionObserver?.disconnect();
              this.chartIntersectionObserver = null;
              void this.initChart();
            }
          },
          { rootMargin: '250px' }
        );
        this.chartIntersectionObserver.observe(this.chartContainerRef.nativeElement);
      } else {
        setTimeout(() => void this.initChart(), 1000);
      }
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
    // If the user requests 'all' preset on the chart while in 'today' ranking mode,
    // fetch 'alltime' stats from backend so the full historical timeline points are loaded
    if (preset === 'all' && this.timeMode() === 'today') {
      this.loadCategoryStats(this.categorySlug(), 'alltime');
    } else {
      this.updateChart();
    }
  }

  loadCategoryStats(slug: string, mode: 'alltime' | 'today' = this.timeMode()): void {
    if (!slug) return;
    this.leaderboardService.getPlatformStats(slug, mode).subscribe({
      next: (stats) => {
        this.categoryStats.set(stats);
        if (isPlatformBrowser(this.platformId)) {
          setTimeout(() => this.updateChart(), 40);
        }
      },
      error: () => {},
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
    const currency = '$';
    const mode = this.chartViewMode();
    const metric = this.chartMetric();

    const textColor = isDark ? '#94a3b8' : '#64748b';
    const headingColor = isDark ? '#f8fafc' : '#0f172a';
    const gridLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const tooltipBg = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)';
    const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';

    let option: echarts.EChartsOption;

    if (mode === 'timeline') {
      const claims = this.currentFilteredClaims();
      const preset = this.chartTimePreset();
      const now = Date.now();
      const startOfTodayUtc = new Date();
      startOfTodayUtc.setUTCHours(0, 0, 0, 0);

      // Sort claims chronologically
      const sortedClaims = [...claims].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const seriesData = sortedClaims.map((b) => {
        const t = new Date(b.createdAt).getTime();
        return {
          name: b.listingName,
          value: [t, Number(b.amount)],
          raw: b,
        };
      });

      let xAxisMin: number | undefined;
      let xAxisMax: number | undefined;

      if (preset === '1h') {
        xAxisMin = now - 60 * 60 * 1000;
        xAxisMax = now;
      } else if (preset === '6h') {
        xAxisMin = now - 6 * 60 * 60 * 1000;
        xAxisMax = now;
      } else if (preset === 'today' || (this.timeMode() === 'today' && preset !== 'all')) {
        xAxisMin = startOfTodayUtc.getTime();
        xAxisMax = Math.max(now, startOfTodayUtc.getTime() + 60 * 60 * 1000);
      } else if (seriesData.length > 0) {
        xAxisMin = seriesData[0].value[0] - 30 * 60 * 1000;
        xAxisMax = seriesData[seriesData.length - 1].value[0] + 30 * 60 * 1000;
      } else {
        xAxisMin = startOfTodayUtc.getTime();
        xAxisMax = now;
      }

      option = {
        backgroundColor: 'transparent',
        grid: {
          left: '3%',
          right: '4%',
          top: '22%',
          bottom: '22%',
          containLabel: true,
        },
        title: seriesData.length === 0 ? {
          show: true,
          text: (preset === 'today' || (this.timeMode() === 'today' && preset !== 'all'))
            ? 'No claim payments registered today'
            : 'No claim payments registered for this period',
          subtext: 'Live payments will stream here in real-time as claims are placed',
          left: 'center',
          top: '38%',
          textStyle: {
            color: textColor,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          },
          subtextStyle: {
            color: isDark ? '#64748b' : '#94a3b8',
            fontSize: 11,
          },
        } : undefined,
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
            const currentClaimDisplay = raw.currentClaimLevel ? `
                  <div style="display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px;">
                    <span style="font-size: 11px; color: ${textColor};">Standing Rank Placement:</span>
                    <span style="font-size: 14px; font-weight: 700; font-family: 'Space Grotesk', monospace; color: ${headingColor};">
                      ${currency}${Number(raw.currentClaimLevel).toFixed(2)}
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
                ${currentClaimDisplay}
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
          min: xAxisMin,
          max: xAxisMax,
          axisLine: { lineStyle: { color: gridLineColor } },
          axisLabel: {
            color: textColor,
            fontSize: 10,
            formatter: (val: number) => {
              const d = new Date(val);
              if (preset === 'all') {
                return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(
                  d.getUTCMinutes()
                ).padStart(2, '0')}`;
              }
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
          min: seriesData.length === 0 ? 0 : undefined,
          max: seriesData.length === 0 ? 10 : undefined,
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
        dataZoom: seriesData.length > 0 ? [
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
        ] : [],
        series: [
          {
            name: 'Placement Volume',
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
            markPoint: seriesData.length > 0 ? {
              data: [{ type: 'max', name: 'Peak Placement' }],
              symbolSize: 40,
              symbolOffset: [0, '-5%'],
              label: {
                formatter: (p: any) => `${currency}${p.value}`,
                fontSize: 10,
                fontWeight: 'bold',
                color: '#fff',
              },
              itemStyle: { color: '#f95738' },
            } : undefined,
            markLine: seriesData.length > 0 ? {
              data: [{ type: 'average', name: 'Avg' }],
              lineStyle: { color: '#10b981', type: 'dotted', width: 2 },
              label: {
                formatter: (p: any) => `Avg: ${currency}${Number(p.value).toFixed(1)}`,
                position: 'insideEndTop',
                fontSize: 10,
                color: '#10b981',
                fontWeight: 600,
              },
            } : undefined,
            data: seriesData,
          },
        ],
      };
    } else if (mode === 'hourly') {
      const hours = stats.hourlyClaimPressures;
      const categories = hours.map((h) => `${String(h.hour).padStart(2, '0')}:00`);
      const volumes = hours.map((h) => Number(h.volume));
      const counts = hours.map((h) => h.claimCount);
      const hasAnyVolume = volumes.some((v) => v > 0);
      const hasAnyCount = counts.some((c) => c > 0);
      const hasActivity = hasAnyVolume || hasAnyCount;

      const series: any[] = [];
      const yAxes: any[] = [
        {
          type: 'value',
          min: hasAnyVolume ? undefined : 0,
          max: hasAnyVolume ? undefined : 10,
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
          min: hasAnyCount ? undefined : 0,
          max: hasAnyCount ? undefined : 5,
          name: 'Placements (#)',
          nameTextStyle: { color: textColor, fontSize: 10 },
          minInterval: 1,
          axisLabel: { color: textColor, fontSize: 10 },
          splitLine: { show: false },
        });
      }

      if (metric === 'both' || metric === 'volume') {
        series.push({
          name: 'Placement Volume',
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
          markPoint: hasAnyVolume ? {
            data: [{ type: 'max', name: 'Peak Hour' }],
            symbolSize: 40,
            symbolOffset: [0, '-40%'],
            itemStyle: { color: '#f95738' },
            label: { color: '#fff', fontSize: 10, fontWeight: 700 },
          } : undefined,
        });
      }

      if (metric === 'both' || metric === 'count') {
        series.push({
          name: 'Placement Count',
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
        title: !hasActivity ? {
          show: true,
          text: 'No hourly payment activity registered today',
          subtext: '24-hour distribution will populate as claims are made throughout the day',
          left: 'center',
          top: '38%',
          textStyle: {
            color: textColor,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          },
          subtextStyle: {
            color: isDark ? '#64748b' : '#94a3b8',
            fontSize: 11,
          },
        } : undefined,
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
              hourPoint.avgClaim ?? (hourPoint.claimCount > 0 ? hourPoint.volume / hourPoint.claimCount : 0);
            return `
              <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; min-width: 170px;">
                <div style="font-weight: 700; font-size: 13px; color: ${headingColor}; margin-bottom: 6px;">
                  ⏱️ ${categories[idx]} UTC
                </div>
                <div style="font-size: 13px; color: #f95738; font-weight: 700; margin-bottom: 4px;">
                  Volume: ${currency}${Number(hourPoint.volume).toFixed(2)}
                </div>
                <div style="font-size: 12px; color: #10b981; font-weight: 600; margin-bottom: 4px;">
                  Placements: ${hourPoint.claimCount} transaction${hourPoint.claimCount === 1 ? '' : 's'}
                </div>
                <div style="font-size: 11px; color: ${textColor}; border-top: 1px solid ${gridLineColor}; padding-top: 4px;">
                  Avg Placement: ${currency}${Number(avg).toFixed(2)}
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
      const days = stats.dailyClaimPressures ?? [];
      const categories = days.map((d) => d.date);
      const volumes = days.map((d) => Number(d.volume));
      const hasAnyDailyVolume = volumes.some((v) => v > 0);

      option = {
        backgroundColor: 'transparent',
        grid: {
          left: '3%',
          right: '4%',
          top: '15%',
          bottom: '12%',
          containLabel: true,
        },
        title: !hasAnyDailyVolume ? {
          show: true,
          text: 'No placement volume recorded over the past 7 days',
          subtext: 'Daily volume aggregation will appear as listings are claimed',
          left: 'center',
          top: '38%',
          textStyle: {
            color: textColor,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          },
          subtextStyle: {
            color: isDark ? '#64748b' : '#94a3b8',
            fontSize: 11,
          },
        } : undefined,
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
                <div style="color: #10b981; font-weight: 600;">Placements: ${day.claimCount} transactions</div>
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
            min: hasAnyDailyVolume ? undefined : 0,
            max: hasAnyDailyVolume ? undefined : 10,
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
