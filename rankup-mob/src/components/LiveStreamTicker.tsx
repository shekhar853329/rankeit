import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Radius, Spacing } from '../constants/theme';
import { useSignalR } from '../context/SignalRContext';
import { useAppTheme } from '../context/ThemeContext';
import { LiveBidEventDto } from '../models';
import { getLiveStream } from '../services/api';

export const LiveStreamTicker: React.FC = () => {
  const { colors } = useAppTheme();
  const { lastLiveBid } = useSignalR();
  const [events, setEvents] = useState<LiveBidEventDto[]>([]);

  useEffect(() => {
    getLiveStream(8)
      .then((res) => {
        if (Array.isArray(res)) {
          setEvents(res);
        }
      })
      .catch(() => {});
  }, []);

  // Prepend real-time bid if SignalR pushes one
  useEffect(() => {
    if (lastLiveBid) {
      setEvents((prev) => [lastLiveBid, ...prev.slice(0, 7)]);
    }
  }, [lastLiveBid]);

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
          <View style={styles.beaconWrap}>
            <View style={[styles.beaconDot, { backgroundColor: colors.secondaryGreen }]} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Live Activity Feed</Text>
        </View>
        <Text style={[styles.statusText, { color: colors.secondaryGreen }]}>Auto-syncing</Text>
      </View>

      {/* Stream list */}
      <View style={styles.streamList}>
        {events.map((ev, idx) => (
          <View key={ev.bidId ?? idx} style={styles.streamItem}>
            <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSubtle }]}>
              <Ionicons
                name={ev.isTopBid ? 'trophy' : 'flash'}
                size={14}
                color={ev.isTopBid ? colors.gold : colors.primary}
              />
            </View>
            <View style={styles.itemInfo}>
              <Text numberOfLines={1} style={[styles.itemText, { color: colors.text }]}>
                <Text style={{ fontWeight: '800' }}>{ev.listingName || 'Maker'}</Text>{' '}
                {ev.actionText || 'promoted their listing'}
              </Text>
              <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
                {ev.timeAgo || 'Just now'} • {ev.highlightText || `₹${ev.amount}`}
              </Text>
            </View>
          </View>
        ))}

        {events.length === 0 && (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Waiting for live activity on today's leaderboard...
            </Text>
          </View>
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
  beaconWrap: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beaconDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.pill,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  streamList: {
    gap: Spacing.two,
  },
  streamItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 1,
  },
  itemText: {
    fontSize: 12,
  },
  itemMeta: {
    fontSize: 11,
  },
  empty: {
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 11,
  },
});
