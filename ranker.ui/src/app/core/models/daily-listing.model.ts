import { PagedResult } from './paged-result.model';

export interface DailyListingEntryDto {
  rank: number;
  listingId: number;
  listingName: string;
  listingUrl: string;
  categoryName: string;
  categorySlug: string;
  currentBidAmount: number;
  firstBidAt: string;
}

export interface DailyListingGroupDto {
  day: string;
  totalCount: number;
  entries: DailyListingEntryDto[];
}

export type DailyListingsResponseDto = PagedResult<DailyListingGroupDto>;
