import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CategoryLeaderboardResponseDto, GlobalLeaderboardEntryDto } from '../../core/models/leaderboard.model';
import { CategoryDto } from '../../core/models/category.model';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { CategoryService } from '../../core/services/category.service';
import { SignalrService } from '../../core/services/signalr.service';
import { CategoryTabsComponent } from '../../shared/category-tabs/category-tabs.component';

interface FeedRow {
  rank: number;
  listingId: number;
  listingName: string;
  listingUrl: string;
  currentBidAmount: number;
  categoryName: string;
  categorySlug: string;
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
  private readonly destroyRef = inject(DestroyRef);

  private joinedCategoryGroup: string | null = null;

  readonly tabs = signal<CategoryDto[]>([]);
  readonly trendingCategories = signal<CategoryDto[]>([]);
  readonly selectedSlug = signal<string | null>(null);
  readonly heroUrl = signal('');

  readonly loading = signal(true);
  readonly globalEntries = signal<GlobalLeaderboardEntryDto[]>([]);
  readonly categoryData = signal<CategoryLeaderboardResponseDto | null>(null);

  readonly rows = computed<FeedRow[]>(() => {
    if (this.selectedSlug() === null) {
      return this.globalEntries().map((e) => ({
        rank: e.rank,
        listingId: e.listingId,
        listingName: e.listingName,
        listingUrl: e.listingUrl,
        currentBidAmount: e.currentBidAmount,
        categoryName: e.categoryName,
        categorySlug: e.categorySlug,
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
    }));
  });

  /** Price to become #1 in the selected category; null in "All" mode where no single price applies. */
  readonly claimPrice = computed<number | null>(() => {
    const data = this.categoryData();
    if (this.selectedSlug() === null || !data) {
      return null;
    }
    const currentTop = data.leaderboard.items[0]?.currentBidAmount;
    return currentTop !== undefined ? currentTop + data.minBidIncrement : data.minStartingBid;
  });

  ngOnInit(): void {
    this.categoryService.getCategories({ sortBy: 'Trending', pageSize: 8 }).subscribe((result) => {
      this.tabs.set(result.items);
      this.trendingCategories.set(result.items.slice(0, 6));
    });

    this.loadSelection();
    void this.signalr.joinGlobalGroup();

    this.destroyRef.onDestroy(() => {
      void this.signalr.leaveGlobalGroup();
      if (this.joinedCategoryGroup) {
        void this.signalr.leaveCategoryGroup(this.joinedCategoryGroup);
      }
    });

    this.signalr.rankUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((payload) => {
      const slug = this.selectedSlug();
      if (slug === null && payload.becameCategoryTop) {
        this.loadGlobal();
      } else if (slug !== null && payload.categorySlug === slug) {
        this.loadCategory(slug);
      }
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

  private loadSelection(): void {
    this.loading.set(true);
    const slug = this.selectedSlug();
    if (slug === null) {
      this.loadGlobal();
    } else {
      this.loadCategory(slug);
    }
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
