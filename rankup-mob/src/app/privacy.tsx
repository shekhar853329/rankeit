import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppFooter } from '../components/AppFooter';
import { AppHeader } from '../components/AppHeader';
import { Radius, Spacing } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';

export default function PrivacyScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();

  const sections = [
    {
      title: '1. Who Is Responsible',
      content:
        'The controller for personal data processed through RankUp is Shekhar, a solo indie developer based in India (contact: shekhar853329@gmail.com).',
    },
    {
      title: '2. What We Collect',
      content:
        'We collect listing details (website URLs, product names, descriptions), owner contact emails for verification, and anonymized telemetry (page visits, click-through counts, device categories). We do not store sensitive payment credentials on our servers.',
    },
    {
      title: '3. Why We Use This Data',
      content:
        'Data is used to operate the live ascending auction, credit previous payments to returning founders, display public rankings, and verify audit records.',
    },
    {
      title: '4. Zero Third-Party Selling',
      content:
        'We do not sell, rent, or trade your personal information or contact details to third-party ad networks or data brokers.',
    },
    {
      title: '5. Your Rights',
      content:
        'You have the right to request deletion or modification of your listing data at any time by contacting shekhar853329@gmail.com.',
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
          <View style={[styles.badge, { backgroundColor: colors.secondaryLight }]}>
            <Ionicons name="shield-checkmark" size={12} color={colors.secondaryGreen} />
            <Text style={[styles.badgeText, { color: colors.secondaryGreen }]}>Data Protection</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Privacy Policy</Text>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>
            Effective September 28, 2026 • Last updated September 28, 2026
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            This Privacy Policy explains how RankUp collects, uses, and protects information when you
            visit, click a listing, or submit a bid.
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
