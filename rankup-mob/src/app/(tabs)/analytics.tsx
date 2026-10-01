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
  const [metric, setMetric] = useState<'users' | 'views' | 'sessions'>('users');
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [report, setReport] = useState<GoogleAnalyticsReportDto | null>(null);
  const [realtime, setRealtime] = useState<GaRealtimeReportDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const screenWidth = Dimensions.get('window').width - Spacing.three * 2;
  const chartWidth = Math.max(300, screenWidth - Spacing.three * 2);
  const chartHeight = 175;

  const loadData = async () => {
    setError(null);
    try {
      const [rep, rt] = await Promise.all([
        getAnalyticsReport(days),
        getAnalyticsRealtime(),
      ]);
      setReport(rep || null);
      setRealtime(rt || null);
    } catch (err: any) {
      console.warn('Analytics API error:', err);
      setError('Unable to load analytics from backend service.');
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

  // Trend series points exclusively from backend
  const timeSeries = report?.timeSeries || [];

  const values = timeSeries.map((t) =>
    metric === 'views' ? t.pageViews : metric === 'sessions' ? t.sessions : t.activeUsers,
  );
  const rawMax = Math.max(...values, 10);
  const maxVal = Math.ceil(rawMax * 1.15);

  const yAxisWidth = 36;
  const paddingRight = 14;
  const plotWidth = chartWidth - yAxisWidth - paddingRight;
  const count = Math.max(timeSeries.length, 1);
  const slotWidth = plotWidth / count;
  const barWidth = Math.min(36, Math.max(12, Math.floor(slotWidth * 0.55)));
  const baselineY = 140;
  const topY = 20;
  const usableH = baselineY - topY;

  const selectedPoint = selectedPointIndex !== null ? timeSeries[selectedPointIndex] : null;

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
                {realtime?.activeUsersLast30Min ?? 0} active
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

        {error && !report && (
          <View style={[styles.errorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="alert-circle-outline" size={32} color={colors.error} />
            <Text style={[styles.errorTitle, { color: colors.text }]}>Telemetry Unavailable</Text>
            <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
            <Pressable
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                setLoading(true);
                loadData();
              }}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        )}

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
                  {report?.overview?.totalUsers != null ? report.overview.totalUsers.toLocaleString() : '0'}
                </Text>
                {report?.overview?.totalUsersChangePercent != null && (
                  <Text
                    style={[
                      styles.kpiChange,
                      {
                        color:
                          report.overview.totalUsersChangePercent >= 0
                            ? colors.secondaryGreen
                            : colors.error,
                      },
                    ]}>
                    {report.overview.totalUsersChangePercent >= 0 ? '+' : ''}
                    {report.overview.totalUsersChangePercent.toFixed(1)}% vs prev
                  </Text>
                )}
              </View>

              <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Page Views</Text>
                <Text style={[styles.kpiVal, { color: colors.primary }]}>
                  {report?.overview?.screenPageViews != null ? report.overview.screenPageViews.toLocaleString() : '0'}
                </Text>
                {report?.overview?.pageViewsChangePercent != null && (
                  <Text
                    style={[
                      styles.kpiChange,
                      {
                        color:
                          report.overview.pageViewsChangePercent >= 0
                            ? colors.secondaryGreen
                            : colors.error,
                      },
                    ]}>
                    {report.overview.pageViewsChangePercent >= 0 ? '+' : ''}
                    {report.overview.pageViewsChangePercent.toFixed(1)}% vs prev
                  </Text>
                )}
              </View>

              <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Sessions</Text>
                <Text style={[styles.kpiVal, { color: colors.text }]}>
                  {report?.overview?.sessions != null ? report.overview.sessions.toLocaleString() : '0'}
                </Text>
                {report?.overview?.sessionsChangePercent != null && (
                  <Text
                    style={[
                      styles.kpiChange,
                      {
                        color:
                          report.overview.sessionsChangePercent >= 0
                            ? colors.secondaryGreen
                            : colors.error,
                      },
                    ]}>
                    {report.overview.sessionsChangePercent >= 0 ? '+' : ''}
                    {report.overview.sessionsChangePercent.toFixed(1)}%
                  </Text>
                )}
              </View>

              <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Engagement</Text>
                <Text style={[styles.kpiVal, { color: colors.text }]}>
                  {report?.overview?.engagementRate != null
                    ? `${report.overview.engagementRate > 1 ? report.overview.engagementRate.toFixed(1) : (report.overview.engagementRate * 100).toFixed(1)}%`
                    : '0%'}
                </Text>
                <Text style={[styles.kpiChange, { color: colors.secondaryGreen }]}>
                  Avg {report?.overview?.averageSessionDurationSeconds != null ? Math.round(report.overview.averageSessionDurationSeconds) : 0}s duration
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
                      onPress={() => {
                        setMetric(m);
                        setSelectedPointIndex(null);
                      }}>
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

              {/* Selected point inspection badge */}
              {selectedPoint && (
                <View style={[styles.selectedBanner, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                  <Ionicons name="information-circle" size={13} color={colors.primary} />
                  <Text style={[styles.selectedBannerText, { color: colors.text }]}>
                    <Text style={{ fontWeight: '800' }}>{selectedPoint.label}: </Text>
                    {selectedPoint.activeUsers} Users • {selectedPoint.sessions} Sessions • {selectedPoint.pageViews} Views
                  </Text>
                </View>
              )}

              {/* Chart SVG or Empty State */}
              {timeSeries.length === 0 ? (
                <View style={styles.emptyChartWrap}>
                  <Ionicons name="bar-chart-outline" size={32} color={colors.textMuted} />
                  <Text style={[styles.emptyChartText, { color: colors.textMuted }]}>
                    No trend telemetry recorded by backend for the last {days} days.
                  </Text>
                </View>
              ) : (
                <View style={styles.chartWrapper}>
                  <Svg width={chartWidth} height={chartHeight}>
                    <Defs>
                      <LinearGradient id="gaBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={colors.primary} stopOpacity="0.9" />
                        <Stop offset="1" stopColor={colors.primary} stopOpacity="0.25" />
                      </LinearGradient>
                    </Defs>

                    {/* Grid Lines */}
                    <Line
                      x1={yAxisWidth}
                      y1={topY}
                      x2={chartWidth - paddingRight}
                      y2={topY}
                      stroke={colors.border}
                      strokeDasharray="4,4"
                      strokeWidth="0.8"
                    />
                    <Line
                      x1={yAxisWidth}
                      y1={(topY + baselineY) / 2}
                      x2={chartWidth - paddingRight}
                      y2={(topY + baselineY) / 2}
                      stroke={colors.border}
                      strokeDasharray="4,4"
                      strokeWidth="0.8"
                    />
                    <Line
                      x1={yAxisWidth}
                      y1={baselineY}
                      x2={chartWidth - paddingRight}
                      y2={baselineY}
                      stroke={colors.border}
                      strokeWidth="1"
                    />

                    {/* Y-Axis Value Labels */}
                    <SvgText
                      x={yAxisWidth - 6}
                      y={topY + 4}
                      fontSize="9"
                      fontWeight="600"
                      textAnchor="end"
                      fill={colors.textMuted}>
                      {maxVal >= 1000 ? `${(maxVal / 1000).toFixed(1)}k` : maxVal}
                    </SvgText>
                    <SvgText
                      x={yAxisWidth - 6}
                      y={(topY + baselineY) / 2 + 3}
                      fontSize="9"
                      fontWeight="600"
                      textAnchor="end"
                      fill={colors.textMuted}>
                      {Math.round(maxVal / 2) >= 1000
                        ? `${(Math.round(maxVal / 2) / 1000).toFixed(1)}k`
                        : Math.round(maxVal / 2)}
                    </SvgText>
                    <SvgText
                      x={yAxisWidth - 6}
                      y={baselineY}
                      fontSize="9"
                      fontWeight="600"
                      textAnchor="end"
                      fill={colors.textMuted}>
                      0
                    </SvgText>

                    {/* Bars + Labels */}
                    {timeSeries.map((pt, i) => {
                      const val =
                        metric === 'views'
                          ? pt.pageViews
                          : metric === 'sessions'
                            ? pt.sessions
                            : pt.activeUsers;
                      const barH = Math.max(4, Math.round((val / maxVal) * usableH));
                      const barX = yAxisWidth + i * slotWidth + (slotWidth - barWidth) / 2;
                      const barY = baselineY - barH;
                      const isSelected = selectedPointIndex === i;

                      return (
                        <React.Fragment key={pt.date || i}>
                          {/* Column touch area */}
                          <Rect
                            x={yAxisWidth + i * slotWidth}
                            y={topY}
                            width={slotWidth}
                            height={usableH + 25}
                            fill="transparent"
                            onPress={() => setSelectedPointIndex(isSelected ? null : i)}
                          />

                          {/* Highlight beam when selected */}
                          {isSelected && (
                            <Rect
                              x={yAxisWidth + i * slotWidth + 2}
                              y={topY}
                              width={slotWidth - 4}
                              height={usableH}
                              fill={colors.primary}
                              fillOpacity={0.1}
                              rx={4}
                            />
                          )}

                          {/* Bar */}
                          <Rect
                            x={barX}
                            y={barY}
                            width={barWidth}
                            height={barH}
                            rx={4}
                            fill={isSelected ? colors.primary : 'url(#gaBarGrad)'}
                            onPress={() => setSelectedPointIndex(isSelected ? null : i)}
                          />

                          {/* Value on top of bar */}
                          <SvgText
                            x={barX + barWidth / 2}
                            y={Math.max(14, barY - 5)}
                            fontSize="10"
                            fontWeight="700"
                            textAnchor="middle"
                            fill={isSelected ? colors.primary : colors.text}>
                            {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                          </SvgText>

                          {/* Date label under baseline */}
                          <SvgText
                            x={barX + barWidth / 2}
                            y={baselineY + 16}
                            fontSize="10"
                            fontWeight={isSelected ? '800' : '500'}
                            textAnchor="middle"
                            fill={isSelected ? colors.primary : colors.textMuted}>
                            {pt.label}
                          </SvgText>
                        </React.Fragment>
                      );
                    })}
                  </Svg>
                </View>
              )}
            </View>

            {/* Traffic Sources Breakdown */}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="pie-chart-outline" size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Traffic Channels</Text>
              </View>

              <View style={styles.sourceList}>
                {!report?.trafficSources || report.trafficSources.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                      No traffic source data reported by backend.
                    </Text>
                  </View>
                ) : (
                  report.trafficSources.map((src) => (
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
                              width: `${Math.min(100, Math.max(0, src.percentage))}%`,
                              backgroundColor: colors.primary,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>

            {/* Device Breakdown */}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="phone-portrait-outline" size={16} color={colors.secondaryGreen} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Device Categories</Text>
              </View>

              {!report?.deviceBreakdown || report.deviceBreakdown.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    No device category data reported by backend.
                  </Text>
                </View>
              ) : (
                <View style={styles.deviceRow}>
                  {report.deviceBreakdown.map((dev) => (
                    <View
                      key={dev.deviceCategory}
                      style={[styles.deviceBox, { backgroundColor: colors.surfaceSubtle }]}>
                      <Ionicons
                        name={
                          dev.deviceCategory?.toLowerCase() === 'mobile'
                            ? 'phone-portrait'
                            : dev.deviceCategory?.toLowerCase() === 'desktop'
                              ? 'laptop'
                              : 'tablet-portrait'
                        }
                        size={20}
                        color={colors.primary}
                      />
                      <Text style={[styles.deviceTitle, { color: colors.text }]}>
                        {dev.deviceCategory?.toUpperCase() || 'UNKNOWN'}
                      </Text>
                      <Text style={[styles.devicePct, { color: colors.primary }]}>
                        {dev.percentage?.toFixed(1) ?? '0.0'}%
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Top Active Pages */}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="document-text-outline" size={16} color={colors.gold} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Top Active Pages</Text>
              </View>

              <View style={styles.pagesList}>
                {!report?.topPages || report.topPages.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                      No active page telemetry recorded by backend yet.
                    </Text>
                  </View>
                ) : (
                  report.topPages.slice(0, 5).map((page, idx) => (
                    <View
                      key={page.pagePath || idx}
                      style={[styles.pageRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.pageRank, { color: colors.textMuted }]}>#{idx + 1}</Text>
                      <View style={styles.pageInfo}>
                        <Text numberOfLines={1} style={[styles.pageTitle, { color: colors.text }]}>
                          {page.pageTitle || page.pagePath}
                        </Text>
                        <Text style={[styles.pagePath, { color: colors.textMuted }]}>{page.pagePath}</Text>
                      </View>
                      <Text style={[styles.pageViews, { color: colors.primary }]}>
                        {page.pageViews?.toLocaleString() ?? 0} views
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>

            {/* Data Source Description */}
            {report?.dataSourceDescription && (
              <View style={styles.dataSourceRow}>
                <Ionicons name="shield-checkmark-outline" size={13} color={colors.secondaryGreen} />
                <Text style={[styles.dataSourceText, { color: colors.textMuted }]}>
                  {report.dataSourceDescription}
                </Text>
              </View>
            )}
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
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  selectedBannerText: {
    fontSize: 11,
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
  emptyWrap: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12,
    textAlign: 'center',
  },
  emptyChartWrap: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  emptyChartText: {
    fontSize: 12,
    textAlign: 'center',
  },
  dataSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.two,
  },
  dataSourceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  errorCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.five,
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.four,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  errorText: {
    fontSize: 12,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    marginTop: Spacing.one,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
