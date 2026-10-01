import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Radius, Spacing } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { HallOfFameItemDto } from '../models';
import { getHallOfFame } from '../services/api';

export const HallOfFameCard: React.FC = () => {
  const { colors, isDark } = useAppTheme();
  const router = useRouter();
  const [mode, setMode] = useState<'alltime' | 'today'>('alltime');
  const [items, setItems] = useState<HallOfFameItemDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadHof();
  }, [mode]);

  const loadHof = () => {
    setLoading(true);
    getHallOfFame(5)
      .then((res) => {
        if (Array.isArray(res)) {
          setItems(res);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'alltime' ? 'today' : 'alltime'));
  };

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
        <View style={styles.titleRow}>
          <Ionicons
            name={mode === 'alltime' ? 'medal' : 'flame'}
            size={18}
            color={mode === 'alltime' ? colors.gold : colors.primary}
          />
          <Text style={[styles.title, { color: colors.text }]}>
            {mode === 'alltime' ? 'All-Time Pantheon' : "Today's Auction"}
          </Text>
        </View>

        <View
          style={[
            styles.badge,
            { backgroundColor: mode === 'alltime' ? colors.goldBg : colors.secondaryLight },
          ]}>
          <Text
            style={[
              styles.badgeText,
              { color: mode === 'alltime' ? colors.gold : colors.secondaryGreen },
            ]}>
            {mode === 'alltime' ? 'All-Time Peak' : "Today's Live"}
          </Text>
        </View>
      </View>

      {/* Items list */}
      <View style={styles.list}>
        {items.map((item, index) => {
          const isGold = index === 0;
          const isSilver = index === 1;
          const isBronze = index === 2;

          let rankBg: string = colors.surfaceSubtle;
          let rankColor: string = colors.textMuted;
          if (isGold) {
            rankBg = colors.goldBg;
            rankColor = colors.gold;
          } else if (isSilver) {
            rankBg = colors.silverBg;
            rankColor = colors.silver;
          } else if (isBronze) {
            rankBg = colors.bronzeBg;
            rankColor = colors.bronze;
          }

          return (
            <View
              key={item.id ?? index}
              style={[
                styles.itemRow,
                {
                  borderBottomColor: colors.border,
                  borderBottomWidth: index === items.length - 1 ? 0 : StyleSheet.hairlineWidth,
                },
              ]}>
              <View style={styles.itemLeft}>
                <View style={[styles.rankBox, { backgroundColor: rankBg }]}>
                  <Text style={[styles.rankText, { color: rankColor }]}>{index + 1}</Text>
                </View>
                <View style={styles.itemInfo}>
                  <Text numberOfLines={1} style={[styles.itemName, { color: colors.text }]}>
                    {item.siteName || item.name}
                  </Text>
                  <Text style={[styles.itemClicks, { color: colors.textMuted }]}>
                    {item.clickCount ?? 0} clicks generated
                  </Text>
                </View>
              </View>

              <Text style={[styles.itemBid, { color: colors.primary }]}>
                ₹{(item.bid ?? 0).toFixed(0)}
              </Text>
            </View>
          );
        })}

        {items.length === 0 && !loading && (
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {mode === 'alltime'
                ? 'No all-time champions found yet.'
                : "No bids placed in today's auction yet."}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actionsWrap}>
        <Pressable
          style={[styles.switchBtn, { backgroundColor: colors.surfaceSubtle }]}
          onPress={toggleMode}>
          <Text style={[styles.switchBtnText, { color: colors.text }]}>
            {mode === 'alltime'
              ? "Switch View to Today's Auction"
              : 'Switch View to All-Time Pantheon'}
          </Text>
          <Ionicons name="swap-horizontal" size={14} color={colors.text} />
        </Pressable>

        {mode === 'alltime' && (
          <Pressable
            style={styles.dailyLink}
            onPress={() => router.push('/(tabs)/daily')}>
            <Text style={[styles.dailyLinkText, { color: colors.primary }]}>
              Explore All Historic Champions
            </Text>
            <Ionicons name="arrow-forward" size={13} color={colors.primary} />
          </Pressable>
        )}
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
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  list: {
    gap: 2,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  rankBox: {
    width: 26,
    height: 26,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 13,
    fontWeight: '800',
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  itemClicks: {
    fontSize: 11,
  },
  itemBid: {
    fontSize: 14,
    fontWeight: '800',
  },
  emptyWrap: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
  },
  actionsWrap: {
    marginTop: Spacing.one,
    gap: Spacing.two,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  switchBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dailyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dailyLinkText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
