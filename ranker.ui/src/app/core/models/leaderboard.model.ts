import { PagedResult } from './paged-result.model';

export interface LeaderboardEntryDto {
  rank: number;
  listingId: number;
  listingName: string;
  listingUrl: string;
  currentBidAmount: number;
  firstBidAt: string;
  lastBidAt: string;
}

export interface CategoryLeaderboardResponseDto {
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  minBidIncrement: number;
  minStartingBid: number;
  leaderboard: PagedResult<LeaderboardEntryDto>;
}

export interface GlobalLeaderboardEntryDto {
  rank: number;
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  listingId: number;
  listingName: string;
  listingUrl: string;
  currentBidAmount: number;
  normalizedScore: number;
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
