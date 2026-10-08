import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppFooter } from '../../components/AppFooter';
import { AppHeader } from '../../components/AppHeader';
import { SmoothChevron, SmoothCollapsible } from '../../components/SmoothCollapsible';
import { getCategoryIcon } from '../../constants/icons';
import { Radius, Spacing } from '../../constants/theme';
import { useSignalR } from '../../context/SignalRContext';
import { useAppTheme } from '../../context/ThemeContext';
import { DailyListingGroupDto } from '../../models';
import { getDailyListings, recordListingClick } from '../../services/api';

export default function DailyListingsScreen() {
  const { colors, isDark } = useAppTheme();
  const router = useRouter();
  const { clickCounts: liveClickCounts } = useSignalR();

  const [groups, setGroups] = useState<DailyListingGroupDto[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  const loadData = async (pageNum = 1, append = false) => {
    try {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      const res = await getDailyListings(pageNum, 5);
      if (res && res.items) {
        setTotalCount(res.totalCount);
        if (append) {
          setGroups((prev) => [...prev, ...res.items]);
        } else {
          setGroups(res.items);
          // Expand the first day by default
          if (res.items.length > 0) {
            setExpandedDays(new Set([res.items[0].day]));
          }
        }
        setPage(pageNum);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(1, false);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(1, false);
  };

  const toggleDay = (day: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const handleOpenListing = (listingId: number) => {
    recordListingClick(listingId).catch(() => {});
    router.push(`/listing/${listingId}` as any);
  };

  const hasMore = groups.length < totalCount;

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
          <Text style={[styles.title, { color: colors.text }]}>Daily Listings Archive</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Chronological audit of winning products &amp; traffic generated day by day
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Loading daily historical archives...
            </Text>
          </View>
        ) : groups.length === 0 ? (
          <View style={[styles.emptyWrap, { backgroundColor: colors.surface }]}>
            <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No daily records yet</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              Records will appear as daily placement windows complete.
            </Text>
          </View>
        ) : (
          <View style={styles.groupsList}>
            {groups.map((group) => {
              const isExpanded = expandedDays.has(group.day);

              return (
                <View
                  key={group.day}
                  style={[
                    styles.dayCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}>
                  {/* Card Accordion Header */}
                  <Pressable
                    style={styles.dayCardHeader}
                    onPress={() => toggleDay(group.day)}>
                    <View style={styles.dayTitleWrap}>
                      <Ionicons name="calendar" size={16} color={colors.primary} />
                      <Text style={[styles.dayTitle, { color: colors.text }]}>{group.day}</Text>
                      <View style={[styles.countPill, { backgroundColor: colors.surfaceSubtle }]}>
                        <Text style={[styles.countPillText, { color: colors.textMuted }]}>
                          {group.totalCount} {group.totalCount === 1 ? 'product' : 'products'}
                        </Text>
                      </View>
                    </View>

                    <SmoothChevron
                      expanded={isExpanded}
                      size={18}
                      color={colors.textMuted}
                    />
                  </Pressable>

                  {/* Expanded Rows with Smooth Transition */}
                  <SmoothCollapsible collapsed={!isExpanded} duration={340}>
                    <View
                      style={[
                        styles.entriesList,
                        { borderTopColor: colors.border, borderTopWidth: 1 },
                      ]}>
                      {group.entries.map((item) => {
                        const isGold = item.rank === 1;
                        const isSilver = item.rank === 2;
                        const isBronze = item.rank === 3;

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

                        const clicks = liveClickCounts[item.listingId] ?? item.clickCount;

                        return (
                          <Pressable
                            key={item.listingId}
                            style={[
                              styles.entryRow,
                              { borderBottomColor: colors.border },
                            ]}
                            onPress={() => handleOpenListing(item.listingId)}>
                            <View style={[styles.rankBox, { backgroundColor: rankBg }]}>
                              <Text style={[styles.rankText, { color: rankColor }]}>
                                #{item.rank}
                              </Text>
                            </View>

                            <View style={styles.entryInfo}>
                              <Text numberOfLines={1} style={[styles.entryName, { color: colors.text }]}>
                                {item.listingName}
                              </Text>
                              <Text style={[styles.entryMeta, { color: colors.textMuted }]}>
                                {getCategoryIcon(item.categorySlug)} {item.categoryName} • {clicks} clicks
                              </Text>
                            </View>

                            <View style={styles.entryRight}>
                              <Text style={[styles.entryClaim, { color: colors.primary }]}>
                                ${item.currentClaimAmount.toFixed(0)}
                              </Text>
                              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </SmoothCollapsible>
                </View>
              );
            })}

            {/* Load more button */}
            {hasMore && (
              <Pressable
                style={[styles.loadMoreBtn, { backgroundColor: colors.surfaceSubtle }]}
                disabled={loadingMore}
                onPress={() => loadData(page + 1, true)}>
                {loadingMore ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Text style={[styles.loadMoreText, { color: colors.text }]}>
                      Load Older Days
                    </Text>
                    <Ionicons name="arrow-down" size={14} color={colors.text} />
                  </>
                )}
              </Pressable>
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
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
  },
  loadingWrap: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    gap: Spacing.two,
  },
  loadingText: {
    fontSize: 12,
  },
  emptyWrap: {
    padding: Spacing.five,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.three,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
  },
  groupsList: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  dayCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dayCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
  },
  dayTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  countPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  entriesList: {
    paddingHorizontal: Spacing.three,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  rankBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '800',
  },
  entryInfo: {
    flex: 1,
    gap: 2,
  },
  entryName: {
    fontSize: 13,
    fontWeight: '700',
  },
  entryMeta: {
    fontSize: 11,
  },
  entryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  entryClaim: {
    fontSize: 14,
    fontWeight: '800',
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    marginVertical: Spacing.two,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
