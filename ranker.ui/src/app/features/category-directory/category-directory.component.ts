import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CategoryDto, CategorySortBy } from '../../core/models/category.model';
import { CategoryService } from '../../core/services/category.service';

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

  readonly parentSlug = signal<string | null>(null);
  readonly sortBy = signal<CategorySortBy>('Trending');
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly searchTerm = signal('');

  readonly categories = signal<CategoryDto[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(true);

  readonly sortOptions: { value: CategorySortBy; label: string }[] = [
    { value: 'Trending', label: 'Trending' },
    { value: 'Newest', label: 'Newest' },
    { value: 'Alphabetical', label: 'A-Z' },
  ];

  ngOnInit(): void {
    this.parentSlug.set(this.route.snapshot.paramMap.get('parentSlug'));
    this.load();
  }

  get filteredCategories(): CategoryDto[] {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this.categories();
    }
    return this.categories().filter((c) => c.name.toLowerCase().includes(term));
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

  private load(): void {
    this.loading.set(true);
    this.categoryService
      .getCategories({
        parentSlug: this.parentSlug(),
        sortBy: this.sortBy(),
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .subscribe((result) => {
        this.categories.set(result.items);
        this.totalCount.set(result.totalCount);
        this.loading.set(false);
      });
  }
}
