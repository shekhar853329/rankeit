import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing } from '../constants/theme';
import { useSignalR } from '../context/SignalRContext';
import { useAppTheme } from '../context/ThemeContext';
import { getApiBaseUrl, getAutoDetectedHostIp, getHealth, setCustomApiBaseUrl } from '../services/api';

export default function ApiSettingsScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { refreshSignalR } = useSignalR();
  const insets = useSafeAreaInsets();

  const androidBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const topInset = Math.max(insets.top, androidBarHeight, 10);

  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [inputUrl, setInputUrl] = useState<string>('');
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    getApiBaseUrl().then((url) => {
      setCurrentUrl(url);
      setInputUrl(url);
    });
  }, []);

  const handleTest = async (testTarget?: string) => {
    const target = (testTarget ?? inputUrl).trim();
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(`${target}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        setTestResult({
          ok: true,
          message: `Connected successfully! Status: ${res.status}`,
        });
      } else {
        setTestResult({
          ok: false,
          message: `Server returned HTTP ${res.status}`,
        });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: `Could not reach ${target}. ${err.message || ''}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (urlToSave?: string) => {
    const finalUrl = (urlToSave ?? inputUrl).trim();
    await setCustomApiBaseUrl(finalUrl);
    setCurrentUrl(finalUrl);
    refreshSignalR();
    setTestResult({
      ok: true,
      message: 'Saved! Real-time hub and API client updated.',
    });
  };

  const detectedHost = getAutoDetectedHostIp();
  const presets = [
    { label: 'Wi-Fi PC (10.33.102.208)', url: 'http://10.33.102.208:5196' },
    ...(detectedHost && detectedHost !== '10.33.102.208'
      ? [{ label: `Detected Host (${detectedHost})`, url: `http://${detectedHost}:5196` }]
      : []),
    { label: 'Android Emulator', url: 'http://10.0.2.2:5196' },
    { label: 'Localhost (Web/iOS)', url: 'http://localhost:5196' },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            paddingTop: topInset + 8,
          },
        ]}>
        <View style={styles.headerLeft}>
          <Ionicons name="server" size={18} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>API Server Settings</Text>
        </View>

        <Pressable
          style={[styles.closeBtn, { backgroundColor: colors.surfaceSubtle }]}
          onPress={() => router.back()}>
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        {/* Active URL Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
            ACTIVE BACKEND BASE URL
          </Text>
          <Text style={[styles.activeUrl, { color: colors.primary }]}>{currentUrl}</Text>
          <Text style={[styles.cardHint, { color: colors.textMuted }]}>
            All live auction feeds, REST endpoints, and SignalR hubs connect to this address.
          </Text>
        </View>

        {/* Custom Input */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Configure Custom Endpoint</Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceSubtle,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="http://192.168.1.8:5196"
            placeholderTextColor={colors.textFaint}
            value={inputUrl}
            onChangeText={setInputUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Quick Presets */}
          <Text style={[styles.presetsLabel, { color: colors.textMuted }]}>QUICK PRESETS:</Text>
          <View style={styles.presetsRow}>
            {presets.map((p) => (
              <Pressable
                key={p.label}
                style={[styles.presetPill, { backgroundColor: colors.surfaceSubtle }]}
                onPress={() => {
                  setInputUrl(p.url);
                  handleSave(p.url);
                  handleTest(p.url);
                }}>
                <Text style={[styles.presetText, { color: colors.text }]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Test & Save buttons */}
          <View style={styles.btnRow}>
            <Pressable
              style={[styles.testBtn, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}
              disabled={testing}
              onPress={() => handleTest()}>
              {testing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="pulse" size={16} color={colors.text} />
                  <Text style={[styles.testBtnText, { color: colors.text }]}>Test Ping</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={() => handleSave()}>
              <Text style={styles.saveBtnText}>Save URL</Text>
            </Pressable>
          </View>

          {/* Test result message */}
          {testResult && (
            <View
              style={[
                styles.resultBox,
                {
                  backgroundColor: testResult.ok ? colors.secondaryLight : colors.surfaceSubtle,
                  borderColor: testResult.ok ? colors.secondaryGreen : colors.warning,
                },
              ]}>
              <Ionicons
                name={testResult.ok ? 'checkmark-circle' : 'alert-circle'}
                size={18}
                color={testResult.ok ? colors.secondaryGreen : colors.warning}
              />
              <Text
                style={[
                  styles.resultText,
                  { color: testResult.ok ? colors.secondaryGreen : colors.text },
                ]}>
                {testResult.message}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activeUrl: {
    fontSize: 16,
    fontWeight: '800',
  },
  cardHint: {
    fontSize: 12,
    lineHeight: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  input: {
    height: 44,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    fontSize: 13,
    borderWidth: 1,
  },
  presetsLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  presetText: {
    fontSize: 11,
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  testBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: Radius.pill,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  resultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: Spacing.two,
  },
  resultText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
});
