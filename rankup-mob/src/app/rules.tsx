import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppFooter } from '../components/AppFooter';
import { AppHeader } from '../components/AppHeader';
import { Radius, Spacing } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';

export default function RulesScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();

  const rules = [
    {
      num: '01',
      icon: 'trophy',
      title: 'Top Placement Takes Rank #1',
      desc: 'Rankings are calculated directly by your active sponsored placement amount within your chosen category. The highest placement sits at Rank #1, the second highest at Rank #2, and so on.',
      highlight:
        'Early-Bird Tiebreaker: If two products have the exact same placement amount, whichever placed its listing first keeps the higher rank.',
    },
    {
      num: '02',
      icon: 'cursor',
      title: 'Promote for #1 or Any Position',
      desc: 'You do not have to pay for Rank #1 right away. You can place any placement amount starting from as low as ₹1.00 to enter the leaderboard.',
      highlight:
        'To claim Rank #1: Your placement must beat the current leader by at least the category increment (e.g. +₹1). If the category is brand new, simply match the starting price.',
    },
    {
      num: '03',
      icon: 'refresh-circle',
      title: 'Rank Upgrades: Pay Only the Difference',
      desc: 'When raising your existing listing rank, 100% of your previous payment is automatically credited. You only pay the net difference!',
      highlight:
        'Example: If you previously paid ₹10 and want to raise your rank to ₹25, you only pay ₹15.',
    },
    {
      num: '04',
      icon: 'timer',
      title: 'Daily Reset at Midnight UTC',
      desc: 'Rankings reset every day at 00:00 UTC (Midnight). Today is the live daily sponsored leaderboard, while past leaders are archived forever in the All-Time Pantheon.',
      highlight:
        'Winners get inducted into the Hall of Fame with lifetime discovery exposure.',
    },
    {
      num: '05',
      icon: 'shield-checkmark',
      title: '100% Transparent Discovery',
      desc: 'Zero black-box algorithms. Every placement, transaction reference, and click count is open and verifiable by the community in real time.',
      highlight:
        'No hidden algorithmic penalties or pay-per-click traps.',
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

        {/* Hero Header */}
        <View style={styles.headerHero}>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="help-circle" size={12} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>Customer Guide</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.secondaryLight }]}>
              <Ionicons name="checkmark-circle" size={12} color={colors.secondaryGreen} />
              <Text style={[styles.badgeText, { color: colors.secondaryGreen }]}>100% Transparent</Text>
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>How Rankings &amp; Sponsored Placements Work</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            RankUp gives creators and founders a direct, transparent way to showcase their products.
            Learn how promotional placements rank your listing and how payments are credited.
          </Text>
        </View>

        {/* 3-Step Quick Start */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Getting Ranked in 3 Simple Steps
          </Text>

          <View style={styles.stepsRow}>
            <View style={styles.stepItem}>
              <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
                <Text style={styles.stepNumText}>1</Text>
              </View>
              <Text style={[styles.stepHeading, { color: colors.text }]}>Choose Category</Text>
              <Text style={[styles.stepDesc, { color: colors.textMuted }]}>
                Pick your niche and enter your website URL.
              </Text>
            </View>

            <View style={styles.stepItem}>
              <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
                <Text style={styles.stepNumText}>2</Text>
              </View>
              <Text style={[styles.stepHeading, { color: colors.text }]}>Set Your Amount</Text>
              <Text style={[styles.stepDesc, { color: colors.textMuted }]}>
                Promote to claim #1, or pick any position.
              </Text>
            </View>

            <View style={styles.stepItem}>
              <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
                <Text style={styles.stepNumText}>3</Text>
              </View>
              <Text style={[styles.stepHeading, { color: colors.text }]}>Instant Traffic</Text>
              <Text style={[styles.stepDesc, { color: colors.textMuted }]}>
                Live placement across the whole platform!
              </Text>
            </View>
          </View>
        </View>

        {/* Core Rules List */}
        <View style={styles.rulesList}>
          {rules.map((r) => (
            <View
              key={r.num}
              style={[styles.ruleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.ruleTop}>
                <Text style={[styles.ruleNum, { color: colors.primary }]}>{r.num}</Text>
                <Text style={[styles.ruleTitle, { color: colors.text }]}>{r.title}</Text>
              </View>
              <Text style={[styles.ruleDesc, { color: colors.textMuted }]}>{r.desc}</Text>

              <View style={[styles.ruleHighlight, { backgroundColor: colors.surfaceSubtle }]}>
                <Ionicons name="sparkles" size={14} color={colors.gold} />
                <Text style={[styles.ruleHighlightText, { color: colors.text }]}>
                  {r.highlight}
                </Text>
              </View>
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
    gap: Spacing.two,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
    marginVertical: Spacing.two,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  stepsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stepItem: {
    flex: 1,
    gap: 4,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepNumText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  stepHeading: {
    fontSize: 12,
    fontWeight: '700',
  },
  stepDesc: {
    fontSize: 10,
    lineHeight: 14,
  },
  rulesList: {
    gap: Spacing.two,
  },
  ruleCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  ruleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  ruleNum: {
    fontSize: 16,
    fontWeight: '900',
  },
  ruleTitle: {
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  ruleDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  ruleHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.two,
    borderRadius: Radius.md,
  },
  ruleHighlightText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
});
