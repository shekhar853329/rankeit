import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { CategoryLeaderboardResponseDto, GlobalLeaderboardEntryDto, HallOfFameItemDto, LiveClaimEventDto, PlatformStatsDto, SpotRankDto } from '../models/leaderboard.model';
import { DailyListingsResponseDto } from '../models/daily-listing.model';

@Injectable({ providedIn: 'root' })
export class LeaderboardService {
  private readonly http = inject(HttpClient);

  getCategoryLeaderboard(
    categorySlug: string,
    page = 1,
    pageSize = 25,
    timeMode = 'alltime',
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

  getPlatformStats(categorySlug?: string | null, timeMode?: string): Observable<PlatformStatsDto> {
    const params: Record<string, string> = {};
    if (timeMode) params['timeMode'] = timeMode;
    if (categorySlug?.trim()) {
      return this.http.get<PlatformStatsDto>(
        `${API_BASE_URL}/api/leaderboard/category/${encodeURIComponent(categorySlug.trim())}/stats`,
        { params }
      );
    }
    return this.http.get<PlatformStatsDto>(`${API_BASE_URL}/api/leaderboard/stats`, { params });
  }

  getLiveStream(limit = 10): Observable<LiveClaimEventDto[]> {
    return this.http.get<LiveClaimEventDto[]>(`${API_BASE_URL}/api/leaderboard/live-stream`, {
      params: { limit: String(limit) },
    });
  }

  getHallOfFame(topN = 5): Observable<HallOfFameItemDto[]> {
    return this.http.get<HallOfFameItemDto[]>(`${API_BASE_URL}/api/leaderboard/hall-of-fame`, {
      params: { topN: String(topN) },
    });
  }

  getSpotRank(
    amount: number,
    timeMode = 'today',
    categorySlug?: string | null,
    listingId?: number | null,
  ): Observable<SpotRankDto> {
    const params: Record<string, string> = {
      amount: String(amount),
      timeMode,
    };
    if (categorySlug?.trim()) {
      params['categorySlug'] = categorySlug.trim();
    }
    if (listingId) {
      params['listingId'] = String(listingId);
    }
    return this.http.get<SpotRankDto>(`${API_BASE_URL}/api/leaderboard/spot-rank`, { params });
  }
}
