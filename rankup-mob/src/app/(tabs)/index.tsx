import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  LayoutAnimation,
  Linking,
  Modal,
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
import { CategoryPills } from '../../components/CategoryPills';
import { ProductAvatar } from '../../components/ProductAvatar';
import { SmoothChevron, useCollapsible } from '../../components/SmoothCollapsible';
import { getCategoryIcon } from '../../constants/icons';
import { Radius, Spacing } from '../../constants/theme';
import { useClaimModal } from '../../context/ModalContext';
import { useSignalR } from '../../context/SignalRContext';
import { useAppTheme } from '../../context/ThemeContext';
import {
  CategoryDto,
  CategoryLeaderboardResponseDto,
  GlobalLeaderboardEntryDto,
  PlatformStatsDto,
} from '../../models';
import {
  getCategories,
  getCategoryLeaderboard,
  getGlobalLeaderboard,
  getPlatformStats,
  recordListingClick,
} from '../../services/api';

import { signalRService } from '../../services/signalr.service';

export default function GlobalLeaderboardScreen() {
  const { colors, isDark } = useAppTheme();
  const router = useRouter();
  const { openClaimModal } = useClaimModal();
  const { onlineUsers, lastRankUpdate, clickCounts: liveClickCounts } = useSignalR();

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [timeMode, setTimeMode] = useState<'today' | 'alltime'>('today');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState<number>(10);

  // Data
  const [globalEntries, setGlobalEntries] = useState<GlobalLeaderboardEntryDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryLeaderboardResponseDto | null>(null);
  const [platformStats, setPlatformStats] = useState<PlatformStatsDto | null>(null);

  // Command bar hero state
  const [heroBidAmount, setHeroBidAmount] = useState<number>(10);
  const [heroUrl, setHeroUrl] = useState<string>('');
  const [claimCategory, setClaimCategory] = useState<CategoryDto | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState<boolean>(false);
  const [catSearch, setCatSearch] = useState<string>('');
  const [isClaimCollapsed, setIsClaimCollapsed] = useState<boolean>(true);

  const toggleClaimCollapse = () => {
    setIsClaimCollapsed((prev) => !prev);
  };

  const {
    animProgress: claimAnimProgress,
    containerStyle: claimCollapsibleStyle,
    handleLayout: handleClaimLayout,
    measuredHeight: claimMeasuredHeight,
  } = useCollapsible(isClaimCollapsed, { duration: 340 });

  // Countdown timer
  const [countdown, setCountdown] = useState<string>('05h : 42m : 18s');

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const midnightUtc = new Date();
      midnightUtc.setUTCHours(24, 0, 0, 0);
      const diffMs = Math.max(0, midnightUtc.getTime() - now.getTime());

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      setCountdown(
        `${String(hours).padStart(2, '0')}h : ${String(minutes).padStart(2, '0')}m : ${String(seconds).padStart(2, '0')}s`,
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [catsRes, statsRes] = await Promise.all([
        getCategories(),
        getPlatformStats(selectedSlug),
      ]);

      if (catsRes && catsRes.items) {
        setCategories(catsRes.items);
        if (!claimCategory && catsRes.items.length > 0) {
          setClaimCategory(catsRes.items[0]);
        }
      }
      if (statsRes) setPlatformStats(statsRes);

      if (selectedSlug) {
        const catRes = await getCategoryLeaderboard(selectedSlug, 1, 30, timeMode, searchQuery);
        setCategoryData(catRes);
      } else {
        const globalRes = await getGlobalLeaderboard(30, timeMode, searchQuery);
        setGlobalEntries(globalRes || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSlug, timeMode, searchQuery, claimCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Join category group for real-time updates when a category is selected
  useEffect(() => {
    if (selectedSlug) {
      signalRService.joinCategoryGroup(selectedSlug);
      return () => {
        signalRService.leaveCategoryGroup(selectedSlug);
      };
    }
  }, [selectedSlug]);

  // Refresh if live SignalR rank updated
  useEffect(() => {
    if (lastRankUpdate) {
      loadData();
    }
  }, [lastRankUpdate, loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Compute displayed rows
  const displayedRows = useMemo(() => {
    if (selectedSlug && categoryData?.leaderboard?.items) {
      return categoryData.leaderboard.items.map((item) => ({
        rank: item.rank,
        listingId: item.listingId,
        listingName: item.listingName,
        listingUrl: item.listingUrl,
        currentBidAmount: item.currentBidAmount,
        categoryName: categoryData.categoryName,
        categorySlug: categoryData.categorySlug,
        clickCount: liveClickCounts[item.listingId] ?? item.clickCount,
        siteName: item.siteName,
        logoUrl: item.logoUrl,
        description: item.description,
        faviconUrl: item.faviconUrl,
      }));
    }

    return globalEntries.map((item) => ({
      rank: item.rank,
      listingId: item.listingId,
      listingName: item.listingName,
      listingUrl: item.listingUrl,
      currentBidAmount: item.currentBidAmount,
      categoryName: item.categoryName,
      categorySlug: item.categorySlug,
      clickCount: liveClickCounts[item.listingId] ?? item.clickCount,
      siteName: item.siteName,
      logoUrl: item.logoUrl,
      description: item.description,
      faviconUrl: item.faviconUrl,
    }));
  }, [selectedSlug, categoryData, globalEntries, liveClickCounts]);

  const visibleRows = displayedRows.slice(0, visibleCount);
  const reigningChamp = globalEntries.length > 0 ? globalEntries[0] : null;

  const handleOpenListing = (listingId: number, url: string) => {
    recordListingClick(listingId).catch(() => {});
    router.push(`/listing/${listingId}` as any);
  };

  const handleOpenUrlDirect = (listingId: number, url?: string | null) => {
    recordListingClick(listingId).catch(() => {});
    if (url && url.trim()) {
      const clean = url.trim();
      const target = clean.startsWith('http://') || clean.startsWith('https://') ? clean : `https://${clean}`;
      Linking.openURL(target).catch(() => {
        router.push(`/listing/${listingId}` as any);
      });
    } else {
      router.push(`/listing/${listingId}` as any);
    }
  };

  const handleClaimRank = (amount?: number, rank?: number, catSlug?: string, catName?: string) => {
    const slug = catSlug ?? claimCategory?.slug ?? 'general';
    const cat = categories.find((c) => c.slug === slug) ?? claimCategory;
    const bid = amount ?? heroBidAmount;

    openClaimModal({
      rank: rank ?? 1,
      categoryName: catName ?? cat?.name ?? 'General',
      categorySlug: slug,
      categoryId: cat?.id ?? 1,
      amount: bid,
      listingUrl: heroUrl.trim() || undefined,
      onSuccess: () => loadData(),
    });
  };

  const filteredCategories = useMemo(() => {
    if (!catSearch.trim()) return categories;
    return categories.filter((c) =>
      c.name.toLowerCase().includes(catSearch.toLowerCase().trim()),
    );
  }, [categories, catSearch]);

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
        {/* ═══════════════════════════════════════════════════════════
             HERO STATION: Command Center & Urgency Ticker (Collapsible)
             ═══════════════════════════════════════════════════════════ */}
        <View style={[styles.heroStation, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Collapsible Header Bar (Always visible, tap to toggle) */}
          <Pressable
            style={styles.heroToggleHeader}
            onPress={toggleClaimCollapse}
            accessibilityRole="button"
            accessibilityLabel="Toggle Claim a Spot section">
            <View style={styles.heroHeaderLeft}>
              <View style={[styles.claimIconCircle, { backgroundColor: `${colors.primary}18` }]}>
                <Ionicons name="flash" size={13} color={colors.primary} />
              </View>
              <View style={styles.claimTitleRow}>
                <Text style={[styles.headlineText, { color: colors.text }]}>Claim a Spot</Text>
                <View style={[styles.amountPill, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.amountPillText, { color: colors.primary }]}>for ₹{heroBidAmount}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.collapseChevronBtn, { backgroundColor: colors.surfaceSubtle }]}>
              <SmoothChevron
                animProgress={claimAnimProgress}
                size={14}
                color={colors.text}
              />
            </View>
          </Pressable>

          {/* Smooth Animated Collapsible Content */}
          <Animated.View style={claimCollapsibleStyle} pointerEvents={isClaimCollapsed ? 'none' : 'auto'}>
            <View
              onLayout={handleClaimLayout}
              pointerEvents={isClaimCollapsed ? 'none' : 'auto'}
              style={[
                styles.expandedHeroBody,
                claimMeasuredHeight === null && isClaimCollapsed
                  ? {
                      position: 'absolute',
                      top: -9999,
                      left: 0,
                      right: 0,
                      opacity: 0,
                    }
                  : undefined,
              ]}>
              {/* Stepper + Timer Row */}
              <View style={styles.heroExpandedTopRow}>
                {/* Stepper */}
                <View style={styles.stepperSubRow}>
                  <Text style={[styles.stepperLabel, { color: colors.textMuted }]}>
                    Bid Amount:
                  </Text>
                  <View style={[styles.heroStepper, { backgroundColor: colors.surfaceSubtle }]}>
                    <Pressable
                      style={styles.stepperActionBtn}
                      onPress={() => setHeroBidAmount((prev) => Math.max(1, prev - 1))}>
                      <Text style={[styles.stepperActionText, { color: colors.text }]}>−</Text>
                    </Pressable>
                    <Text style={[styles.stepperDisplay, { color: colors.primary }]}>
                      ₹{heroBidAmount}
                    </Text>
                    <Pressable
                      style={styles.stepperActionBtn}
                      onPress={() => setHeroBidAmount((prev) => prev + 1)}>
                      <Text style={[styles.stepperActionText, { color: colors.text }]}>+</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Countdown Badge moved inside collapsible panel */}
                <View style={[styles.countdownBadge, { backgroundColor: colors.surfaceSubtle }]}>
                  <Ionicons name="timer-outline" size={12} color={colors.primary} />
                  <Text style={[styles.countdownLabel, { color: colors.textMuted }]}>Resets:</Text>
                  <Text style={[styles.countdownTime, { color: colors.primary }]}>{countdown}</Text>
                  <Text style={[styles.countdownUtc, { color: colors.textFaint }]}>• Midnight UTC</Text>
                </View>
              </View>

              {/* Command Bar Form Box */}
              <View
                style={[
                  styles.commandBar,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderStrong,
                  },
                ]}>
                {/* URL input */}
                <View style={styles.commandField}>
                  <Ionicons name="link-outline" size={14} color={colors.textMuted} />
                  <TextInput
                    style={[styles.commandInput, { color: colors.text }]}
                    placeholder="Website or @X Handle"
                    placeholderTextColor={colors.textFaint}
                    value={heroUrl}
                    onChangeText={setHeroUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Category Selector trigger */}
                <Pressable
                  style={[styles.commandField, { borderTopWidth: 1, borderTopColor: colors.border }]}
                  onPress={() => setCategoryPickerOpen(true)}>
                  <Ionicons name="folder-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles.commandPickerText, { color: colors.text }]}>
                    {claimCategory
                      ? `${getCategoryIcon(claimCategory.slug)} ${claimCategory.name}`
                      : 'Select Category'}
                  </Text>
                  <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
                </Pressable>

                {/* Claim Rank Button */}
                <Pressable
                  style={[styles.claimSubmitBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handleClaimRank()}>
                  <Text style={styles.claimSubmitBtnText}>Claim Rank</Text>
                  <Ionicons name="flash" size={13} color="#ffffff" />
                </Pressable>

                {/* Gateway notice matching web */}
                <View style={styles.gatewayNoticeRow}>
                  <Ionicons name="information-circle-outline" size={11} color={colors.textMuted} />
                  <Text style={[styles.gatewayNoticeText, { color: colors.textMuted }]}>
                    Payment gateway under review. Simulated instant test payments enabled.
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* ═══════════════════════════════════════════════════════════
             CATEGORY FILTER RIBBON
             ═══════════════════════════════════════════════════════════ */}
        <CategoryPills
          categories={categories}
          selectedSlug={selectedSlug}
          onSelectCategory={(slug) => setSelectedSlug(slug)}
          timeMode={timeMode}
        />

        {/* ═══════════════════════════════════════════════════════════
             LEADERBOARD STAGE HEADER: Mode Switcher & Search
             ═══════════════════════════════════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════════
             LEADERBOARD CONTROLS: Compact Unified Mode & Search
             ═══════════════════════════════════════════════════════════ */}
        <View style={styles.stageHeader}>
          <View style={styles.stageTitleRow}>
            <Text style={[styles.stageTitleText, { color: colors.text }]}>
              {selectedSlug
                ? `${categories.find((c) => c.slug === selectedSlug)?.name ?? 'Category'} Rankings`
                : "Today's Live Rankings"}
            </Text>
            <View style={[styles.liveRankBeaconPill, { backgroundColor: colors.surfaceSubtle }]}>
              <View style={[styles.liveDotSmall, { backgroundColor: colors.success }]} />
              <Text style={[styles.liveRankBeaconText, { color: colors.text }]}>
                {onlineUsers} <Text style={{ color: colors.textMuted }}>online • Live</Text>
              </Text>
            </View>
          </View>

          <View style={styles.filterBar}>
            {/* Time switch pills */}
            <View style={[styles.timePillGroup, { backgroundColor: colors.surfaceSubtle }]}>
              <Pressable
                style={[
                  styles.timePillBtn,
                  timeMode === 'today' && [
                    styles.timePillBtnActive,
                    { backgroundColor: colors.surface },
                  ],
                ]}
                onPress={() => setTimeMode('today')}>
                <View
                  style={[
                    styles.pulseDot,
                    {
                      backgroundColor:
                        timeMode === 'today' ? colors.primary : colors.textMuted,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.timePillText,
                    { color: timeMode === 'today' ? colors.primary : colors.textMuted },
                  ]}>
                  Today
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.timePillBtn,
                  timeMode === 'alltime' && [
                    styles.timePillBtnActive,
                    { backgroundColor: colors.surface },
                  ],
                ]}
                onPress={() => setTimeMode('alltime')}>
                <Ionicons
                  name="medal"
                  size={11}
                  color={timeMode === 'alltime' ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.timePillText,
                    { color: timeMode === 'alltime' ? colors.primary : colors.textMuted },
                  ]}>
                  All-Time
                </Text>
              </Pressable>
            </View>

            {/* Search Box in same line */}
            <View
              style={[
                styles.searchBox,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
              <Ionicons name="search-outline" size={13} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search..."
                placeholderTextColor={colors.textFaint}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={13} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════
             FEED ROWS LIST: Rank #1 Gold, #2 Silver, #3 Bronze, #4+
             ═══════════════════════════════════════════════════════════ */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Syncing live rankings...
            </Text>
          </View>
        ) : visibleRows.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="rocket-outline" size={40} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Rank #1 is wide open — grab it for ₹10!
            </Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              Today's leaderboard is a blank slate. Be the first name everyone sees.
            </Text>
            <Pressable
              style={[styles.emptyClaimBtn, { backgroundColor: colors.primary }]}
              onPress={() => handleClaimRank(10, 1)}>
              <Text style={styles.emptyClaimBtnText}>Claim #1 for ₹10</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.feedList}>
            {visibleRows.map((row) => {
              const isGold = row.rank === 1;
              const isSilver = row.rank === 2;
              const isBronze = row.rank === 3;

              if (isGold) {
                return (
                  /* ── RANK #1: THE REIGNING GOLD CHAMPION CARD ── */
                  <Pressable
                    key={row.listingId}
                    style={[
                      styles.championCard,
                      {
                        backgroundColor: isDark ? '#1a140a' : '#fffbf0',
                        borderColor: isDark ? 'rgba(255, 185, 95, 0.45)' : 'rgba(224, 169, 38, 0.5)',
                      },
                    ]}
                    onPress={() => handleOpenUrlDirect(row.listingId, row.listingUrl)}>
                    {/* Gold Top Shimmer Bar */}
                    <View style={[styles.goldBar, { backgroundColor: colors.gold }]} />

                    <View style={styles.championBody}>
                      <View style={styles.championLeft}>
                        {/* Crown #1 badge */}
                        <View style={[styles.rank1Badge, { backgroundColor: colors.gold }]}>
                          <Ionicons name="trophy" size={13} color="#fff" />
                          <Text style={styles.rank1BadgeText}>#1</Text>
                        </View>

                        {/* Avatar */}
                        <View style={styles.avatarWrap}>
                          <ProductAvatar
                            name={row.siteName || row.listingName}
                            url={row.listingUrl}
                            logoUrl={row.logoUrl}
                            faviconUrl={row.faviconUrl}
                            size={34}
                            borderRadius={Radius.md}
                            fallbackBg={colors.goldBg}
                            fallbackTextColor={colors.gold}
                          />
                          <View style={styles.beaconDotWrap}>
                            <View
                              style={[styles.beaconDotSmall, { backgroundColor: colors.secondaryGreen }]}
                            />
                          </View>
                        </View>

                        {/* Payload Info */}
                        <View style={styles.payloadInfo}>
                          <View style={styles.payloadTitleRow}>
                            <Text numberOfLines={1} style={[styles.payloadTitle, { color: colors.text }]}>
                              {row.siteName || row.listingName}
                            </Text>
                            <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
                          </View>

                          {row.description ? (
                            <Text numberOfLines={2} style={[styles.payloadDesc, { color: colors.textMuted }]}>
                              {row.description}
                            </Text>
                          ) : null}

                          {/* Chips */}
                          <View style={styles.chipsRow}>
                            <View style={[styles.chip, { backgroundColor: colors.surfaceSubtle }]}>
                              <Text style={[styles.chipText, { color: colors.text }]}>
                                {getCategoryIcon(row.categorySlug)} {row.categoryName}
                              </Text>
                            </View>

                            <View style={[styles.chip, { backgroundColor: colors.surfaceSubtle }]}>
                              <Ionicons name="flame" size={10} color={colors.primary} />
                              <Text style={[styles.chipText, { color: colors.textMuted }]}>
                                {row.clickCount} clicks
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* Right: Active Bid & Outbid Button */}
                      <View style={styles.championRight}>
                        <View style={styles.priceStack}>
                          <Text style={[styles.priceLabel, { color: colors.textMuted }]}>
                            Active Bid
                          </Text>
                          <Text style={[styles.priceVal, { color: colors.primary }]}>
                            ₹{row.currentBidAmount.toFixed(0)}
                          </Text>
                        </View>

                        <Pressable
                          style={[styles.outbidBtn, { backgroundColor: colors.primary }]}
                          onPress={() =>
                            handleClaimRank(
                              row.currentBidAmount + 1,
                              1,
                              row.categorySlug,
                              row.categoryName,
                            )
                          }>
                          <Ionicons name="flash" size={13} color="#ffffff" />
                          <Text style={styles.outbidBtnText}>Claim</Text>
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                );
              }

              if (isSilver || isBronze) {
                return (
                  /* ── RANK #2 & #3 CONTENDER CARDS ── */
                  <Pressable
                    key={row.listingId}
                    style={[
                      styles.championCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: isSilver
                          ? isDark
                            ? '#334155'
                            : '#cbd5e1'
                          : isDark
                            ? '#451a03'
                            : '#fed7aa',
                      },
                    ]}
                    onPress={() => handleOpenUrlDirect(row.listingId, row.listingUrl)}>
                    <View style={styles.championBody}>
                      <View style={styles.championLeft}>
                        <View
                          style={[
                            styles.rankContenderBadge,
                            {
                              backgroundColor: isSilver ? colors.silverBg : colors.bronzeBg,
                            },
                          ]}>
                          <Text
                            style={[
                              styles.rankContenderText,
                              { color: isSilver ? colors.silver : colors.bronze },
                            ]}>
                            #{row.rank}
                          </Text>
                        </View>

                        <View style={styles.avatarWrap}>
                          <ProductAvatar
                            name={row.siteName || row.listingName}
                            url={row.listingUrl}
                            logoUrl={row.logoUrl}
                            faviconUrl={row.faviconUrl}
                            size={34}
                            borderRadius={Radius.md}
                            fallbackBg={isSilver ? colors.silverBg : colors.bronzeBg}
                            fallbackTextColor={isSilver ? colors.silver : colors.bronze}
                          />
                        </View>

                        <View style={styles.payloadInfo}>
                          <Text numberOfLines={1} style={[styles.payloadTitle, { color: colors.text }]}>
                            {row.siteName || row.listingName}
                          </Text>
                          {row.description ? (
                            <Text numberOfLines={1} style={[styles.payloadDesc, { color: colors.textMuted }]}>
                              {row.description}
                            </Text>
                          ) : null}
                          <View style={styles.chipsRow}>
                            <Text style={[styles.chipText, { color: colors.textMuted }]}>
                              {getCategoryIcon(row.categorySlug)} {row.categoryName} • {row.clickCount} clicks
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.championRight}>
                        <View style={styles.priceStack}>
                          <Text style={[styles.priceLabel, { color: colors.textMuted }]}>Bid</Text>
                          <Text style={[styles.priceVal, { color: colors.text }]}>
                            ₹{row.currentBidAmount.toFixed(0)}
                          </Text>
                        </View>

                        <Pressable
                          style={[styles.outbidBtnSec, { backgroundColor: colors.surfaceSubtle }]}
                          onPress={() =>
                            handleClaimRank(
                              row.currentBidAmount + 1,
                              row.rank,
                              row.categorySlug,
                              row.categoryName,
                            )
                          }>
                          <Text style={[styles.outbidBtnSecText, { color: colors.text }]}>
                            Outbid
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                );
              }

              /* ── RANK #4+: COMPACT ROW ── */
              return (
                <Pressable
                  key={row.listingId}
                  style={[
                    styles.compactCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => handleOpenUrlDirect(row.listingId, row.listingUrl)}>
                  <View style={styles.compactLeft}>
                    <View style={[styles.compactBadge, { backgroundColor: colors.surfaceSubtle }]}>
                      <Text style={[styles.compactBadgeText, { color: colors.textMuted }]}>
                        #{row.rank}
                      </Text>
                    </View>

                    <ProductAvatar
                      name={row.siteName || row.listingName}
                      url={row.listingUrl}
                      logoUrl={row.logoUrl}
                      faviconUrl={row.faviconUrl}
                      size={24}
                      borderRadius={Radius.sm}
                    />

                    <View style={styles.compactInfo}>
                      <Text numberOfLines={1} style={[styles.compactTitle, { color: colors.text }]}>
                        {row.siteName || row.listingName}
                      </Text>
                      <Text style={[styles.compactMeta, { color: colors.textMuted }]}>
                        {row.categoryName} • {row.clickCount} clicks
                      </Text>
                    </View>
                  </View>

                  <View style={styles.compactRight}>
                    <Text style={[styles.compactPrice, { color: colors.text }]}>
                      ₹{row.currentBidAmount.toFixed(0)}
                    </Text>
                    <Pressable
                      style={[styles.compactOutbidBtn, { backgroundColor: colors.surfaceSubtle }]}
                      onPress={() =>
                        handleClaimRank(
                          row.currentBidAmount + 1,
                          row.rank,
                          row.categorySlug,
                          row.categoryName,
                        )
                      }>
                      <Text style={[styles.compactOutbidText, { color: colors.primary }]}>
                        Claim
                      </Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* View next 10 / Show top 10 pagination */}
        {displayedRows.length > 10 && (
          <View style={styles.paginationWrap}>
            {visibleCount < displayedRows.length ? (
              <Pressable
                style={[styles.moreBtn, { backgroundColor: colors.surfaceSubtle }]}
                onPress={() => setVisibleCount((prev) => prev + 10)}>
                <Text style={[styles.moreBtnText, { color: colors.text }]}>
                  View next 10 products
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.text} />
              </Pressable>
            ) : (
              <Pressable
                style={[styles.moreBtn, { backgroundColor: colors.surfaceSubtle }]}
                onPress={() => setVisibleCount(10)}>
                <Text style={[styles.moreBtnText, { color: colors.text }]}>
                  Show top 10 products only
                </Text>
                <Ionicons name="chevron-up" size={16} color={colors.text} />
              </Pressable>
            )}
          </View>
        )}


        {/* Footer */}
        <AppFooter />
      </ScrollView>

      {/* Category Picker Modal */}
      <Modal
        visible={categoryPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCategoryPickerOpen(false)}>
        <View style={styles.catModalOverlay}>
          <View style={[styles.catModalCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.catModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.catModalTitle, { color: colors.text }]}>Select Category</Text>
              <Pressable
                style={styles.catModalClose}
                onPress={() => setCategoryPickerOpen(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <View style={[styles.catSearchWrap, { backgroundColor: colors.surfaceSubtle }]}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.catSearchInput, { color: colors.text }]}
                placeholder="Search categories..."
                placeholderTextColor={colors.textFaint}
                value={catSearch}
                onChangeText={setCatSearch}
              />
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              {filteredCategories.map((c) => (
                <Pressable
                  key={c.slug}
                  style={[
                    styles.catModalItem,
                    { borderBottomColor: colors.border },
                    claimCategory?.slug === c.slug && {
                      backgroundColor: colors.surfaceSubtle,
                    },
                  ]}
                  onPress={() => {
                    setClaimCategory(c);
                    setCategoryPickerOpen(false);
                  }}>
                  <Text style={{ fontSize: 20 }}>{getCategoryIcon(c.slug)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.catModalItemName, { color: colors.text }]}>{c.name}</Text>
                    <Text style={[styles.catModalItemSub, { color: colors.textMuted }]}>
                      Min bid: ₹{c.minStartingBid} • {c.listingCount} listings
                    </Text>
                  </View>
                  {claimCategory?.slug === c.slug && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  heroStation: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 4,
  },
  heroToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 28,
  },
  heroHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  claimIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimTitleWrap: {
    gap: 2,
    flex: 1,
  },
  claimTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  amountPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  amountPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  collapseChevronBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedHeroBody: {
    marginTop: 4,
    gap: 4,
  },
  heroExpandedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  stepperSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stepperLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  heroTopRow: {
    gap: Spacing.two,
  },
  headlineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  headlineText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  heroStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.pill,
    padding: 2,
    gap: 4,
  },
  stepperActionBtn: {
    width: 20,
    height: 20,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperActionText: {
    fontSize: 13,
    fontWeight: '800',
  },
  stepperDisplay: {
    fontSize: 12,
    fontWeight: '800',
    minWidth: 30,
    textAlign: 'center',
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
  },
  countdownLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  countdownTime: {
    fontSize: 10,
    fontWeight: '800',
  },
  countdownUtc: {
    fontSize: 9.5,
  },
  commandBar: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 5,
    gap: 4,
  },
  commandField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 6,
  },
  commandInput: {
    flex: 1,
    fontSize: 11.5,
    paddingVertical: 0,
  },
  commandPickerText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
  },
  claimSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 30,
    borderRadius: Radius.pill,
  },
  claimSubmitBtnText: {
    color: '#fff',
    fontSize: 11.5,
    fontWeight: '800',
  },
  gatewayNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  gatewayNoticeText: {
    fontSize: 9,
    flex: 1,
  },
  stageHeader: {
    marginVertical: 4,
    gap: 4,
  },
  stageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  stageTitleText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  liveRankBeaconPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  liveDotSmall: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  liveRankBeaconText: {
    fontSize: 10,
    fontWeight: '700',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timePillGroup: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 2,
    height: 30,
    alignItems: 'center',
  },
  timePillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 9,
    height: 26,
    borderRadius: Radius.pill,
  },
  timePillBtnActive: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  pulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  timePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  searchBox: {
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
    paddingHorizontal: Spacing.three,
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
  },
  championCard: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  goldBar: {
    height: 3,
    width: '100%',
  },
  championBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 8,
    gap: 6,
  },
  championLeft: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  rank1Badge: {
    width: 26,
    height: 26,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank1BadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  rankContenderBadge: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankContenderText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  avatarWrap: {
    position: 'relative',
    width: 34,
    height: 34,
  },
  avatarImg: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
  },
  avatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 15,
    fontWeight: '800',
  },
  beaconDotWrap: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#fff',
    borderRadius: Radius.pill,
    padding: 1.5,
  },
  beaconDotSmall: {
    width: 7,
    height: 7,
    borderRadius: Radius.pill,
  },
  payloadInfo: {
    flex: 1,
    gap: 3,
  },
  payloadTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  payloadTitle: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  payloadDesc: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  championRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  priceStack: {
    alignItems: 'flex-end',
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  priceVal: {
    fontSize: 13.5,
    fontWeight: '900',
  },
  outbidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  outbidBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  outbidBtnSec: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: Radius.pill,
  },
  outbidBtnSecText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  compactCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  compactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  compactBadge: {
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  compactInfo: {
    flex: 1,
    gap: 2,
  },
  compactTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  compactMeta: {
    fontSize: 10,
  },
  compactRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactPrice: {
    fontSize: 12,
    fontWeight: '800',
  },
  compactOutbidBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  compactOutbidText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  paginationWrap: {
    alignItems: 'center',
    marginVertical: 6,
  },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  moreBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  catModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  catModalCard: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.three,
    maxHeight: '75%',
  },
  catModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
  },
  catModalTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  catModalClose: {
    padding: 4,
  },
  catSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    height: 32,
    borderRadius: Radius.md,
    marginVertical: 6,
  },
  catSearchInput: {
    flex: 1,
    fontSize: 11.5,
  },
  catModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  catModalItemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  catModalItemSub: {
    fontSize: 10.5,
  },
});
