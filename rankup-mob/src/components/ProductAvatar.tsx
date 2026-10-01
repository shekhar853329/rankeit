import { Image } from 'expo-image';
import React, { useState } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Radius } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';

export interface ProductAvatarProps {
  name: string;
  url?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  size?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  fallbackBg?: string;
  fallbackTextColor?: string;
}

/**
 * Extracts a valid domain hostname and generates Google's high-res favicon URL.
 */
export function getGoogleFaviconUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  try {
    let clean = rawUrl.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const host = new URL(clean).hostname;
    if (host && host.includes('.')) {
      return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
    }
  } catch {
    // Ignore URL parse error
  }
  return null;
}

/**
 * Robust Product Avatar component that supports SVGs, PNGs, WebP,
 * automatic Google Favicon domain resolution, and letter badges on error.
 */
export const ProductAvatar: React.FC<ProductAvatarProps> = ({
  name,
  url,
  websiteUrl,
  logoUrl,
  faviconUrl,
  size = 34,
  borderRadius = Radius.md,
  style,
  fallbackBg,
  fallbackTextColor,
}) => {
  const { colors } = useAppTheme();
  const [hasFailedPrimary, setHasFailedPrimary] = useState(false);
  const [hasFailedSecondary, setHasFailedSecondary] = useState(false);

  const googleFavicon = getGoogleFaviconUrl(url || websiteUrl);

  // Resolution hierarchy:
  // 1. logoUrl (if available and hasn't failed)
  // 2. faviconUrl (if available and hasn't failed)
  // 3. googleFavicon (derived from website hostname)
  // 4. Fallback letter badge
  let activeUri: string | null = null;

  if (!hasFailedPrimary && (logoUrl || faviconUrl)) {
    activeUri = logoUrl || faviconUrl || null;
  } else if (!hasFailedSecondary && googleFavicon) {
    activeUri = googleFavicon;
  }

  const handleImageError = () => {
    if (!hasFailedPrimary) {
      setHasFailedPrimary(true);
    } else {
      setHasFailedSecondary(true);
    }
  };

  const initialLetter = (name || '?').trim().charAt(0).toUpperCase();

  const containerStyle = [
    styles.container,
    {
      width: size,
      height: size,
      borderRadius,
      backgroundColor: colors.surfaceSubtle,
    },
    style,
  ];

  if (activeUri) {
    return (
      <View style={containerStyle}>
        <Image
          source={{ uri: activeUri }}
          style={{ width: size, height: size, borderRadius }}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          onError={handleImageError}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        containerStyle,
        {
          backgroundColor: fallbackBg || `${colors.primary}18`,
        },
      ]}>
      <Text
        style={[
          styles.letter,
          {
            fontSize: Math.round(size * 0.44),
            color: fallbackTextColor || colors.primary,
          },
        ]}>
        {initialLetter}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  letter: {
    fontWeight: '800',
  },
});
