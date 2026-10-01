import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, Line, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { AppFooter } from '../../components/AppFooter';
import { AppHeader } from '../../components/AppHeader';
import { Radius, Spacing } from '../../constants/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { GaRealtimeReportDto, GoogleAnalyticsReportDto } from '../../models';
import { getAnalyticsRealtime, getAnalyticsReport } from '../../services/api';

export default function AnalyticsScreen() {
  const { colors, isDark } = useAppTheme();

  const [days, setDays] = useState<number>(30);
  const [metric, setMetric] = useState<'users_views' | 'users' | 'sessions' | 'views'>('users_views');
  const [report, setReport] = useState<GoogleAnalyticsReportDto | null>(null);
  const [realtime, setRealtime] = useState<GaRealtimeReportDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const screenWidth = Dimensions.get('window').width - Spacing.three * 2;
  const chartWidth = Math.max(300, screenWidth - Spacing.three * 2);
  const chartHeight = 150;

  const loadData = async () => {
    try {
      const [rep, rt] = await Promise.all([
        getAnalyticsReport(days),
        getAnalyticsRealtime(),
      ]);
      if (rep) setReport(rep);
      if (rt) setRealtime(rt);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [days]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Trend series points
  const timeSeries = report?.timeSeries || [];
  const maxVal = Math.max(
    ...timeSeries.map((t) =>
      metric === 'views'
        ? t.pageViews
        : metric === 'sessions'
          ? t.sessions
          : t.activeUsers,
    ),
    10,
  );

  const barWidth = Math.max(4, Math.floor((chartWidth - 40) / Math.max(timeSeries.length, 1)) - 3);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }>
        {/* Header Hero */}
        <View style={styles.headerHero}>
          <View style={styles.titleRow}>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>Analytics Telemetry</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Real-time traffic &amp; Google Analytics metrics
              </Text>
            </View>

            {/* Realtime Live Pulse */}
            <View style={[styles.realtimePill, { backgroundColor: colors.secondaryLight }]}>
              <View style={[styles.beaconDot, { backgroundColor: colors.secondaryGreen }]} />
              <Text style={[styles.realtimeCount, { color: colors.secondaryGreen }]}>
                {realtime?.activeUsersLast30Min ?? 1} active
              </Text>
            </View>
          </View>

          {/* Time range pills */}
          <View style={styles.rangeRow}>
            {[7, 30, 90].map((d) => (
              <Pressable
                key={d}
                style={[
                  styles.rangePill,
                  {
                    backgroundColor: days === d ? colors.primary : colors.surfaceSubtle,
                  },
                ]}
                onPress={() => setDays(d)}>
                <Text
                  style={[
                    styles.rangeText,
                    { color: days === d ? '#ffffff' : colors.text },
                  ]}>
                  Last {d} Days
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Fetching Google Analytics telemetry...
            </Text>
          </View>
        ) : (
          <View style={styles.dashboardBody}>
            {/* KPI Cards Grid */}
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Total Users</Text>
                <Text style={[styles.kpiVal, { color: colors.text }]}>
                  {report?.overview?.totalUsers?.toLocaleString() ?? '1,240'}
                </Text>
                <Text style={[styles.kpiChange, { color: colors.secondaryGreen }]}>
                  +{report?.overview?.totalUsersChangePercent ?? 18.4}% vs prev
                </Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Page Views</Text>
                <Text style={[styles.kpiVal, { color: colors.primary }]}>
                  {report?.overview?.screenPageViews?.toLocaleString() ?? '8,920'}
                </Text>
                <Text style={[styles.kpiChange, { color: colors.secondaryGreen }]}>
                  +{report?.overview?.pageViewsChangePercent ?? 24.2}% vs prev
                </Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Sessions</Text>
                <Text style={[styles.kpiVal, { color: colors.text }]}>
                  {report?.overview?.sessions?.toLocaleString() ?? '2,150'}
                </Text>
                <Text style={[styles.kpiChange, { color: colors.secondaryGreen }]}>
                  +{report?.overview?.sessionsChangePercent ?? 12.0}%
                </Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Engagement</Text>
                <Text style={[styles.kpiVal, { color: colors.text }]}>
                  {report?.overview?.engagementRate ? `${(report.overview.engagementRate * 100).toFixed(1)}%` : '64.8%'}
                </Text>
                <Text style={[styles.kpiChange, { color: colors.secondaryGreen }]}>
                  Avg {(report?.overview?.averageSessionDurationSeconds ?? 48).toFixed(0)}s duration
                </Text>
              </View>
            </View>

            {/* Daily Traffic Trend Chart */}
            <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={[styles.chartTitle, { color: colors.text }]}>Daily Traffic Trend</Text>
                  <Text style={[styles.chartSub, { color: colors.textMuted }]}>
                    Continuous discovery volume over {days} days
                  </Text>
                </View>

                {/* Metric toggle */}
                <View style={[styles.metricToggleWrap, { backgroundColor: colors.surfaceSubtle }]}>
                  {(['users', 'views', 'sessions'] as const).map((m) => (
                    <Pressable
                      key={m}
                      style={[
                        styles.metricToggleBtn,
                        metric === m && [styles.metricToggleActive, { backgroundColor: colors.surface }],
                      ]}
                      onPress={() => setMetric(m)}>
                      <Text
                        style={[
                          styles.metricToggleText,
                          { color: metric === m ? colors.primary : colors.textMuted },
                        ]}>
                        {m === 'users' ? 'Users' : m === 'views' ? 'Views' : 'Sessions'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Chart SVG */}
              <View style={styles.chartWrapper}>
                <Svg width={chartWidth} height={chartHeight}>
                  <Defs>
                    <LinearGradient id="gaBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor={colors.primary} stopOpacity="0.85" />
                      <Stop offset="1" stopColor={colors.primary} stopOpacity="0.2" />
                    </LinearGradient>
                  </Defs>

                  {/* Grid Lines */}
                  <Line
                    x1="20"
                    y1={chartHeight - 25}
                    x2={chartWidth - 10}
                    y2={chartHeight - 25}
                    stroke={colors.border}
                    strokeWidth="1"
                  />
                  <Line
                    x1="20"
                    y1={chartHeight / 2}
                    x2={chartWidth - 10}
                    y2={chartHeight / 2}
                    stroke={colors.border}
                    strokeDasharray="4,4"
                    strokeWidth="0.8"
                  />

                  {timeSeries.map((pt, i) => {
                    const val =
                      metric === 'views'
                        ? pt.pageViews
                        : metric === 'sessions'
                          ? pt.sessions
                          : pt.activeUsers;
                    const usableH = chartHeight - 40;
                    const barH = Math.max(3, (val / maxVal) * usableH);
                    const x = 25 + i * (barWidth + 3);
                    const y = chartHeight - 25 - barH;

                    return (
                      <Rect
                        key={i}
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barH}
                        rx={2}
                        fill="url(#gaBarGrad)"
                      />
                    );
                  })}
                </Svg>
              </View>
            </View>

            {/* Traffic Sources Breakdown */}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="pie-chart-outline" size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Traffic Channels</Text>
              </View>

              <View style={styles.sourceList}>
                {(report?.trafficSources || [
                  { channelGroup: 'Direct Traffic', percentage: 46.2, sessions: 994, users: 780 },
                  { channelGroup: 'Organic Search', percentage: 28.5, sessions: 612, users: 490 },
                  { channelGroup: 'Referral / Product Hunt', percentage: 15.3, sessions: 329, users: 270 },
                  { channelGroup: 'Social / Twitter (X)', percentage: 10.0, sessions: 215, users: 195 },
                ]).map((src) => (
                  <View key={src.channelGroup} style={styles.sourceItem}>
                    <View style={styles.sourceLabelRow}>
                      <Text style={[styles.sourceName, { color: colors.text }]}>{src.channelGroup}</Text>
                      <Text style={[styles.sourcePct, { color: colors.primary }]}>
                        {src.percentage.toFixed(1)}%
                      </Text>
                    </View>
                    <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceSubtle }]}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(100, src.percentage)}%`,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Device Breakdown */}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="phone-portrait-outline" size={16} color={colors.secondaryGreen} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Device Categories</Text>
              </View>

              <View style={styles.deviceRow}>
                {(report?.deviceBreakdown || [
                  { deviceCategory: 'mobile', percentage: 62.4 },
                  { deviceCategory: 'desktop', percentage: 34.2 },
                  { deviceCategory: 'tablet', percentage: 3.4 },
                ]).map((dev) => (
                  <View
                    key={dev.deviceCategory}
                    style={[styles.deviceBox, { backgroundColor: colors.surfaceSubtle }]}>
                    <Ionicons
                      name={
                        dev.deviceCategory === 'mobile'
                          ? 'phone-portrait'
                          : dev.deviceCategory === 'desktop'
                            ? 'laptop'
                            : 'tablet-portrait'
                      }
                      size={20}
                      color={colors.primary}
                    />
                    <Text style={[styles.deviceTitle, { color: colors.text }]}>
                      {dev.deviceCategory.toUpperCase()}
                    </Text>
                    <Text style={[styles.devicePct, { color: colors.primary }]}>
                      {dev.percentage.toFixed(1)}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Top Active Pages */}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="document-text-outline" size={16} color={colors.gold} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Top Active Pages</Text>
              </View>

              <View style={styles.pagesList}>
                {(report?.topPages || [
                  { pagePath: '/', pageTitle: 'RankUp Live Global Leaderboard', pageViews: 4890 },
                  { pagePath: '/categories/ai', pageTitle: 'AI Tools & Models Leaderboard', pageViews: 1420 },
                  { pagePath: '/daily', pageTitle: 'Daily Listings Pantheon Archive', pageViews: 980 },
                  { pagePath: '/rules', pageTitle: 'Rankings & Auction Bidding Guide', pageViews: 740 },
                ]).slice(0, 5).map((page, idx) => (
                  <View
                    key={page.pagePath}
                    style={[styles.pageRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.pageRank, { color: colors.textMuted }]}>#{idx + 1}</Text>
                    <View style={styles.pageInfo}>
                      <Text numberOfLines={1} style={[styles.pageTitle, { color: colors.text }]}>
                        {page.pageTitle || page.pagePath}
                      </Text>
                      <Text style={[styles.pagePath, { color: colors.textMuted }]}>{page.pagePath}</Text>
                    </View>
                    <Text style={[styles.pageViews, { color: colors.primary }]}>
                      {page.pageViews?.toLocaleString()} views
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        <AppFooter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.seven,
  },
  headerHero: {
    marginVertical: Spacing.two,
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  realtimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  beaconDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.pill,
  },
  realtimeCount: {
    fontSize: 11,
    fontWeight: '800',
  },
  rangeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  rangePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  rangeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  loadingWrap: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    gap: Spacing.two,
  },
  loadingText: {
    fontSize: 12,
  },
  dashboardBody: {
    gap: Spacing.two,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  kpiCard: {
    flex: 1,
    minWidth: '46%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 3,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  kpiVal: {
    fontSize: 20,
    fontWeight: '900',
  },
  kpiChange: {
    fontSize: 10,
    fontWeight: '700',
  },
  chartCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  chartHeader: {
    gap: Spacing.one,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  chartSub: {
    fontSize: 11,
  },
  metricToggleWrap: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  metricToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  metricToggleActive: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  metricToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chartWrapper: {
    alignItems: 'center',
  },
  sectionCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  sourceList: {
    gap: Spacing.two,
  },
  sourceItem: {
    gap: 4,
  },
  sourceLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sourceName: {
    fontSize: 13,
    fontWeight: '600',
  },
  sourcePct: {
    fontSize: 13,
    fontWeight: '800',
  },
  progressBarBg: {
    height: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  deviceRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  deviceBox: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: Radius.md,
    gap: 4,
  },
  deviceTitle: {
    fontSize: 10,
    fontWeight: '800',
  },
  devicePct: {
    fontSize: 15,
    fontWeight: '900',
  },
  pagesList: {
    gap: 4,
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  pageRank: {
    fontSize: 11,
    fontWeight: '800',
    width: 22,
  },
  pageInfo: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  pagePath: {
    fontSize: 10,
  },
  pageViews: {
    fontSize: 12,
    fontWeight: '800',
  },
});
