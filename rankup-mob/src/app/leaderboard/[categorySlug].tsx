import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';

if (Platform.OS === 'android' && !((globalThis as any).nativeFabricUIManager) && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { AppFooter } from '../../components/AppFooter';
import { AppHeader } from '../../components/AppHeader';
import { ProductAvatar } from '../../components/ProductAvatar';
import { SmoothChevron, useCollapsible } from '../../components/SmoothCollapsible';
import { getCategoryIcon } from '../../constants/icons';
import { Radius, Spacing } from '../../constants/theme';
import { useClaimModal } from '../../context/ModalContext';
import { useSignalR } from '../../context/SignalRContext';
import { useAppTheme } from '../../context/ThemeContext';
import { CategoryLeaderboardResponseDto, PlatformStatsDto } from '../../models';
import {
  getCategoryLeaderboard,
  getPlatformStats,
  recordListingClick,
} from '../../services/api';
import { signalRService } from '../../services/signalr.service';

export default function CategoryLeaderboardScreen() {
  const { colors, isDark } = useAppTheme();
  const router = useRouter();
  const { categorySlug } = useLocalSearchParams<{ categorySlug: string }>();
  const { openClaimModal } = useClaimModal();
  const { clickCounts: liveClickCounts, lastRankUpdate } = useSignalR();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [timeMode, setTimeMode] = useState<'today' | 'alltime'>('today');
  const [search, setSearch] = useState<string>('');

  const [data, setData] = useState<CategoryLeaderboardResponseDto | null>(null);
  const [stats, setStats] = useState<PlatformStatsDto | null>(null);

  // Command bar hero
  const [claimBid, setClaimBid] = useState<number>(10);
  const [claimUrl, setClaimUrl] = useState<string>('');
  const [isCatClaimCollapsed, setIsCatClaimCollapsed] = useState<boolean>(true);

  const toggleCatClaimCollapse = () => {
    setIsCatClaimCollapsed((prev) => !prev);
  };

  const {
    animProgress: catClaimAnimProgress,
    containerStyle: catClaimCollapsibleStyle,
    handleLayout: handleCatClaimLayout,
    measuredHeight: catClaimMeasuredHeight,
  } = useCollapsible(isCatClaimCollapsed, { duration: 340 });

  const loadData = useCallback(async () => {
    if (!categorySlug) return;
    try {
      const [catRes, statsRes] = await Promise.all([
        getCategoryLeaderboard(categorySlug, 1, 30, timeMode, search),
        getPlatformStats(categorySlug),
      ]);
      if (catRes) {
        setData(catRes);
        if (catRes.minStartingBid && claimBid < catRes.minStartingBid) {
          setClaimBid(catRes.minStartingBid);
        }
      }
      if (statsRes) setStats(statsRes);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categorySlug, timeMode, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (categorySlug) {
      signalRService.joinCategoryGroup(categorySlug);
      return () => {
        signalRService.leaveCategoryGroup(categorySlug);
      };
    }
  }, [categorySlug]);

  useEffect(() => {
    if (lastRankUpdate && lastRankUpdate.categorySlug === categorySlug) {
      loadData();
    }
  }, [lastRankUpdate, categorySlug, loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const items = data?.leaderboard?.items || [];
  const topBid = items.length > 0 ? items[0].currentBidAmount : 0;
  const icon = getCategoryIcon(categorySlug);

  const handleClaim = (amount?: number, rank?: number) => {
    openClaimModal({
      rank: rank ?? 1,
      categoryName: data?.categoryName ?? categorySlug,
      categorySlug: categorySlug,
      categoryId: data?.categoryId ?? 1,
      minStartingBid: data?.minStartingBid ?? 1,
      minBidIncrement: data?.minBidIncrement ?? 1,
      amount: amount ?? claimBid,
      listingUrl: claimUrl.trim() || undefined,
      onSuccess: () => loadData(),
    });
  };

  const handleOpenListing = (listingId: number) => {
    recordListingClick(listingId).catch(() => {});
    router.push(`/listing/${listingId}` as any);
  };

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
        {/* Breadcrumb Back Bar */}
        <Pressable
          style={styles.breadcrumbRow}
          onPress={() => router.push('/(tabs)/categories')}>
          <Ionicons name="arrow-back" size={16} color={colors.primary} />
          <Text style={[styles.breadcrumbText, { color: colors.primary }]}>
            All Categories
          </Text>
          <Text style={{ color: colors.textMuted }}>/</Text>
          <Text style={[styles.breadcrumbCurrent, { color: colors.textMuted }]}>
            {data?.categoryName || categorySlug}
          </Text>
        </Pressable>

        {/* Category Hero Banner */}
        <View style={[styles.categoryHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroTop}>
            <View style={[styles.categoryIconWrap, { backgroundColor: colors.surfaceSubtle }]}>
              <Text style={{ fontSize: 22 }}>{icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.categoryTitle, { color: colors.text }]}>
                {data?.categoryName || categorySlug}
              </Text>
              <Text style={[styles.categorySub, { color: colors.textMuted }]}>
                {data?.leaderboard?.totalCount ?? 0} active listings • Min bid ₹{data?.minStartingBid ?? 1} (+₹{data?.minBidIncrement ?? 1})
              </Text>
            </View>
          </View>

          {/* Quick claim bar for this category (Collapsible) */}
          <View style={[styles.catCommandBar, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
            <Pressable
              style={styles.catCommandToggleHeader}
              onPress={toggleCatClaimCollapse}
              accessibilityRole="button"
              accessibilityLabel="Toggle Claim Spot section">
              <View style={styles.catCommandToggleLeft}>
                <Ionicons name="flash" size={13} color={colors.primary} />
                <Text style={[styles.catCommandToggleTitle, { color: colors.text }]}>Claim Spot</Text>
                <View style={[styles.catBidPill, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.catBidPillText, { color: colors.primary }]}>₹{claimBid}</Text>
                </View>
              </View>

              <View style={styles.catCommandToggleRight}>
                <SmoothChevron
                  animProgress={catClaimAnimProgress}
                  size={14}
                  color={colors.textMuted}
                />
              </View>
            </Pressable>

            <Animated.View style={catClaimCollapsibleStyle} pointerEvents={isCatClaimCollapsed ? 'none' : 'auto'}>
              <View
                onLayout={handleCatClaimLayout}
                pointerEvents={isCatClaimCollapsed ? 'none' : 'auto'}
                style={[
                  styles.catExpandedBody,
                  catClaimMeasuredHeight === null && isCatClaimCollapsed
                    ? {
                        position: 'absolute',
                        top: -9999,
                        left: 0,
                        right: 0,
                        opacity: 0,
                      }
                    : undefined,
                ]}>
                <View style={styles.catCommandInputRow}>
                  <Ionicons name="link-outline" size={14} color={colors.textMuted} />
                  <TextInput
                    style={[styles.catCommandInput, { color: colors.text }]}
                    placeholder="Your website URL or @handle"
                    placeholderTextColor={colors.textFaint}
                    value={claimUrl}
                    onChangeText={setClaimUrl}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.catCommandActionRow}>
                  <View style={[styles.stepperWrap, { backgroundColor: colors.surface }]}>
                    <Pressable
                      style={styles.stepBtn}
                      onPress={() => setClaimBid((p) => Math.max(data?.minStartingBid ?? 1, p - 1))}>
                      <Text style={[styles.stepBtnText, { color: colors.text }]}>−</Text>
                    </Pressable>
                    <Text style={[styles.stepVal, { color: colors.primary }]}>₹{claimBid}</Text>
                    <Pressable
                      style={styles.stepBtn}
                      onPress={() => setClaimBid((p) => p + (data?.minBidIncrement ?? 1))}>
                      <Text style={[styles.stepBtnText, { color: colors.text }]}>+</Text>
                    </Pressable>
                  </View>

                  <Pressable
                    style={[styles.catClaimBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleClaim(claimBid, 1)}>
                    <Text style={styles.catClaimBtnText}>Claim Spot</Text>
                    <Ionicons name="flash" size={13} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          </View>
        </View>

        {/* Filter / Search Bar */}
        <View style={styles.filterRow}>
          <View style={[styles.timeToggle, { backgroundColor: colors.surfaceSubtle }]}>
            <Pressable
              style={[
                styles.timeBtn,
                timeMode === 'today' && [styles.timeBtnActive, { backgroundColor: colors.surface }],
              ]}
              onPress={() => setTimeMode('today')}>
              <Text
                style={[
                  styles.timeBtnText,
                  { color: timeMode === 'today' ? colors.primary : colors.textMuted },
                ]}>
                Today
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.timeBtn,
                timeMode === 'alltime' && [styles.timeBtnActive, { backgroundColor: colors.surface }],
              ]}
              onPress={() => setTimeMode('alltime')}>
              <Text
                style={[
                  styles.timeBtnText,
                  { color: timeMode === 'alltime' ? colors.primary : colors.textMuted },
                ]}>
                All-Time
              </Text>
            </Pressable>
          </View>

          <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={14} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search..."
              placeholderTextColor={colors.textFaint}
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>

        {/* Listings Feed */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Loading category leaderboard...
            </Text>
          </View>
        ) : items.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="rocket-outline" size={40} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Be the first to claim #{1} in {data?.categoryName || categorySlug}!
            </Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              Starting at just ₹{data?.minStartingBid ?? 1}. Early backers keep the tiebreaker advantage!
            </Text>
            <Pressable
              style={[styles.emptyClaimBtn, { backgroundColor: colors.primary }]}
              onPress={() => handleClaim(data?.minStartingBid ?? 1, 1)}>
              <Text style={styles.emptyClaimBtnText}>
                Claim #1 for ₹{data?.minStartingBid ?? 1}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.feedList}>
            {items.map((row) => {
              const isGold = row.rank === 1;
              const isSilver = row.rank === 2;
              const isBronze = row.rank === 3;
              const clicks = liveClickCounts[row.listingId] ?? row.clickCount;

              let rankBg: string = colors.surfaceSubtle;
              let rankColor: string = colors.textMuted;
              if (isGold) {
                rankBg = colors.gold;
                rankColor = '#ffffff';
              } else if (isSilver) {
                rankBg = colors.silverBg;
                rankColor = colors.silver;
              } else if (isBronze) {
                rankBg = colors.bronzeBg;
                rankColor = colors.bronze;
              }

              return (
                <Pressable
                  key={row.listingId}
                  style={[
                    styles.itemCard,
                    {
                      backgroundColor: isGold && isDark ? '#1a140a' : colors.surface,
                      borderColor: isGold
                        ? colors.gold
                        : isSilver
                          ? isDark
                            ? '#334155'
                            : '#cbd5e1'
                          : colors.border,
                    },
                  ]}
                  onPress={() => handleOpenListing(row.listingId)}>
                  <View style={styles.itemCardBody}>
                    <View style={styles.itemLeft}>
                      <View style={[styles.rankBadge, { backgroundColor: rankBg }]}>
                        <Text style={[styles.rankBadgeText, { color: rankColor }]}>
                          #{row.rank}
                        </Text>
                      </View>

                      <ProductAvatar
                        name={row.siteName || row.listingName}
                        url={row.listingUrl}
                        logoUrl={row.logoUrl}
                        faviconUrl={row.faviconUrl}
                        size={34}
                        borderRadius={Radius.md}
                        fallbackBg={isGold ? colors.goldBg : rankBg}
                        fallbackTextColor={isGold ? colors.gold : rankColor}
                      />

                      <View style={styles.itemMeta}>
                        <Text numberOfLines={1} style={[styles.itemTitle, { color: colors.text }]}>
                          {row.siteName || row.listingName}
                        </Text>
                        {row.description ? (
                          <Text numberOfLines={1} style={[styles.itemDesc, { color: colors.textMuted }]}>
                            {row.description}
                          </Text>
                        ) : null}
                        <Text style={[styles.itemSub, { color: colors.textMuted }]}>
                          {clicks} clicks
                        </Text>
                      </View>
                    </View>

                    <View style={styles.itemRight}>
                      <Text style={[styles.itemBid, { color: colors.primary }]}>
                        ₹{row.currentBidAmount.toFixed(0)}
                      </Text>
                      <Pressable
                        style={[
                          styles.outbidBtn,
                          {
                            backgroundColor: isGold ? colors.primary : colors.surfaceSubtle,
                          },
                        ]}
                        onPress={() =>
                          handleClaim(
                            row.currentBidAmount + (data?.minBidIncrement ?? 1),
                            row.rank,
                          )
                        }>
                        <Text
                          style={[
                            styles.outbidBtnText,
                            { color: isGold ? '#ffffff' : colors.text },
                          ]}>
                          Outbid
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              );
            })}
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
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  breadcrumbText: {
    fontSize: 12,
    fontWeight: '700',
  },
  breadcrumbCurrent: {
    fontSize: 12,
  },
  categoryHero: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  categorySub: {
    fontSize: 11,
    marginTop: 1,
  },
  catCommandBar: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  catCommandToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  catCommandToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catCommandToggleTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  catBidPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  catBidPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  catCommandToggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  catCommandToggleHint: {
    fontSize: 11,
    fontWeight: '500',
  },
  catExpandedBody: {
    gap: 4,
    paddingTop: 3,
  },
  catCommandInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 6,
  },
  catCommandInput: {
    flex: 1,
    fontSize: 11.5,
    paddingVertical: 0,
  },
  catCommandActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.pill,
    padding: 2,
  },
  stepBtn: {
    width: 20,
    height: 20,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  stepVal: {
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 6,
  },
  catClaimBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 30,
    borderRadius: Radius.pill,
  },
  catClaimBtnText: {
    color: '#fff',
    fontSize: 11.5,
    fontWeight: '800',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
    gap: 6,
  },
  timeToggle: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 2,
    height: 30,
    alignItems: 'center',
  },
  timeBtn: {
    paddingHorizontal: 9,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.pill,
  },
  timeBtnActive: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  timeBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 11,
    paddingVertical: 0,
  },
  loadingWrap: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    gap: Spacing.two,
  },
  loadingText: {
    fontSize: 12,
  },
  emptyCard: {
    padding: Spacing.five,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.three,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
  },
  emptyClaimBtn: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    marginTop: Spacing.one,
  },
  emptyClaimBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  feedList: {
    gap: Spacing.two,
    marginVertical: Spacing.one,
  },
  itemCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  itemCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  avatarImg: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 14,
    fontWeight: '800',
  },
  itemMeta: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  itemDesc: {
    fontSize: 10.5,
  },
  itemSub: {
    fontSize: 10,
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  itemBid: {
    fontSize: 13.5,
    fontWeight: '900',
  },
  outbidBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: Radius.pill,
  },
  outbidBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
});
