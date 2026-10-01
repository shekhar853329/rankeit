import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Radius, Spacing } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';

export const AppFooter: React.FC = () => {
  const { colors } = useAppTheme();
  const router = useRouter();

  return (
    <View
      style={[
        styles.footer,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}>
      <View style={styles.brandRow}>
        <Text style={[styles.title, { color: colors.text }]}>RankUp</Text>
        <Text style={[styles.tagline, { color: colors.textMuted }]}>
          100% Transparent Real-Time Discovery Engine
        </Text>
      </View>

      <View style={styles.linksRow}>
        <Pressable onPress={() => router.push('/rules' as any)}>
          <Text style={[styles.linkText, { color: colors.textMuted }]}>Rules</Text>
        </Pressable>
        <Text style={{ color: colors.textMuted }}>•</Text>
        <Pressable onPress={() => router.push('/contact' as any)}>
          <Text style={[styles.linkText, { color: colors.textMuted }]}>Contact</Text>
        </Pressable>
        <Text style={{ color: colors.textMuted }}>•</Text>
        <Pressable onPress={() => router.push('/terms' as any)}>
          <Text style={[styles.linkText, { color: colors.textMuted }]}>Terms</Text>
        </Pressable>
        <Text style={{ color: colors.textMuted }}>•</Text>
        <Pressable onPress={() => router.push('/privacy' as any)}>
          <Text style={[styles.linkText, { color: colors.textMuted }]}>Privacy</Text>
        </Pressable>
      </View>

      <View style={styles.bottomRow}>
        <Text style={[styles.copyText, { color: colors.textFaint }]}>
          © 2026 RankUp. Built for creators &amp; indie founders.
        </Text>
        <View style={[styles.auditPill, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.auditText, { color: colors.textMuted }]}>Audit #AUDIT-1</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  footer: {
    padding: 10,
    borderTopWidth: 1,
    gap: 5,
    marginTop: 10,
  },
  brandRow: {
    alignItems: 'center',
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
  },
  tagline: {
    fontSize: 10,
    textAlign: 'center',
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: 2,
  },
  linkText: {
    fontSize: 11,
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  copyText: {
    fontSize: 9.5,
  },
  auditPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.sm,
  },
  auditText: {
    fontSize: 8.5,
    fontWeight: '700',
  },
});
