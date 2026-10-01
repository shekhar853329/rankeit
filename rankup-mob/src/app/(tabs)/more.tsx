import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { AppFooter } from '../../components/AppFooter';
import { AppHeader } from '../../components/AppHeader';
import { Radius, Spacing } from '../../constants/theme';
import { useAppTheme } from '../../context/ThemeContext';

export default function MoreScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();

  const menuSections = [
    {
      title: 'Guide & Transparency',
      items: [
        {
          title: 'How Rankings & Bidding Work',
          subtitle: '3-step guide, early-bird tiebreakers, payment credits',
          icon: 'help-circle-outline',
          route: '/rules',
        },
        {
          title: 'Direct Creator Contact',
          subtitle: 'Meet solo founder Shekhar, submit feedback & inquiries',
          icon: 'person-outline',
          route: '/contact',
        },
      ],
    },
    {
      title: 'Legal & Platform Terms',
      items: [
        {
          title: 'Terms of Service',
          subtitle: 'Transparent English auction & non-refundable ranking terms',
          icon: 'document-text-outline',
          route: '/terms',
        },
        {
          title: 'Privacy Policy',
          subtitle: 'Anonymous analytics, zero third-party selling',
          icon: 'shield-checkmark-outline',
          route: '/privacy',
        },
      ],
    },
    {
      title: 'Developer & Network Settings',
      items: [
        {
          title: 'API Server Endpoint',
          subtitle: 'Configure local backend IP (default: 192.168.1.8:5196)',
          icon: 'server-outline',
          route: '/api-settings',
        },
      ],
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Profile / Project Header Card */}
        <View style={[styles.brandCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.brandIconWrap}>
            <Svg width={40} height={40} viewBox="0 0 32 32">
              <Rect width={32} height={32} rx={9} fill={colors.primary} />
              <Path d="M16 7L24 20H8L16 7Z" fill="#FFFFFF" />
              <Rect x={10.5} y={22} width={11} height={2.5} rx={1} fill="#FFFFFF" fillOpacity={0.85} />
            </Svg>
          </View>
          <View style={styles.brandDetails}>
            <Text style={[styles.brandTitle, { color: colors.text }]}>RankUp Mobile</Text>
            <Text style={[styles.brandDesc, { color: colors.textMuted }]}>
              The transparent discovery &amp; real-time ranking engine for founders.
            </Text>
          </View>
        </View>


        {/* Menu Sections */}
        {menuSections.map((section) => (
          <View key={section.title} style={styles.sectionWrap}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              {section.title.toUpperCase()}
            </Text>

            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
              {section.items.map((item, idx) => (
                <Pressable
                  key={item.title}
                  style={[
                    styles.menuItem,
                    {
                      borderBottomColor: colors.border,
                      borderBottomWidth: idx === section.items.length - 1 ? 0 : StyleSheet.hairlineWidth,
                    },
                  ]}
                  onPress={() => router.push(item.route as any)}>
                  <View style={[styles.menuIconWrap, { backgroundColor: colors.surfaceSubtle }]}>
                    <Ionicons name={item.icon as any} size={18} color={colors.primary} />
                  </View>

                  <View style={styles.menuInfo}>
                    <Text style={[styles.menuTitle, { color: colors.text }]}>{item.title}</Text>
                    <Text style={[styles.menuSubtitle, { color: colors.textMuted }]}>
                      {item.subtitle}
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

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
  brandCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.two,
  },
  brandIconWrap: {
    width: 40,
    height: 40,
  },
  brandDetails: {
    flex: 1,
    gap: 2,
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  brandDesc: {
    fontSize: 12,
    lineHeight: 16,
  },

  sectionWrap: {
    marginTop: Spacing.three,
    gap: Spacing.one,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingHorizontal: 4,
  },
  sectionCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  menuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuInfo: {
    flex: 1,
    gap: 2,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  menuSubtitle: {
    fontSize: 11,
  },
});
