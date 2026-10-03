import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppFooter } from '../components/AppFooter';
import { AppHeader } from '../components/AppHeader';
import { Radius, Spacing } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';

export default function TermsScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();

  const sections = [
    {
      title: '1. What the Service Is',
      content:
        'RankUp is a transparent, real-time product discovery and digital advertising platform (MCC 7311 - Advertising Services). Rankings are determined directly by active sponsored placement amounts chosen by listing creators. RankUp provides promotional visibility and is not an auction house; no consumer goods or commodities are auctioned.',
    },
    {
      title: '2. Eligibility & Requirements',
      content:
        'You must be at least 18 years old or the age of legal majority in your jurisdiction. By submitting a product link, you represent that you are authorized to promote that product.',
    },
    {
      title: '3. Payments, Credits & Non-Refundability',
      content:
        'All sponsored placements are processed in real-time. Upgrades on active listings automatically credit 100% of previous payments made toward that listing in the same category. Due to the immediate real-time delivery of digital discovery impressions and permanent induction into the historical directory, all completed payments are final and non-refundable.',
    },
    {
      title: '4. Prohibited Content',
      content:
        'Listings containing malware, phishing, deceptive schemes, hate speech, illegal products, or violating intellectual property rights will be immediately removed with zero refund.',
    },
    {
      title: '5. Limitation of Liability',
      content:
        'RankUp is provided "as is". While we guarantee that rankings adhere strictly to our open rules and transparent algorithms, we make no guarantee of specific sales, revenue, or click-through conversion rates for any individual listing.',
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Pressable style={styles.breadcrumb} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={16} color={colors.primary} />
          <Text style={[styles.breadcrumbText, { color: colors.primary }]}>Back</Text>
        </Pressable>

        <View style={styles.headerHero}>
          <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="document-text" size={12} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.primary }]}>Legal Agreement</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Terms of Service</Text>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>
            Effective September 28, 2026 • Last updated September 28, 2026
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            These Terms govern your access to and use of RankUp, including the public leaderboard,
            category pages, checkout, and related discovery features.
          </Text>
        </View>

        <View style={styles.sectionsList}>
          {sections.map((sec) => (
            <View
              key={sec.title}
              style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{sec.title}</Text>
              <Text style={[styles.sectionContent, { color: colors.textMuted }]}>
                {sec.content}
              </Text>
            </View>
          ))}
        </View>

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
  headerHero: {
    marginVertical: Spacing.two,
    gap: Spacing.one,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  metaText: {
    fontSize: 12,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  sectionsList: {
    gap: Spacing.two,
    marginVertical: Spacing.two,
  },
  sectionCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  sectionContent: {
    fontSize: 13,
    lineHeight: 19,
  },
});
