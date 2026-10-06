import { PagedResult } from './paged-result.model';

export interface LeaderboardEntryDto {
  rank: number;
  listingId: number;
  listingName: string;
  listingUrl: string;
  currentClaimAmount: number;
  firstClaimAt: string;
  lastClaimAt: string;
  clickCount: number;
  claimCount?: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
}

export interface CategoryLeaderboardResponseDto {
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  categoryIcon?: string | null;
  minClaimIncrement: number;
  minStartingClaim: number;
  leaderboard: PagedResult<LeaderboardEntryDto>;
}

export interface GlobalLeaderboardEntryDto {
  rank: number;
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  categoryIcon?: string | null;
  listingId: number;
  listingName: string;
  listingUrl: string;
  currentClaimAmount: number;
  normalizedScore: number;
  clickCount: number;
  claimCount?: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
}

export interface HourlyClaimPointDto {
  hour: number;
  volume: number;
  claimCount: number;
  avgClaim?: number;
}

export interface ClaimTimelinePointDto {
  id: number;
  listingId: number;
  listingName: string;
  categoryName: string;
  amount: number;
  createdAt: string;
  paymentReference: string | null;
  currentClaimLevel?: number;
}

export interface DailyClaimPointDto {
  date: string;
  volume: number;
  claimCount: number;
}

export interface PlatformStatsDto {
  trafficSurgePercentage: number;
  avgLeaderViews: number;
  averageCpcToday: number;
  directCtrRate: number;
  protocolAuditId: string;
  hourlyClaimPressures: HourlyClaimPointDto[];
  recentClaimsTimeline?: ClaimTimelinePointDto[];
  dailyClaimPressures?: DailyClaimPointDto[];
}

export interface LiveClaimEventDto {
  claimId: number;
  listingId: number;
  listingName: string;
  siteName: string | null;
  categoryName: string;
  categorySlug: string;
  categoryIcon: string | null;
  amount: number;
  createdAt: string;
  isTopClaim: boolean;
  actionText: string;
  highlightText: string;
  timeAgo: string;
}

export interface HallOfFameItemDto {
  id: number;
  rank: number;
  name: string;
  siteName: string | null;
  url: string;
  claimAmount: number;
  clickCount: number;
}

/** Mirrors Ranker.Hubs.ListingClickedPayload broadcast over the "ListingClicked" SignalR event. */
export interface ListingClickedPayload {
  listingId: number;
  clickCount: number;
}

/** Mirrors Ranker.Hubs.RankUpdatedPayload broadcast over the "RankUpdated" SignalR event. */
export interface RankUpdatedPayload {
  categorySlug: string;
  listingId: number;
  listingName: string;
  newClaimAmount: number;
  becameCategoryTop: boolean;
  occurredAt: string;
}

export interface SpotRankDto {
  rank: number;
  amount: number;
  timeMode: string;
  categorySlug?: string | null;
}

