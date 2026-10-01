import Constants from 'expo-constants';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  CalculateBidQuoteRequestDto,
  CalculateBidQuoteResponseDto,
  CategoryDto,
  CategoryLeaderboardResponseDto,
  CategorySortBy,
  CategoryTreeNodeDto,
  DailyListingsResponseDto,
  GaConfigStatusDto,
  GaRealtimeReportDto,
  GlobalLeaderboardEntryDto,
  GoogleAnalyticsReportDto,
  HallOfFameItemDto,
  ListingDetailDto,
  ListingLookupResultDto,
  LiveBidEventDto,
  PagedResult,
  PlaceBidRequestDto,
  PlaceBidResultDto,
  PlatformStatsDto,
  UrlMetadataDto,
} from '../models';

const STORAGE_KEY_API_URL = '@rankup_custom_api_url';

// Active machine IP on local Wi-Fi network
const CURRENT_LAN_IP = '10.33.102.208';
const BACKEND_PORT = '5196';

export function getAutoDetectedHostIp(): string {
  try {
    const raw = Constants.expoConfig?.hostUri || (Constants as any).experienceUrl;
    if (raw) {
      const clean = String(raw).replace(/^.*:\/\//, '').split(':')[0].split('/')[0];
      if (clean && clean !== 'localhost' && clean !== '127.0.0.1') {
        return clean;
      }
    }
  } catch {
    // Fallback if Constants cannot be accessed
  }
  return CURRENT_LAN_IP;
}

async function resolveDefaultApiUrl(): Promise<string> {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (Platform.OS === 'web') {
    return `http://localhost:${BACKEND_PORT}`;
  }

  const detectedHost = getAutoDetectedHostIp();

  // Try dynamic Expo host first
  if (detectedHost) {
    try {
      const probe = await fetch(`http://${detectedHost}:${BACKEND_PORT}/api/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (probe.ok) return `http://${detectedHost}:${BACKEND_PORT}`;
    } catch {
      // Fall through
    }
  }

  // If on Android Emulator, test 10.0.2.2 (QEMU virtual loopback to host)
  if (Platform.OS === 'android' && !Device.isDevice) {
    try {
      const probe = await fetch(`http://10.0.2.2:${BACKEND_PORT}/api/health`, {
        signal: AbortSignal.timeout(1200),
      });
      if (probe.ok) return `http://10.0.2.2:${BACKEND_PORT}`;
    } catch {
      // Fall through
    }
  }

  // Next test active LAN IP
  if (CURRENT_LAN_IP !== detectedHost) {
    try {
      const probe = await fetch(`http://${CURRENT_LAN_IP}:${BACKEND_PORT}/api/health`, {
        signal: AbortSignal.timeout(1200),
      });
      if (probe.ok) return `http://${CURRENT_LAN_IP}:${BACKEND_PORT}`;
    } catch {
      // Fall through
    }
  }

  if (Platform.OS === 'android') {
    return !Device.isDevice ? `http://10.0.2.2:${BACKEND_PORT}` : `http://${detectedHost}:${BACKEND_PORT}`;
  }

  return `http://${detectedHost}:${BACKEND_PORT}`;
}

let cachedBaseUrl: string | null = null;

export async function getApiBaseUrl(): Promise<string> {
  if (cachedBaseUrl && !cachedBaseUrl.includes('192.168.1.8')) return cachedBaseUrl;
  try {
    const custom = await AsyncStorage.getItem(STORAGE_KEY_API_URL);
    if (custom && custom.trim().length > 0) {
      if (custom.includes('192.168.1.8')) {
        await AsyncStorage.removeItem(STORAGE_KEY_API_URL);
      } else {
        cachedBaseUrl = custom.trim().replace(/\/+$/, '');
        return cachedBaseUrl;
      }
    }
  } catch {
    // Ignore storage read error and use default
  }
  cachedBaseUrl = await resolveDefaultApiUrl();
  return cachedBaseUrl;
}

export async function setCustomApiBaseUrl(url: string | null): Promise<void> {
  if (!url || url.trim().length === 0) {
    await AsyncStorage.removeItem(STORAGE_KEY_API_URL);
    cachedBaseUrl = await resolveDefaultApiUrl();
  } else {
    const formatted = url.trim().replace(/\/+$/, '');
    await AsyncStorage.setItem(STORAGE_KEY_API_URL, formatted);
    cachedBaseUrl = formatted;
  }
}

export async function getHubUrl(): Promise<string> {
  const base = await getApiBaseUrl();
  return `${base}/hubs/leaderboard`;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const base = await getApiBaseUrl();
  const url = `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-App-Client': 'Ranker-UI-Client',
    ...(options.headers || {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson && typeof errorJson === 'object') {
          errorMessage = errorJson.error || errorJson.detail || errorJson.message || errorMessage;
        }
      } catch {
        // Response was not JSON
      }
      throw new Error(errorMessage);
    }

    // If 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out.`);
    }
    throw err;
  }
}

// ── LEADERBOARD APIS ──────────────────────────────────────────

