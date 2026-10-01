import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppFooter } from '../../components/AppFooter';
import { AppHeader } from '../../components/AppHeader';
import { getCategoryIcon } from '../../constants/icons';
import { Radius, Spacing } from '../../constants/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { CategoryDto, CategorySortBy, LeaderboardEntryDto } from '../../models';
import { getCategories, getCategoryLeaderboard } from '../../services/api';

interface CategoryCardItem {
  category: CategoryDto;
  topEntries: LeaderboardEntryDto[];
}

export default function CategoriesScreen() {
  const { colors, isDark } = useAppTheme();
  const router = useRouter();

  const [categories, setCategories] = useState<CategoryCardItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<CategorySortBy>('Trending');
  const [search, setSearch] = useState<string>('');

  const loadCategories = async () => {
    try {
      const res = await getCategories({ sortBy, pageSize: 30 });
      if (res && res.items) {
        // Fetch top entries preview for the top categories
        const withEntries: CategoryCardItem[] = await Promise.all(
          res.items.map(async (cat) => {
            try {
              const lead = await getCategoryLeaderboard(cat.slug, 1, 3, 'today');
              return {
                category: cat,
                topEntries: lead?.leaderboard?.items || [],
              };
            } catch {
              return {
                category: cat,
                topEntries: [],
              };
            }
          }),
        );
        setCategories(withEntries);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, [sortBy]);

  const onRefresh = () => {
    setRefreshing(true);
    loadCategories();
  };

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase().trim();
    return categories.filter(
      (c) =>
        c.category.name.toLowerCase().includes(q) ||
        c.category.slug.toLowerCase().includes(q),
    );
  }, [categories, search]);

  const handleOpenCategory = (slug: string) => {
    router.push(`/leaderboard/${slug}` as any);
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
        {/* Header Hero */}
        <View style={styles.headerHero}>
          <Text style={[styles.title, { color: colors.text }]}>Category Directory</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Browse ranked products by niche, ecosystem, and domain
          </Text>

          {/* Search Box */}
          <View
            style={[
              styles.searchBox,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search category (e.g. AI, SaaS, Developer)..."
              placeholderTextColor={colors.textFaint}
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* Sort By Pills */}
          <View style={styles.sortRow}>
            <Text style={[styles.sortLabel, { color: colors.textMuted }]}>Sort by:</Text>
            {(['Trending', 'Newest', 'Alphabetical'] as CategorySortBy[]).map((mode) => (
              <Pressable
                key={mode}
                style={[
                  styles.sortPill,
                  {
                    backgroundColor: sortBy === mode ? colors.primary : colors.surfaceSubtle,
                  },
                ]}
                onPress={() => setSortBy(mode)}>
                <Text
                  style={[
                    styles.sortPillText,
                    { color: sortBy === mode ? '#ffffff' : colors.text },
                  ]}>
                  {mode}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Categories List */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Loading category hierarchy...
            </Text>
          </View>
        ) : filteredCategories.length === 0 ? (
          <View style={[styles.emptyWrap, { backgroundColor: colors.surface }]}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No categories found matching "{search}".
            </Text>
          </View>
        ) : (
          <View style={styles.cardList}>
            {filteredCategories.map(({ category, topEntries }) => {
              const icon = getCategoryIcon(category.slug);

              return (
                <Pressable
                  key={category.slug}
                  style={[
                    styles.categoryCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => handleOpenCategory(category.slug)}>
                  {/* Top card row */}
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardTitleWrap}>
                      <View style={[styles.iconDisc, { backgroundColor: colors.surfaceSubtle }]}>
                        <Text style={{ fontSize: 24 }}>{icon}</Text>
                      </View>
                      <View>
                        <Text style={[styles.categoryName, { color: colors.text }]}>
                          {category.name}
                        </Text>
                        <Text style={[styles.categoryMeta, { color: colors.textMuted }]}>
                          {category.listingCount} total listings • {category.todayListingCount ?? 0} today
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.openBtn, { backgroundColor: colors.surfaceSubtle }]}>
                      <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                    </View>
                  </View>

                  {/* Top 3 items preview */}
                  {topEntries.length > 0 ? (
                    <View style={[styles.previewWrap, { backgroundColor: colors.surfaceSubtle }]}>
                      <Text style={[styles.previewTitle, { color: colors.textMuted }]}>
                        TODAY'S LEADERS:
                      </Text>
                      {topEntries.slice(0, 3).map((entry, idx) => (
                        <View key={entry.listingId} style={styles.previewRow}>
                          <Text
                            style={[
                              styles.previewRank,
                              {
                                color:
                                  idx === 0
                                    ? colors.gold
                                    : idx === 1
                                      ? colors.silver
                                      : colors.bronze,
                              },
                            ]}>
                            #{idx + 1}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[styles.previewName, { color: colors.text }]}>
                            {entry.siteName || entry.listingName}
                          </Text>
                          <Text style={[styles.previewBid, { color: colors.primary }]}>
                            ₹{entry.currentBidAmount.toFixed(0)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={[styles.emptyPreview, { backgroundColor: colors.surfaceSubtle }]}>
                      <Text style={[styles.emptyPreviewText, { color: colors.textMuted }]}>
                        Rank #1 open! Start this category at ₹{category.minStartingBid}
                      </Text>
                    </View>
                  )}
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
  headerHero: {
    marginVertical: Spacing.two,
    gap: Spacing.two,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.three,
    height: 42,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: 4,
  },
  sortLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  sortPillText: {
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
  emptyWrap: {
    padding: Spacing.four,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  emptyText: {
    fontSize: 13,
  },
  cardList: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  categoryCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 9,
    gap: 5,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  iconDisc: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  categoryMeta: {
    fontSize: 10.5,
    marginTop: 2,
  },
  openBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewWrap: {
    padding: Spacing.two,
    borderRadius: Radius.md,
    gap: 4,
  },
  previewTitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  previewRank: {
    fontSize: 11,
    fontWeight: '800',
    width: 20,
  },
  previewName: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  previewBid: {
    fontSize: 12,
    fontWeight: '800',
  },
  emptyPreview: {
    padding: Spacing.two,
    borderRadius: Radius.md,
  },
  emptyPreviewText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
});
