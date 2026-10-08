import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Radius, Spacing } from '../constants/theme';
import { ProductAvatar } from './ProductAvatar';
import { useClaimModal } from '../context/ModalContext';
import { useAppTheme } from '../context/ThemeContext';
import { GlobalLeaderboardEntryDto } from '../models';

interface ReigningSpotlightCardProps {
  champion: GlobalLeaderboardEntryDto | null;
  onClaim?: () => void;
}

export const ReigningSpotlightCard: React.FC<ReigningSpotlightCardProps> = ({ champion, onClaim }) => {
  const { colors, isDark } = useAppTheme();
  const { openClaimModal } = useClaimModal();
  const router = useRouter();

  const handleClaim = () => {
    if (onClaim) {
      onClaim();
      return;
    }
    const currentClaim = champion?.currentClaimAmount ?? 10;
    openClaimModal({
      rank: 1,
      categoryName: champion?.categoryName ?? 'General',
      categorySlug: champion?.categorySlug ?? 'general',
      categoryId: champion?.categoryId ?? 1,
      amount: currentClaim + 1,
    });
  };

  const handleOpenDetail = () => {
    if (champion?.listingId) {
      router.push(`/listing/${champion.listingId}` as any);
    }
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? '#141824' : '#fff9f0',
          borderColor: isDark ? 'rgba(255, 185, 95, 0.3)' : 'rgba(224, 169, 38, 0.35)',
        },
      ]}>
      {/* Top Badge */}
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: colors.goldBg }]}>
          <Ionicons name="trophy" size={13} color={colors.gold} />
          <Text style={[styles.badgeText, { color: colors.gold }]}>Global Crown Holder</Text>
        </View>

        <View style={[styles.trophyDisc, { backgroundColor: colors.goldBg }]}>
          <Ionicons name="ribbon" size={16} color={colors.gold} />
        </View>
      </View>

      {/* Champion Info */}
      <Pressable style={styles.heroRow} onPress={handleOpenDetail}>
        <View style={[styles.avatarRing, { borderColor: colors.gold }]}>
          <ProductAvatar
            name={champion?.siteName || champion?.listingName || ''}
            url={champion?.listingUrl}
            logoUrl={champion?.logoUrl}
            faviconUrl={champion?.faviconUrl}
            size={38}
            borderRadius={Radius.pill}
            fallbackBg={colors.goldBg}
            fallbackTextColor={colors.gold}
          />
          <View style={[styles.crownIconWrap, { backgroundColor: colors.gold }]}>
            <Ionicons name="sparkles" size={9} color="#fff" />
          </View>
        </View>

        <View style={styles.meta}>
          <Text numberOfLines={1} style={[styles.champName, { color: colors.text }]}>
            {champion?.siteName || champion?.listingName || 'No Leader Yet'}
          </Text>
          <Text style={[styles.categoryHolding, { color: colors.textMuted }]}>
            Holding:{' '}
            <Text style={{ fontWeight: '700', color: colors.text }}>
              {champion?.categoryName || 'Global #1'}
            </Text>
          </Text>
        </View>
      </Pressable>

      {/* Defense Grid */}
      <View style={styles.defenseGrid}>
        <View style={[styles.defenseBox, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.defenseVal, { color: colors.text }]}>
            {champion?.claimCount ?? 1} {(champion?.claimCount ?? 1) === 1 ? 'Time' : 'Times'}
          </Text>
          <Text style={[styles.defenseLabel, { color: colors.textMuted }]}>Defended Today</Text>
        </View>

        <View style={[styles.defenseBox, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.defenseVal, { color: colors.primary }]}>
            ${(champion?.currentClaimAmount ?? 0).toFixed(0)}
          </Text>
          <Text style={[styles.defenseLabel, { color: colors.textMuted }]}>Capital Spent</Text>
        </View>
      </View>

      {/* Claim CTA */}
      <Pressable
        style={[styles.claimThroneBtn, { backgroundColor: colors.primary }]}
        onPress={handleClaim}>
        <Ionicons name="flash" size={15} color="#fff" />
        <Text style={styles.claimThroneBtnText}>Claim This Position</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    padding: Spacing.three,
    marginVertical: Spacing.two,
    gap: Spacing.two,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  trophyDisc: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: 4,
  },
  avatarRing: {
    width: 50,
    height: 50,
    borderRadius: Radius.pill,
    borderWidth: 2,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 20,
    fontWeight: '800',
  },
  crownIconWrap: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  champName: {
    fontSize: 16,
    fontWeight: '800',
  },
  categoryHolding: {
    fontSize: 12,
  },
  defenseGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  defenseBox: {
    flex: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    alignItems: 'center',
    gap: 2,
  },
  defenseVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  defenseLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  claimThroneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: Radius.pill,
    marginTop: 4,
  },
  claimThroneBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});
