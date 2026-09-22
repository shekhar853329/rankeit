export type CategorySortBy = 'Trending' | 'Newest' | 'Alphabetical';

export interface CategoryDto {
  id: number;
  name: string;
  slug: string;
  parentCategoryId: number | null;
  minBidIncrement: number;
  minStartingBid: number;
  activityScore: number;
  recentClaimCount: number;
  listingCount: number;
}

export interface CategoryTreeNodeDto {
  id: number;
  name: string;
  slug: string;
  children: CategoryTreeNodeDto[];
}
