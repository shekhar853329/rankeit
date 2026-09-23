import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { CategoryLeaderboardResponseDto, GlobalLeaderboardEntryDto } from '../models/leaderboard.model';
import { DailyListingsResponseDto } from '../models/daily-listing.model';

@Injectable({ providedIn: 'root' })
export class LeaderboardService {
  private readonly http = inject(HttpClient);

  getCategoryLeaderboard(
    categorySlug: string,
    page = 1,
    pageSize = 25,
  ): Observable<CategoryLeaderboardResponseDto> {
    return this.http.get<CategoryLeaderboardResponseDto>(
      `${API_BASE_URL}/api/leaderboard/category/${encodeURIComponent(categorySlug)}`,
      { params: { page: String(page), pageSize: String(pageSize) } },
    );
  }

  getGlobalLeaderboard(topN = 20): Observable<GlobalLeaderboardEntryDto[]> {
    return this.http.get<GlobalLeaderboardEntryDto[]>(`${API_BASE_URL}/api/leaderboard/global`, {
      params: { topN: String(topN) },
    });
  }

  getDailyListings(page = 1, pageSize = 5): Observable<DailyListingsResponseDto> {
    return this.http.get<DailyListingsResponseDto>(`${API_BASE_URL}/api/leaderboard/daily`, {
      params: { page: String(page), pageSize: String(pageSize) },
    });
  }
}
