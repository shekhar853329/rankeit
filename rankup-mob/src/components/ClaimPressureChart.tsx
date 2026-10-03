import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Radius, Spacing } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { PlatformStatsDto } from '../models';

interface ClaimPressureChartProps {
  stats: PlatformStatsDto | null;
}

export const ClaimPressureChart: React.FC<ClaimPressureChartProps> = ({ stats }) => {
  const { colors, isDark } = useAppTheme();
  const [viewMode, setViewMode] = useState<'timeline' | 'hourly' | 'weekly'>('timeline');
  const [hourlyMetric, setHourlyMetric] = useState<'both' | 'volume' | 'count'>('both');
  const [timePreset, setTimePreset] = useState<'1h' | '6h' | 'today' | 'all'>('today');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const screenWidth = Dimensions.get('window').width - Spacing.three * 2;
  const chartWidth = Math.max(300, screenWidth - Spacing.three * 2);
  const chartHeight = 160;

  // Calculate volume & claims
  const todayVolume = useMemo(() => {
    if (!stats) return 0;
    if (stats.recentClaimsTimeline && stats.recentClaimsTimeline.length > 0) {
      return stats.recentClaimsTimeline.reduce((acc, b) => acc + Number(b.amount || 0), 0);
    }
    return (stats.hourlyClaimPressures || []).reduce((acc, h) => acc + Number(h.volume || 0), 0);
  }, [stats]);

  const todayClaimsCount = useMemo(() => {
    if (!stats) return 0;
    if (stats.recentClaimsTimeline && stats.recentClaimsTimeline.length > 0) {
      return stats.recentClaimsTimeline.length;
    }
    return (stats.hourlyClaimPressures || []).reduce((acc, h) => acc + h.claimCount, 0);
  }, [stats]);

  const peakClaim = useMemo(() => {
    if (!stats) return 0;
    if (stats.recentClaimsTimeline && stats.recentClaimsTimeline.length > 0) {
      return Math.max(...stats.recentClaimsTimeline.map((b) => Number(b.amount || 0)));
    }
    const maxH = Math.max(...(stats.hourlyClaimPressures || []).map((h) => Number(h.volume || 0)), 0);
    return maxH;
  }, [stats]);

  // Chart data points based on mode
  const chartPoints = useMemo(() => {
    if (!stats) return [];

    if (viewMode === 'hourly') {
      const hourly = stats.hourlyClaimPressures || [];
      return hourly.map((h, i) => ({
        label: `${String(h.hour).padStart(2, '0')}:00`,
        value: hourlyMetric === 'count' ? h.claimCount : Number(h.volume || 0),
        raw: h,
      }));
    }

    if (viewMode === 'weekly') {
      const daily = stats.dailyClaimPressures || [];
      if (daily.length > 0) {
        return daily.map((d) => ({
          label: d.date.slice(5),
          value: Number(d.volume || 0),
          raw: d,
        }));
      }
      // Synthetic fallback days
      return [
        { label: 'Mon', value: 120 },
        { label: 'Tue', value: 180 },
        { label: 'Wed', value: 240 },
        { label: 'Thu', value: 310 },
        { label: 'Fri', value: 450 },
        { label: 'Sat', value: 290 },
        { label: 'Today', value: todayVolume || 150 },
      ];
    }

    // Timeline mode
    const timeline = stats.recentClaimsTimeline || [];
    if (timeline.length > 0) {
      return timeline.slice(-15).map((t, idx) => ({
        label: t.listingName ? t.listingName.slice(0, 5) : `#${idx + 1}`,
        value: Number(t.amount || 0),
        raw: t,
      }));
    }

    // Default curve if no claims yet
    return [
      { label: '00:00', value: 10 },
      { label: '06:00', value: 25 },
      { label: '12:00', value: 45 },
      { label: '18:00', value: 30 },
      { label: 'Now', value: 15 },
    ];
  }, [stats, viewMode, hourlyMetric, todayVolume]);

  const maxVal = Math.max(...chartPoints.map((p) => p.value), 10);

  // SVG Area / Bar path generation
  const barWidth = Math.max(6, Math.floor((chartWidth - 40) / Math.max(chartPoints.length, 1)) - 6);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]}>
              Placement Velocity &amp; Ranking Depth
            </Text>
            <View style={[styles.liveBadge, { backgroundColor: colors.secondaryLight }]}>
              <View style={[styles.liveDot, { backgroundColor: colors.secondaryGreen }]} />
              <Text style={[styles.liveText, { color: colors.secondaryGreen }]}>LIVE SYNC</Text>
            </View>
          </View>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Continuous payment activity &amp; placement depth
          </Text>
        </View>

        {/* Quick KPI pills */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiPill, { backgroundColor: colors.surfaceSubtle }]}>
            <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Today's Vol</Text>
            <Text style={[styles.kpiVal, { color: colors.text }]}>₹{todayVolume.toFixed(0)}</Text>
          </View>
          <View style={[styles.kpiPill, { backgroundColor: colors.surfaceSubtle }]}>
            <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Count</Text>
            <Text style={[styles.kpiVal, { color: colors.text }]}>{todayClaimsCount}</Text>
          </View>
          {peakClaim > 0 && (
            <View style={[styles.kpiPill, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.kpiLabel, { color: colors.primary }]}>Peak</Text>
              <Text style={[styles.kpiVal, { color: colors.primary }]}>₹{peakClaim.toFixed(0)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Control Tabs */}
      <View style={styles.controlsBar}>
        <View style={[styles.tabGroup, { backgroundColor: colors.surfaceSubtle }]}>
          <Pressable
            style={[
              styles.tabBtn,
              viewMode === 'timeline' && [styles.tabBtnActive, { backgroundColor: colors.surface }],
            ]}
            onPress={() => setViewMode('timeline')}>
            <Ionicons
              name="flash"
              size={12}
              color={viewMode === 'timeline' ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: viewMode === 'timeline' ? colors.primary : colors.textMuted },
              ]}>
              Timeline
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.tabBtn,
              viewMode === 'hourly' && [styles.tabBtnActive, { backgroundColor: colors.surface }],
            ]}
            onPress={() => setViewMode('hourly')}>
            <Ionicons
              name="time"
              size={12}
              color={viewMode === 'hourly' ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: viewMode === 'hourly' ? colors.primary : colors.textMuted },
              ]}>
              24H Hourly
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.tabBtn,
              viewMode === 'weekly' && [styles.tabBtnActive, { backgroundColor: colors.surface }],
            ]}
            onPress={() => setViewMode('weekly')}>
            <Ionicons
              name="calendar"
              size={12}
              color={viewMode === 'weekly' ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: viewMode === 'weekly' ? colors.primary : colors.textMuted },
              ]}>
              7D Trend
            </Text>
          </Pressable>
        </View>

        {viewMode === 'hourly' && (
          <View style={styles.subControlRow}>
            {(['both', 'volume', 'count'] as const).map((m) => (
              <Pressable
                key={m}
                style={[
                  styles.metricBtn,
                  hourlyMetric === m && [styles.metricBtnActive, { backgroundColor: colors.primary }],
                ]}
                onPress={() => setHourlyMetric(m)}>
                <Text
                  style={[
                    styles.metricBtnText,
                    { color: hourlyMetric === m ? '#fff' : colors.textMuted },
                  ]}>
                  {m === 'both' ? 'Both' : m === 'volume' ? 'Vol' : 'Count'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* SVG Chart */}
      <View style={styles.chartWrapper}>
        <Svg width={chartWidth} height={chartHeight}>
          <Defs>
            <LinearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity="0.9" />
              <Stop offset="1" stopColor={colors.primary} stopOpacity="0.25" />
            </LinearGradient>
            <LinearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.gold} stopOpacity="0.9" />
              <Stop offset="1" stopColor={colors.gold} stopOpacity="0.3" />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          <Line
            x1="20"
            y1={chartHeight - 30}
            x2={chartWidth - 10}
            y2={chartHeight - 30}
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

          {/* Axis Labels */}
          <SvgText
            x="5"
            y={chartHeight - 28}
            fontSize="9"
            fill={colors.textFaint}
            textAnchor="start">
            0
          </SvgText>
          <SvgText
            x="5"
            y={chartHeight / 2 + 4}
            fontSize="9"
            fill={colors.textFaint}
            textAnchor="start">
            {(maxVal / 2).toFixed(0)}
          </SvgText>
          <SvgText x="5" y="16" fontSize="9" fill={colors.textFaint} textAnchor="start">
            {maxVal.toFixed(0)}
          </SvgText>

          {/* Bars / Points */}
          {chartPoints.map((pt, i) => {
            const usableH = chartHeight - 50;
            const barH = Math.max(4, (pt.value / maxVal) * usableH);
            const x = 30 + i * (barWidth + 8);
            const y = chartHeight - 30 - barH;
            const isSelected = selectedIndex === i;

            return (
              <React.Fragment key={i}>
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={3}
                  fill={isSelected ? colors.gold : 'url(#barGrad)'}
                  onPress={() => setSelectedIndex(isSelected ? null : i)}
                />
                {/* Point label */}
                {i % Math.ceil(chartPoints.length / 6) === 0 && (
                  <SvgText
                    x={x + barWidth / 2}
                    y={chartHeight - 12}
                    fontSize="8"
                    fill={colors.textFaint}
                    textAnchor="middle">
                    {pt.label}
                  </SvgText>
                )}
              </React.Fragment>
            );
          })}
        </Svg>
      </View>

      {/* Selected point inspection */}
      {selectedIndex !== null && chartPoints[selectedIndex] && (
        <View style={[styles.tooltipCard, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.tooltipLabel, { color: colors.textMuted }]}>
            {chartPoints[selectedIndex].label}:
          </Text>
          <Text style={[styles.tooltipVal, { color: colors.primary }]}>
            ₹{chartPoints[selectedIndex].value}
          </Text>
        </View>
      )}

      {/* Footer Info */}
      <View style={styles.footerRow}>
        <View style={styles.footerHint}>
          <Ionicons name="information-circle-outline" size={13} color={colors.secondaryGreen} />
          <Text style={[styles.footerHintText, { color: colors.textMuted }]}>
            Tap bars to inspect payment volume
          </Text>
        </View>
        <View style={[styles.auditPill, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.auditPillText, { color: colors.textMuted }]}>
            Audit {stats?.protocolAuditId || '#AUDIT-1'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    marginVertical: Spacing.two,
  },
  header: {
    marginBottom: Spacing.two,
  },
  titleWrap: {
    marginBottom: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.pill,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  kpiPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  kpiVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  tabGroup: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 2,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  tabBtnActive: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  subControlRow: {
    flexDirection: 'row',
    gap: 4,
  },
  metricBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  metricBtnActive: {},
  metricBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chartWrapper: {
    alignItems: 'center',
    marginVertical: Spacing.one,
  },
  tooltipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    marginBottom: Spacing.one,
  },
  tooltipLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tooltipVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.15)',
  },
  footerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerHintText: {
    fontSize: 11,
  },
  auditPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  auditPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
