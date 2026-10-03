export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

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

export interface DailyListingEntryDto {
  rank: number;
  listingId: number;
  listingName: string;
  listingUrl: string;
  categoryName: string;
  categorySlug: string;
  currentClaimAmount: number;
  firstClaimAt: string;
  clickCount: number;
}

export interface DailyListingGroupDto {
  day: string;
  totalCount: number;
  entries: DailyListingEntryDto[];
}

export type DailyListingsResponseDto = PagedResult<DailyListingGroupDto>;

export interface ClaimHistoryEntryDto {
  amount: number;
  paymentAmount: number;
  createdAt: string;
  paymentReferenceMasked: string;
}

export interface ListingDetailDto {
  listingId: number;
  listingName: string;
  listingUrl: string;
  categoryName: string;
  categorySlug: string;
  currentRankInCategory: number;
  currentClaimAmount: number;
  firstClaimAt: string;
  lastClaimAt: string;
  clickCount: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
  claims: ClaimHistoryEntryDto[];
}

export interface ListingLookupResultDto {
  found: boolean;
  listingId: number | null;
  listingName: string | null;
  listingUrl: string | null;
  currentClaimAmount: number;
  currentRankInCategory: number | null;
  ownerContactEmailMasked: string | null;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
}

export interface PlaceClaimRequestDto {
  categoryId: number;
  listingId: number | null;
  listingName: string | null;
  listingUrl: string | null;
  ownerContactEmail: string;
  targetClaimAmount: number;
  paymentReference: string;
  confirmedPaymentAmount: number;
  siteName: string | null;
  logoUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
}

export interface PlaceClaimResultDto {
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  listingId: number | null;
  newCurrentClaimAmount: number | null;
  amountCharged: number | null;
}

export interface CalculateClaimQuoteRequestDto {
  categoryId: number;
  listingId?: number | null;
  listingUrl?: string | null;
  ownerContactEmail?: string | null;
  targetClaimAmount: number;
}

export interface CalculateClaimQuoteResponseDto {
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  categoryId: number;
  categoryName: string;
  categoryMinStartingClaim: number;
  categoryMinClaimIncrement: number;
  currentTopClaimInCategory: number | null;
  currentTopListingId: number | null;
  currentTopListingName: string | null;
  listingId: number | null;
  listingName: string | null;
  existingListingCurrentClaim: number;
  targetClaimAmount: number;
  requiredMinimumClaim: number;
  expectedChargeAmount: number;
  becameCategoryTop: boolean;
}

export interface UrlMetadataDto {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
}

export interface GaOverviewDto {
  totalUsers: number;
  newUsers: number;
  activeUsers: number;
  sessions: number;
  screenPageViews: number;
  engagementRate: number;
  averageSessionDurationSeconds: number;
  bounceRate: number;
  eventCount: number;
  totalUsersChangePercent: number;
  pageViewsChangePercent: number;
  sessionsChangePercent: number;
  engagementRateChangePercent: number;
}

export interface GaTimeSeriesPointDto {
  date: string;
  label: string;
  activeUsers: number;
  sessions: number;
  pageViews: number;
  newUsers: number;
}

export interface GaTrafficSourceDto {
  channelGroup: string;
  sessions: number;
  users: number;
  percentage: number;
}

export interface GaDeviceBreakdownDto {
  deviceCategory: string;
  users: number;
  sessions: number;
  percentage: number;
}

export interface GaTopPageDto {
  pagePath: string;
  pageTitle: string;
  pageViews: number;
  activeUsers: number;
  averageTimeOnPageSeconds: number;
  bounceRate: number;
}

export interface GaGeoLocationDto {
  country: string;
  countryCode: string;
  city: string;
  users: number;
  sessions: number;
  percentage: number;
}

export interface GaRealtimePageDto {
  pagePath: string;
  activeUsers: number;
}

export interface GaRealtimeCountryDto {
  country: string;
  activeUsers: number;
}

export interface GaRealtimeReportDto {
  activeUsersLast30Min: number;
  topPages: GaRealtimePageDto[];
  topCountries: GaRealtimeCountryDto[];
  lastUpdatedUtc: string;
}

export interface GoogleAnalyticsReportDto {
  isConnected: boolean;
  propertyId: string;
  dateRangeLabel: string;
  days: number;
  overview: GaOverviewDto;
  timeSeries: GaTimeSeriesPointDto[];
  trafficSources: GaTrafficSourceDto[];
  deviceBreakdown: GaDeviceBreakdownDto[];
  topPages: GaTopPageDto[];
  geographics: GaGeoLocationDto[];
  realtime: GaRealtimeReportDto;
  dataSourceDescription: string;
}

export interface GaConfigStatusDto {
  isConfigured: boolean;
  propertyId: string | null;
  serviceAccountEmail: string | null;
  mode: string;
  warningOrError: string | null;
}

export interface ListingClickedPayload {
  listingId: number;
  clickCount: number;
}

export interface RankUpdatedPayload {
  categorySlug: string;
  listingId: number;
  listingName: string;
  newClaimAmount: number;
  becameCategoryTop: boolean;
  occurredAt: string;
}
