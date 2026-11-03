import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Design tokens. Colours are semantic (what they mean) rather than literal
 * (what they look like) so light and dark themes stay consistent.
 */
export type ColorTokens = {
  background: string;
  surface: string;
  surfaceSecondary: string;
  surfacePressed: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  secondaryContainer: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  separator: string;
  income: string;
  incomeContainer: string;
  expense: string;
  expenseContainer: string;
  investment: string;
  investmentContainer: string;
  warning: string;
  warningContainer: string;
  danger: string;
  overlay: string;
  skeleton: string;
  tabBar: string;
};

export const lightColors: ColorTokens = {
  background: '#F2F3F7',
  surface: '#FFFFFF',
  surfaceSecondary: '#F6F7FA',
  surfacePressed: '#ECEEF4',
  primary: '#27306B',
  onPrimary: '#FFFFFF',
  primaryContainer: '#E7E9F8',
  onPrimaryContainer: '#1B2152',
  secondary: '#4D7FE6',
  secondaryContainer: '#E6EEFD',
  text: '#11131A',
  textSecondary: '#5B5F70',
  textTertiary: '#8B8FA0',
  border: '#E1E3EA',
  separator: '#ECEEF3',
  income: '#1A8A4C',
  incomeContainer: '#E3F4EA',
  expense: '#C2443D',
  expenseContainer: '#FBE8E7',
  investment: '#2E69D3',
  investmentContainer: '#E5EEFC',
  warning: '#B97A0B',
  warningContainer: '#FCF1DA',
  danger: '#C2443D',
  overlay: 'rgba(10, 12, 24, 0.35)',
  skeleton: '#E7E9EF',
  tabBar: 'rgba(255, 255, 255, 0.96)',
};

export const darkColors: ColorTokens = {
  background: '#0B0D14',
  surface: '#161923',
  surfaceSecondary: '#1D212D',
  surfacePressed: '#242938',
  primary: '#A8B1F4',
  onPrimary: '#0E1230',
  primaryContainer: '#262C55',
  onPrimaryContainer: '#DDE1FF',
  secondary: '#7FA6F5',
  secondaryContainer: '#1D2B49',
  text: '#F2F3F7',
  textSecondary: '#A6AABA',
  textTertiary: '#71768A',
  border: '#272B39',
  separator: '#222633',
  income: '#4CC38A',
  incomeContainer: '#163325',
  expense: '#F0857D',
  expenseContainer: '#3A1C1B',
  investment: '#78A6FF',
  investmentContainer: '#1A2A48',
  warning: '#F1B94E',
  warningContainer: '#3A2D12',
  danger: '#F0857D',
  overlay: 'rgba(0, 0, 0, 0.55)',
  skeleton: '#232736',
  tabBar: 'rgba(22, 25, 35, 0.96)',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export type TypographyVariant =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption'
  | 'amountXL'
  | 'amountL';

export const typography: Record<TypographyVariant, TextStyle> = {
  largeTitle: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  title1: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  title2: { fontFamily: fonts.semibold, fontSize: 21, lineHeight: 27, letterSpacing: -0.3 },
  title3: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  headline: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  callout: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 20 },
  subhead: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  footnote: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
  amountXL: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 40, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  amountL: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
};

export const elevation = (scheme: 'light' | 'dark', level: 1 | 2 = 1): ViewStyle => {
  if (scheme === 'dark') return {};
  if (Platform.OS === 'android') return { elevation: level };
  if (Platform.OS === 'web') return { boxShadow: level === 1 ? '0 2px 10px rgba(16,22,47,0.06)' : '0 6px 20px rgba(16,22,47,0.10)' } as ViewStyle;
  return {
    shadowColor: '#10162F',
    shadowOpacity: level === 1 ? 0.06 : 0.1,
    shadowRadius: level === 1 ? 10 : 18,
    shadowOffset: { width: 0, height: level === 1 ? 2 : 6 },
  };
};

/** Palette for members (avatars, member charts). */
export const MEMBER_COLORS = ['#4F5BD5', '#D9547A', '#1A9E8F', '#E8833A', '#8E5BD9', '#2D9CDB', '#B5892E', '#5A7D3A'];

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
