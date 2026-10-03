import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppFooter } from '../../components/AppFooter';
import { AppHeader } from '../../components/AppHeader';
import { ProductAvatar } from '../../components/ProductAvatar';
import { getCategoryIcon } from '../../constants/icons';
import { Radius, Spacing } from '../../constants/theme';
import { useClaimModal } from '../../context/ModalContext';
import { useSignalR } from '../../context/SignalRContext';
import { useAppTheme } from '../../context/ThemeContext';
import { ListingDetailDto } from '../../models';
import { getListingDetail, recordListingClick } from '../../services/api';
import { signalRService } from '../../services/signalr.service';

export default function ListingDetailScreen() {
  const { colors, isDark } = useAppTheme();
  const router = useRouter();
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { openClaimModal } = useClaimModal();
  const { clickCounts: liveClickCounts } = useSignalR();

  const [listing, setListing] = useState<ListingDetailDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);

  const numId = Number(listingId);

  const loadListing = async () => {
    if (!numId) return;
    setLoading(true);
    try {
      const res = await getListingDetail(numId);
      if (res) {
        setListing(res);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadListing();
  }, [numId]);

  useEffect(() => {
    if (listing?.categorySlug) {
      signalRService.joinCategoryGroup(listing.categorySlug);
      return () => {
        signalRService.leaveCategoryGroup(listing.categorySlug);
      };
    }
  }, [listing?.categorySlug]);

  const handleVisit = () => {
    if (!listing) return;
    recordListingClick(listing.listingId).catch(() => {});
    const target = listing.listingUrl.startsWith('http')
      ? listing.listingUrl
      : `https://${listing.listingUrl}`;
    Linking.openURL(target).catch(() => {});
  };

  const handleRaisePosition = () => {
    if (!listing) return;
    openClaimModal({
      rank: listing.currentRankInCategory,
      categoryName: listing.categoryName,
      categorySlug: listing.categorySlug,
      listingId: listing.listingId,
      listingName: listing.listingName,
      listingUrl: listing.listingUrl,
      currentBidAmount: listing.currentBidAmount,
      amount: listing.currentBidAmount + 1,
      onSuccess: () => loadListing(),
    });
  };

  const clicks = (listing && liveClickCounts[listing.listingId]) ?? listing?.clickCount ?? 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Breadcrumb Navigation */}
        <Pressable style={styles.breadcrumb} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={16} color={colors.primary} />
          <Text style={[styles.breadcrumbText, { color: colors.primary }]}>Back to Leaderboard</Text>
        </Pressable>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Loading listing details &amp; audit history...
            </Text>
          </View>
        ) : notFound || !listing ? (
          <View style={[styles.notFoundCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.warning} />
            <Text style={[styles.notFoundTitle, { color: colors.text }]}>Listing Not Found</Text>
            <Text style={[styles.notFoundSub, { color: colors.textMuted }]}>
              The product you requested does not exist or has expired.
            </Text>
          </View>
        ) : (
          <View style={styles.detailBody}>
            {/* Main Product Hero Card */}
            <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.heroTop}>
                <ProductAvatar
                  logoUrl={listing.logoUrl}
                  faviconUrl={listing.faviconUrl}
                  websiteUrl={listing.listingUrl}
                  name={listing.siteName || listing.listingName}
                  size={54}
                  borderRadius={Radius.md}
                />

                <View style={styles.heroMeta}>
                  <View style={styles.titleRow}>
                    <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
                      {listing.siteName || listing.listingName}
                    </Text>
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.domainText, { color: colors.textMuted }]}>
                    {listing.listingUrl}
                  </Text>
                  <View style={styles.categoryChipRow}>
                    <View style={[styles.categoryChip, { backgroundColor: colors.surfaceSubtle }]}>
                      <Text style={[styles.categoryChipText, { color: colors.text }]}>
                        {getCategoryIcon(listing.categorySlug)} {listing.categoryName}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {listing.description ? (
                <Text style={[styles.description, { color: colors.textMuted }]}>
                  {listing.description}
                </Text>
              ) : null}

              {/* Status & Stats Grid */}
              <View style={styles.statsGrid}>
                <View style={[styles.statBox, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>Rank</Text>
                  <Text style={[styles.statVal, { color: colors.text }]}>
                    #{listing.currentRankInCategory}
                  </Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>Active Placement</Text>
                  <Text style={[styles.statVal, { color: colors.primary }]}>
                    ₹{listing.currentBidAmount.toFixed(0)}
                  </Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>Clicks</Text>
                  <Text style={[styles.statVal, { color: colors.secondaryGreen }]}>
                    {clicks}
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionBtnRow}>
                <Pressable
                  style={[styles.visitBtn, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}
                  onPress={handleVisit}>
                  <Ionicons name="open-outline" size={13} color={colors.text} />
                  <Text style={[styles.visitBtnText, { color: colors.text }]}>Visit Link</Text>
                </Pressable>

                <Pressable
                  style={[styles.raiseBtn, { backgroundColor: colors.primary }]}
                  onPress={handleRaisePosition}>
                  <Ionicons name="flash" size={13} color="#fff" />
                  <Text style={styles.raiseBtnText}>Raise Position</Text>
                </Pressable>
              </View>
            </View>

            {/* Bids & Payments Audit Timeline */}
            <View style={[styles.timelineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.timelineHeader}>
                <Ionicons name="receipt-outline" size={18} color={colors.primary} />
                <Text style={[styles.timelineTitle, { color: colors.text }]}>
                  Placement &amp; Payment History
                </Text>
              </View>

              <View style={styles.timelineList}>
                {(listing.bids || []).map((bid, i) => (
                  <View
                    key={i}
                    style={[
                      styles.timelineItem,
                      {
                        borderBottomColor: colors.border,
                        borderBottomWidth: i === listing.bids.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      },
                    ]}>
                    <View style={styles.timelineLeft}>
                      <View style={[styles.timelineDot, { backgroundColor: colors.primary }]} />
                      <View>
                        <Text style={[styles.timelineItemAmount, { color: colors.text }]}>
                          Bid level ₹{bid.amount.toFixed(2)}
                        </Text>
                        <Text style={[styles.timelineItemDate, { color: colors.textMuted }]}>
                          {new Date(bid.createdAt).toLocaleString()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.timelineRight}>
                      <Text style={[styles.timelinePayment, { color: colors.primary }]}>
                        +₹{bid.paymentAmount.toFixed(2)} paid
                      </Text>
                      <Text style={[styles.timelineRef, { color: colors.textMuted }]}>
                        {bid.paymentReferenceMasked || 'Settled'}
                      </Text>
                    </View>
                  </View>
                ))}

                {(!listing.bids || listing.bids.length === 0) && (
                  <View style={styles.emptyTimeline}>
                    <Text style={[styles.emptyTimelineText, { color: colors.textMuted }]}>
                      Initial bid placed at listing creation.
                    </Text>
                  </View>
                )}
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
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.two,
  },
  breadcrumbText: {
    fontSize: 13,
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
  notFoundCard: {
    padding: Spacing.five,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.four,
  },
  notFoundTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  notFoundSub: {
    fontSize: 12,
    textAlign: 'center',
  },
  detailBody: {
    gap: Spacing.two,
  },
  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  logoImg: {
    width: 54,
    height: 54,
    borderRadius: Radius.md,
  },
  logoPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    fontSize: 24,
    fontWeight: '800',
  },
  heroMeta: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  domainText: {
    fontSize: 12,
  },
  categoryChipRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  categoryChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginVertical: Spacing.one,
  },
  statBox: {
    flex: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statVal: {
    fontSize: 14,
    fontWeight: '900',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  visitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 34,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  visitBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  raiseBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 34,
    borderRadius: Radius.pill,
  },
  raiseBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  timelineCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  timelineList: {
    gap: 2,
  },
  timelineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  timelineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
  },
  timelineItemAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  timelineItemDate: {
    fontSize: 11,
  },
  timelineRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  timelinePayment: {
    fontSize: 12,
    fontWeight: '800',
  },
  timelineRef: {
    fontSize: 10,
  },
  emptyTimeline: {
    paddingVertical: Spacing.two,
  },
  emptyTimelineText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
