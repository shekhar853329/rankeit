import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { CategoryDto, CategorySortBy, CategoryTreeNodeDto } from '../models/category.model';
import { PagedResult } from '../models/paged-result.model';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);

  getTree(): Observable<CategoryTreeNodeDto[]> {
    return this.http.get<CategoryTreeNodeDto[]>(`${API_BASE_URL}/api/categories/tree`);
  }

  getCategories(options: {
    parentSlug?: string | null;
    sortBy?: CategorySortBy;
    page?: number;
    pageSize?: number;
  }): Observable<PagedResult<CategoryDto>> {
    const params: Record<string, string> = {
      sortBy: options.sortBy ?? 'Trending',
      page: String(options.page ?? 1),
      pageSize: String(options.pageSize ?? 20),
    };
    if (options.parentSlug) {
      params['parentSlug'] = options.parentSlug;
    }
    return this.http.get<PagedResult<CategoryDto>>(`${API_BASE_URL}/api/categories`, { params });
  }
}
