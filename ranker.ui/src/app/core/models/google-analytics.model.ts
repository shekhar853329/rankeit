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

export interface GaEventSummaryDto {
  eventName: string;
  eventCount: number;
  totalUsers: number;
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
  topEvents: GaEventSummaryDto[];
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
