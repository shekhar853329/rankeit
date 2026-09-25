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
import { DecimalPipe } from '@angular/common';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { Subject } from 'rxjs';
import { CategoryLeaderboardResponseDto, LeaderboardEntryDto } from '../../core/models/leaderboard.model';
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
export class LeaderboardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly leaderboardService = inject(LeaderboardService);
  private readonly categoryService = inject(CategoryService);
  private readonly signalr = inject(SignalrService);
  private readonly listingService = inject(ListingService);
  private readonly modalService = inject(ModalService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlMetadataService = inject(UrlMetadataService);

  // ── Category metadata ──────────────────────────────────────
  readonly categorySlug = signal('');
  readonly categoryId = signal<number | null>(null);
  readonly categoryName = signal('');
  readonly minBidIncrement = signal(1);
  readonly minStartingBid = signal(10);

  // ── Feed state ─────────────────────────────────────────────
  readonly entries = signal<LeaderboardEntryDto[]>([]);
  readonly totalCount = signal(0);
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

  // ── Command bar form state ─────────────────────────────────
  readonly sidebarUrl = signal('');
  readonly productTitle = signal('');
  readonly urlMetadata = signal<UrlMetadataDto | null>(null);
  readonly metadataLoading = signal(false);
  private readonly urlChange$ = new Subject<string>();
  readonly claimCategoryData = signal<CategoryLeaderboardResponseDto | null>(null);
  readonly claimAmount = signal<number | null>(null);
  readonly targetRank = signal(1);

  readonly claimPrice = computed<number | null>(() => {
    const data = this.claimCategoryData();
    if (!data) return this.minStartingBid();
    const currentTop = data.leaderboard.items[0]?.currentBidAmount;
    return currentTop !== undefined ? currentTop + data.minBidIncrement : data.minStartingBid;
  });

  readonly effectiveClaimAmount = computed<number | null>(() => this.claimAmount() ?? this.claimPrice());

  readonly reigningChampion = computed<LeaderboardEntryDto | null>(() => {
    const items = this.entries();
    return items.length > 0 ? items[0] : null;
  });

  ngOnInit(): void {
    // Load trending categories for the sidebar
    this.categoryService.getCategories({ sortBy: 'Trending', pageSize: 6 }).subscribe((result) => {
      this.trendingCategories.set(result.items);
    });

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
      if (payload.categorySlug === this.categorySlug()) this.refresh();
      this.loadTop3Bidders();
    });

    this.signalr.listingClicked$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ listingId, clickCount }) => {
      this.clickCounts.update((map) => ({ ...map, [listingId]: clickCount }));
    });

    this.destroyRef.onDestroy(() => void this.signalr.leaveCategoryGroup(this.categorySlug()));

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
    const current = this.effectiveClaimAmount() ?? 0;
    this.claimAmount.set(current + Math.max(this.minBidIncrement(), 1));
  }

  decrementClaimAmount(): void {
    const floor = this.claimPrice() ?? 1;
    const current = this.effectiveClaimAmount() ?? floor;
    this.claimAmount.set(Math.max(current - Math.max(this.minBidIncrement(), 1), floor));
  }

  prepareOutbid(entry: LeaderboardEntryDto, minAmount: number, rank?: number): void {
    this.claimAmount.set(minAmount);
    if (rank !== undefined) {
      this.targetRank.set(rank);
    }
    const input = document.getElementById('category-claim-url') as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  initiateClaim(): void {
    const categoryId = this.categoryId();
    if (categoryId === null) return;
    const amount = this.effectiveClaimAmount() ?? 10;
    const meta = this.urlMetadata();
    const title = this.productTitle() || meta?.siteName || '';

    this.modalService.openClaimModal({
      rank: this.targetRank(),
      categoryName: this.categoryName(),
      amount,
      categoryId,
      minStartingBid: this.minStartingBid(),
      minBidIncrement: this.minBidIncrement(),
      listingId: null,
      listingName: title,
      listingUrl: this.sidebarUrl(),
      siteName: title || null,
      logoUrl: meta?.logoUrl ?? null,
      description: meta?.description ?? null,
      faviconUrl: meta?.faviconUrl ?? null,
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
}
