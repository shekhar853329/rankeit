import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { CategoryLeaderboardResponseDto, GlobalLeaderboardEntryDto, HallOfFameItemDto, LiveBidEventDto, PlatformStatsDto } from '../models/leaderboard.model';
import { DailyListingsResponseDto } from '../models/daily-listing.model';

@Injectable({ providedIn: 'root' })
export class LeaderboardService {
  private readonly http = inject(HttpClient);

  getCategoryLeaderboard(
    categorySlug: string,
    page = 1,
    pageSize = 25,
    timeMode = 'today',
    query?: string,
  ): Observable<CategoryLeaderboardResponseDto> {
    const params: Record<string, string> = { page: String(page), pageSize: String(pageSize), timeMode };
    if (query?.trim()) params['query'] = query.trim();
    return this.http.get<CategoryLeaderboardResponseDto>(
      `${API_BASE_URL}/api/leaderboard/category/${encodeURIComponent(categorySlug)}`,
      { params },
    );
  }

  getGlobalLeaderboard(topN = 20, timeMode = 'today', query?: string): Observable<GlobalLeaderboardEntryDto[]> {
    const params: Record<string, string> = { topN: String(topN), timeMode };
    if (query?.trim()) params['query'] = query.trim();
    return this.http.get<GlobalLeaderboardEntryDto[]>(`${API_BASE_URL}/api/leaderboard/global`, {
      params,
    });
  }

  getDailyListings(page = 1, pageSize = 5): Observable<DailyListingsResponseDto> {
    return this.http.get<DailyListingsResponseDto>(`${API_BASE_URL}/api/leaderboard/daily`, {
      params: { page: String(page), pageSize: String(pageSize) },
    });
  }

  getPlatformStats(): Observable<PlatformStatsDto> {
    return this.http.get<PlatformStatsDto>(`${API_BASE_URL}/api/leaderboard/stats`);
  }

  getLiveStream(limit = 10): Observable<LiveBidEventDto[]> {
    return this.http.get<LiveBidEventDto[]>(`${API_BASE_URL}/api/leaderboard/live-stream`, {
      params: { limit: String(limit) },
    });
  }

  getHallOfFame(topN = 5): Observable<HallOfFameItemDto[]> {
    return this.http.get<HallOfFameItemDto[]>(`${API_BASE_URL}/api/leaderboard/hall-of-fame`, {
      params: { topN: String(topN) },
    });
  }
}
