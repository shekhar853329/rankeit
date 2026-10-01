import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { Radius, Spacing } from '../constants/theme';
import { useSignalR } from '../context/SignalRContext';
import { useAppTheme } from '../context/ThemeContext';

export const AppHeader: React.FC = () => {
  const router = useRouter();
  const { colors, isDark, toggleTheme } = useAppTheme();
  const { onlineUsers, visitsToday } = useSignalR();
  const insets = useSafeAreaInsets();

  const androidBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const topInset = Math.max(insets.top, androidBarHeight, 10);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          paddingTop: topInset + 4,
        },
      ]}>
      <View style={styles.headerRow}>
        {/* Brand Group + Live Online Indicator */}
        <Pressable
          style={styles.brandGroup}
          onPress={() => router.push('/(tabs)')}
          accessibilityLabel="RankUp Home">
          <View style={styles.logoWrap}>
            <Svg width={24} height={24} viewBox="0 0 32 32">
              <Rect width={32} height={32} rx={9} fill={colors.primary} />
              <Path d="M16 7L24 20H8L16 7Z" fill="#FFFFFF" />
              <Rect x={10.5} y={22} width={11} height={2.5} rx={1} fill="#FFFFFF" fillOpacity={0.85} />
            </Svg>
          </View>
          <Text style={[styles.brandTitle, { color: colors.text }]}>RankUp</Text>

          {/* Inline Live Online Beacon */}
          <View style={[styles.liveBeaconPill, { backgroundColor: colors.surfaceSubtle }]}>
            <View style={[styles.beaconDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.liveBeaconText, { color: colors.text }]}>
              {onlineUsers} <Text style={{ color: colors.textMuted }}>live</Text>
            </Text>
          </View>
        </Pressable>

        {/* Action icons & Google Stats */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.statsPill, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}
            onPress={() => router.push('/(tabs)/analytics')}
            accessibilityLabel="View Real-Time Traffic & Analytics">
            <Ionicons name="stats-chart" size={11} color={colors.primary} />
            <Text style={[styles.analyticsLinkText, { color: colors.primary }]}>Stats</Text>
          </Pressable>

          <Pressable
            style={[styles.iconButton, { backgroundColor: colors.surfaceSubtle }]}
            onPress={toggleTheme}
            accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={15}
              color={colors.text}
            />
          </Pressable>

          <Pressable
            style={[styles.iconButton, { backgroundColor: colors.surfaceSubtle }]}
            onPress={() => router.push('/api-settings')}
            accessibilityLabel="API Settings">
            <Ionicons name="settings-outline" size={15} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.three,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 34,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoWrap: {
    width: 24,
    height: 24,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  liveBeaconPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    marginLeft: 2,
  },
  beaconDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveBeaconText: {
    fontSize: 10,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  analyticsLinkText: {
    fontSize: 10,
    fontWeight: '700',
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
