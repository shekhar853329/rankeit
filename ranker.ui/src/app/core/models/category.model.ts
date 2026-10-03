export type CategorySortBy = 'Trending' | 'Newest' | 'Alphabetical';

export interface CategoryDto {
  id: number;
  name: string;
  slug: string;
  icon?: string | null;
  parentCategoryId: number | null;
  minClaimIncrement: number;
  minStartingClaim: number;
  activityScore: number;
  recentClaimCount: number;
  listingCount: number;
  todayListingCount?: number;
}

export interface CategoryTreeNodeDto {
  id: number;
  name: string;
  slug: string;
  children: CategoryTreeNodeDto[];
}