export async function getGlobalLeaderboard(
  topN = 20,
  timeMode = 'today',
  query?: string,
): Promise<GlobalLeaderboardEntryDto[]> {
  const params = new URLSearchParams({ topN: String(topN), timeMode });
  if (query && query.trim()) params.append('query', query.trim());
  return request<GlobalLeaderboardEntryDto[]>(`/api/leaderboard/global?${params.toString()}`);
}

export async function getCategoryLeaderboard(
  categorySlug: string,
  page = 1,
  pageSize = 25,
  timeMode = 'alltime',
  query?: string,
): Promise<CategoryLeaderboardResponseDto> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    timeMode,
  });
  if (query && query.trim()) params.append('query', query.trim());
  return request<CategoryLeaderboardResponseDto>(
    `/api/leaderboard/category/${encodeURIComponent(categorySlug)}?${params.toString()}`,
  );
}

export async function getPlatformStats(categorySlug?: string | null): Promise<PlatformStatsDto> {
  if (categorySlug && categorySlug.trim()) {
    return request<PlatformStatsDto>(
      `/api/leaderboard/category/${encodeURIComponent(categorySlug.trim())}/stats`,
    );
  }
  return request<PlatformStatsDto>('/api/leaderboard/stats');
}

export async function getDailyListings(page = 1, pageSize = 5): Promise<DailyListingsResponseDto> {
  return request<DailyListingsResponseDto>(
    `/api/leaderboard/daily?page=${page}&pageSize=${pageSize}`,
  );
}

export async function getLiveStream(limit = 10): Promise<LiveBidEventDto[]> {
  return request<LiveBidEventDto[]>(`/api/leaderboard/live-stream?limit=${limit}`);
}

export async function getHallOfFame(topN = 5): Promise<HallOfFameItemDto[]> {
  return request<HallOfFameItemDto[]>(`/api/leaderboard/hall-of-fame?topN=${topN}`);
}

// ── CATEGORIES APIS ───────────────────────────────────────────

export async function getCategories(options: {
  parentSlug?: string | null;
  sortBy?: CategorySortBy;
  page?: number;
  pageSize?: number;
} = {}): Promise<PagedResult<CategoryDto>> {
  const params = new URLSearchParams({
    sortBy: options.sortBy ?? 'Trending',
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 20),
  });
  if (options.parentSlug) {
    params.append('parentSlug', options.parentSlug);
  }
  return request<PagedResult<CategoryDto>>(`/api/categories?${params.toString()}`);
}

export async function getCategoryTree(): Promise<CategoryTreeNodeDto[]> {
  return request<CategoryTreeNodeDto[]>('/api/categories/tree');
}

// ── LISTING APIS ──────────────────────────────────────────────

export async function getListingDetail(listingId: number): Promise<ListingDetailDto> {
  return request<ListingDetailDto>(`/api/listings/${listingId}`);
}

export async function recordListingClick(listingId: number): Promise<number> {
  return request<number>(`/api/listings/${listingId}/click`, {
    method: 'POST',
  });
}

export async function lookupListing(categoryId: number, url: string): Promise<ListingLookupResultDto> {
  const params = new URLSearchParams({
    categoryId: String(categoryId),
    url: url.trim(),
  });
  return request<ListingLookupResultDto>(`/api/listings/lookup?${params.toString()}`);
}

// ── BID & QUOTE APIS ──────────────────────────────────────────

export async function placeBid(payload: PlaceBidRequestDto): Promise<PlaceBidResultDto> {
  return request<PlaceBidResultDto>('/api/bids', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function calculateBidQuote(
  payload: CalculateBidQuoteRequestDto,
): Promise<CalculateBidQuoteResponseDto> {
  return request<CalculateBidQuoteResponseDto>('/api/bids/calculate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── URL METADATA API ──────────────────────────────────────────

export async function fetchUrlMetadata(url: string): Promise<UrlMetadataDto> {
  return request<UrlMetadataDto>(`/api/url-metadata?url=${encodeURIComponent(url.trim())}`);
}

// ── GOOGLE ANALYTICS APIS ─────────────────────────────────────

export async function getAnalyticsReport(days = 30): Promise<GoogleAnalyticsReportDto> {
  return request<GoogleAnalyticsReportDto>(`/api/analytics/ga/overview?days=${days}`);
}

export async function getAnalyticsRealtime(): Promise<GaRealtimeReportDto> {
  return request<GaRealtimeReportDto>('/api/analytics/ga/realtime');
}

export async function getAnalyticsStatus(): Promise<GaConfigStatusDto> {
  return request<GaConfigStatusDto>('/api/analytics/ga/status');
}

// ── HEALTH & SITE VISIT ───────────────────────────────────────

export async function getHealth(): Promise<{ status: string }> {
  return request<{ status: string }>('/api/health');
}

export async function recordSiteVisit(): Promise<{ visitsToday: number; totalVisits: number }> {
  try {
    return await request<{ visitsToday: number; totalVisits: number }>('/api/health/visit', {
      method: 'POST',
    });
  } catch {
    return { visitsToday: 1, totalVisits: 1 };
  }
}
