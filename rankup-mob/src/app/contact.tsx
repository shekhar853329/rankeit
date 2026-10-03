import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppFooter } from '../components/AppFooter';
import { AppHeader } from '../components/AppHeader';
import { Radius, Spacing } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';

export default function ContactScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();

  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [sent, setSent] = useState<boolean>(false);

  const creatorEmail = 'shekhar853329@gmail.com';

  const handleSend = () => {
    if (!name.trim() || !email.trim() || !message.trim()) {
      Alert.alert('Required Fields', 'Please enter your name, email, and message.');
      return;
    }
    // Launch mailto directly
    const subject = encodeURIComponent(`RankUp Inquiry from ${name}`);
    const body = encodeURIComponent(`${message}\n\nFrom: ${name} (${email})`);
    Linking.openURL(`mailto:${creatorEmail}?subject=${subject}&body=${body}`).catch(() => {
      setSent(true);
    });
    setSent(true);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Pressable style={styles.breadcrumb} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={16} color={colors.primary} />
          <Text style={[styles.breadcrumbText, { color: colors.primary }]}>Back</Text>
        </Pressable>

        {/* Header Hero */}
        <View style={styles.headerHero}>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="person" size={12} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>Creator Direct</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.surfaceSubtle }]}>
              <Ionicons name="time" size={12} color={colors.textMuted} />
              <Text style={[styles.badgeText, { color: colors.textMuted }]}>Est. Sept 2026</Text>
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Get in Touch &amp; About the Project
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Whether you have questions about your placements, need help with a listing, want to explore a
            partnership, or want to share feedback—reach out directly to the creator.
          </Text>
        </View>

        {/* Founder Card */}
        <View style={[styles.founderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.founderTop}>
            <View style={[styles.avatarBox, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="code-slash" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.founderName, { color: colors.text }]}>Shekhar</Text>
              <Text style={[styles.founderRole, { color: colors.primary }]}>
                Creator &amp; Solo Developer of RankUp
              </Text>
            </View>
          </View>

          <Text style={[styles.founderBio, { color: colors.textMuted }]}>
            I started building <Text style={{ fontWeight: '700', color: colors.text }}>RankUp</Text> on{' '}
            <Text style={{ fontWeight: '700', color: colors.text }}>September 22, 2026</Text> with a clear mission:
            to replace black-box advertising algorithms with a 100% transparent, real-time discovery engine.
            Founders, indie hackers, and creators shouldn't have to guess why their product isn't seen.
            On RankUp, rankings are open, predictable, and fair—you only pay the difference to upgrade, and early
            supporters always retain their tiebreaker advantage.
          </Text>

          {/* Quick Contact Chips */}
          <View style={styles.contactChips}>
            <Pressable
              style={[styles.contactChip, { backgroundColor: colors.surfaceSubtle }]}
              onPress={() => Linking.openURL(`mailto:${creatorEmail}`)}>
              <Ionicons name="mail" size={14} color={colors.primary} />
              <Text style={[styles.chipText, { color: colors.text }]}>{creatorEmail}</Text>
            </Pressable>

            <View style={[styles.contactChip, { backgroundColor: colors.surfaceSubtle }]}>
              <Ionicons name="location" size={14} color={colors.primary} />
              <Text style={[styles.chipText, { color: colors.text }]}>
                Bhagwanpur, District - Muzaffarpur, Bihar, PIN: 842001
              </Text>
            </View>

            <View style={[styles.contactChip, { backgroundColor: colors.surfaceSubtle }]}>
              <Ionicons name="rocket" size={14} color={colors.secondaryGreen} />
              <Text style={[styles.chipText, { color: colors.text }]}>
                RankUp Discovery Engine
              </Text>
            </View>
          </View>
        </View>

        {/* Direct Feedback Form */}
        <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.formTitle, { color: colors.text }]}>Send a Direct Message</Text>

          {sent ? (
            <View style={styles.sentWrap}>
              <Ionicons name="checkmark-circle" size={40} color={colors.secondaryGreen} />
              <Text style={[styles.sentTitle, { color: colors.text }]}>Thank You!</Text>
              <Text style={[styles.sentSub, { color: colors.textMuted }]}>
                Your message was sent to Shekhar ({creatorEmail}).
              </Text>
              <Pressable
                style={[styles.resetBtn, { backgroundColor: colors.surfaceSubtle }]}
                onPress={() => setSent(false)}>
                <Text style={[styles.resetBtnText, { color: colors.text }]}>Send Another</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.formFields}>
              <View style={styles.fieldWrap}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Your Name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceSubtle, color: colors.text, borderColor: colors.border }]}
                  placeholder="e.g. Alex Creator"
                  placeholderTextColor={colors.textFaint}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.fieldWrap}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Your Email</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceSubtle, color: colors.text, borderColor: colors.border }]}
                  placeholder="alex@example.com"
                  placeholderTextColor={colors.textFaint}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.fieldWrap}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Message or Feedback</Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: colors.surfaceSubtle, color: colors.text, borderColor: colors.border }]}
                  placeholder="Share your thoughts, feature requests, or questions..."
                  placeholderTextColor={colors.textFaint}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <Pressable
                style={[styles.sendBtn, { backgroundColor: colors.primary }]}
                onPress={handleSend}>
                <Text style={styles.sendBtnText}>Send Message to Shekhar</Text>
                <Ionicons name="send" size={14} color="#fff" />
              </Pressable>
            </View>
          )}
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
  founderCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
    marginVertical: Spacing.two,
  },
  founderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatarBox: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  founderName: {
    fontSize: 18,
    fontWeight: '800',
  },
  founderRole: {
    fontSize: 12,
    fontWeight: '700',
  },
  founderBio: {
    fontSize: 13,
    lineHeight: 19,
  },
  contactChips: {
    gap: Spacing.one,
  },
  contactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  formCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
    marginVertical: Spacing.two,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  formFields: {
    gap: Spacing.two,
  },
  fieldWrap: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    height: 44,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    fontSize: 13,
    borderWidth: 1,
  },
  textArea: {
    height: 100,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 13,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: Radius.pill,
    marginTop: 4,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  sentWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
    gap: Spacing.two,
  },
  sentTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  sentSub: {
    fontSize: 12,
    textAlign: 'center',
  },
  resetBtn: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    marginTop: Spacing.two,
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
