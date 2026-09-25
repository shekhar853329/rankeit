import { PagedResult } from './paged-result.model';

export interface LeaderboardEntryDto {
  rank: number;
  listingId: number;
  listingName: string;
  listingUrl: string;
  currentBidAmount: number;
  firstBidAt: string;
  lastBidAt: string;
  clickCount: number;
  bidCount?: number;
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
  minBidIncrement: number;
  minStartingBid: number;
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
  currentBidAmount: number;
  normalizedScore: number;
  clickCount: number;
  bidCount?: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
}

export interface HourlyBidPointDto {
  hour: number;
  volume: number;
  bidCount: number;
}

export interface PlatformStatsDto {
  trafficSurgePercentage: number;
  avgLeaderViews: number;
  averageCpcToday: number;
  directCtrRate: number;
  protocolAuditId: string;
  hourlyBidPressures: HourlyBidPointDto[];
}

export interface LiveBidEventDto {
  bidId: number;
  listingId: number;
  listingName: string;
  siteName: string | null;
  categoryName: string;
  categorySlug: string;
  categoryIcon: string | null;
  amount: number;
  createdAt: string;
  isTopBid: boolean;
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
  bid: number;
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
  newBidAmount: number;
  becameCategoryTop: boolean;
  occurredAt: string;
}
