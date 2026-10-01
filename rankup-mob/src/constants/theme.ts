import { Platform } from 'react-native';

export interface AppColors {
  primary: string;
  primaryHover: string;
  primaryContainer: string;
  primaryFixed: string;
  primaryLight: string;

  secondary: string;
  secondaryGreen: string;
  secondaryLight: string;

  tertiary: string;
  tertiarySoft: string;

  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSubtle: string;
  surfaceContainer: string;
  surfaceHighlight: string;

  border: string;
  borderStrong: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  textInverse: string;

  gold: string;
  goldGlow: string;
  goldBg: string;
  silver: string;
  silverBg: string;
  bronze: string;
  bronzeBg: string;

  success: string;
  warning: string;
  error: string;

  backgroundElement: string;
  backgroundSelected: string;
}

export const Colors: { light: AppColors; dark: AppColors } = {
  light: {
    primary: '#d93c1d',
    primaryHover: '#b82b10',
    primaryContainer: '#c23316',
    primaryFixed: '#ffdad3',
    primaryLight: '#fff1ee',

    secondary: '#006c49',
    secondaryGreen: '#10b981',
    secondaryLight: '#e6f7ef',

    tertiary: '#e0a926',
    tertiarySoft: '#fff4d1',

    background: '#f6f9ff',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    surfaceSubtle: '#edf4fd',
    surfaceContainer: '#e8eff7',
    surfaceHighlight: '#f1f5f9',

    border: 'rgba(30, 37, 43, 0.08)',
    borderStrong: 'rgba(30, 37, 43, 0.16)',

    text: '#151c22',
    textSecondary: '#5b403b',
    textMuted: '#5b403b',
    textFaint: '#8f706a',
    textInverse: '#ffffff',

    gold: '#e0a926',
    goldGlow: 'rgba(224, 169, 38, 0.18)',
    goldBg: '#fff9e6',
    silver: '#94a3b8',
    silverBg: '#f1f5f9',
    bronze: '#ea580c',
    bronzeBg: '#ffedd5',

    success: '#10b981',
    warning: '#f59e0b',
    error: '#ba1a1a',

    backgroundElement: '#edf4fd',
    backgroundSelected: '#dce3eb',
  },
  dark: {
    primary: '#ff5a36',
    primaryHover: '#ff7455',
    primaryContainer: '#fc593a',
    primaryFixed: '#ffdad3',
    primaryLight: 'rgba(255, 90, 54, 0.12)',

    secondary: '#4edea3',
    secondaryGreen: '#10b981',
    secondaryLight: 'rgba(16, 185, 129, 0.12)',

    tertiary: '#ffb95f',
    tertiarySoft: 'rgba(255, 185, 95, 0.15)',

    background: '#0a0e17',
    surface: '#0f131c',
    surfaceRaised: '#151922',
    surfaceSubtle: '#080b12',
    surfaceContainer: '#1b1f29',
    surfaceHighlight: '#262a33',

    border: '#262a33',
    borderStrong: '#3f4450',

    text: '#dfe2ee',
    textSecondary: '#949db2',
    textMuted: '#949db2',
    textFaint: '#8990a2',
    textInverse: '#0a0e17',

    gold: '#ffb95f',
    goldGlow: 'rgba(255, 185, 95, 0.25)',
    goldBg: 'rgba(255, 185, 95, 0.12)',
    silver: '#94a3b8',
    silverBg: 'rgba(148, 163, 184, 0.12)',
    bronze: '#fdba74',
    bronzeBg: 'rgba(253, 186, 116, 0.12)',

    success: '#4edea3',
    warning: '#f59e0b',
    error: '#f87171',

    backgroundElement: '#1b1f29',
    backgroundSelected: '#262a33',
  },
};

export type ThemeType = 'light' | 'dark';
export type ThemeColor = keyof AppColors;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 48,
  seven: 64,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 9999,
} as const;

export const MaxContentWidth = 800;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display, system-ui)',
    serif: 'var(--font-serif, serif)',
    rounded: 'var(--font-rounded, sans-serif)',
    mono: 'var(--font-mono, monospace)',
  },
});
