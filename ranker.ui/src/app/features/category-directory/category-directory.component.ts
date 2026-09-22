import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { CategoryDto, CategorySortBy } from '../../core/models/category.model';
import { LeaderboardEntryDto } from '../../core/models/leaderboard.model';
import { CategoryService } from '../../core/services/category.service';
import { LeaderboardService } from '../../core/services/leaderboard.service';

export interface CategoryCard {
  category: CategoryDto;
  topEntries: LeaderboardEntryDto[];
}

const CATEGORY_ICONS = ['🤖', '🔍', '📣', '🏠', '💼', '🎮', '🛠️', '💰', '📈', '🎨'];

@Component({
  selector: 'app-category-directory',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './category-directory.component.html',
  styleUrl: './category-directory.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryDirectoryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly categoryService = inject(CategoryService);
  private readonly leaderboardService = inject(LeaderboardService);

  readonly parentSlug = signal<string | null>(null);
  readonly sortBy = signal<CategorySortBy>('Trending');
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly searchTerm = signal('');

  readonly hotCategories = signal<CategoryCard[]>([]);
  readonly cards = signal<CategoryCard[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(true);

  readonly sortOptions: { value: CategorySortBy; label: string }[] = [
    { value: 'Trending', label: 'Trending' },
    { value: 'Newest', label: 'Newest' },
    { value: 'Alphabetical', label: 'A-Z' },
  ];

  ngOnInit(): void {
    this.parentSlug.set(this.route.snapshot.paramMap.get('parentSlug'));
    this.loadHotCategories();
    this.load();
  }

  get filteredCards(): CategoryCard[] {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this.cards();
    }
    return this.cards().filter((c) => c.category.name.toLowerCase().includes(term));
  }

  setSortBy(sortBy: CategorySortBy): void {
    this.sortBy.set(sortBy);
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1) {
      return;
    }
    this.page.set(page);
    this.load();
  }

  categoryIcon(categoryId: number): string {
    return CATEGORY_ICONS[categoryId % CATEGORY_ICONS.length];
  }

  timeAgo(iso: string): string {
    const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) {
      return 'just now';
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  private loadHotCategories(): void {
    this.categoryService
      .getCategories({ parentSlug: this.parentSlug(), sortBy: 'Trending', page: 1, pageSize: 3 })
      .pipe(switchMap((result) => this.attachTopEntries(result.items)))
      .subscribe((cards) => this.hotCategories.set(cards));
  }

  private load(): void {
    this.loading.set(true);
    this.categoryService
      .getCategories({
        parentSlug: this.parentSlug(),
        sortBy: this.sortBy(),
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .pipe(
        switchMap((result) => {
          this.totalCount.set(result.totalCount);
          return this.attachTopEntries(result.items);
        }),
      )
      .subscribe((cards) => {
        this.cards.set(cards);
        this.loading.set(false);
      });
  }

  private attachTopEntries(categories: CategoryDto[]): Observable<CategoryCard[]> {
    if (categories.length === 0) {
      return of([]);
    }
    return forkJoin(
      categories.map((category) =>
        this.leaderboardService.getCategoryLeaderboard(category.slug, 1, 3).pipe(
          map((response): CategoryCard => ({ category, topEntries: response.leaderboard.items })),
          catchError(() => of<CategoryCard>({ category, topEntries: [] })),
        ),
      ),
    );
  }
}
