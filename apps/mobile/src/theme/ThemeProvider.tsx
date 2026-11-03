import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, PaperProvider, type MD3Theme } from 'react-native-paper';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, type Theme } from 'expo-router';
import { usePreferences } from '@/stores/preferences';
import { darkColors, elevation, fonts, lightColors, radii, spacing, typography, type ColorTokens } from './tokens';

export type AppTheme = {
  scheme: 'light' | 'dark';
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  elevation: (level?: 1 | 2) => ReturnType<typeof elevation>;
};

const ThemeContext = createContext<AppTheme | null>(null);

const buildTheme = (scheme: 'light' | 'dark'): AppTheme => ({
  scheme,
  colors: scheme === 'dark' ? darkColors : lightColors,
  spacing,
  radii,
  typography,
  elevation: (level = 1) => elevation(scheme, level),
});

const paperTheme = (theme: AppTheme): MD3Theme => {
  const base = theme.scheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
  const c = theme.colors;
  return {
    ...base,
    roundness: 3,
    colors: {
      ...base.colors,
      primary: c.primary,
      onPrimary: c.onPrimary,
      primaryContainer: c.primaryContainer,
      onPrimaryContainer: c.onPrimaryContainer,
      secondary: c.secondary,
      secondaryContainer: c.secondaryContainer,
      background: c.background,
      surface: c.surface,
      surfaceVariant: c.surfaceSecondary,
      onSurface: c.text,
      onSurfaceVariant: c.textSecondary,
      outline: c.border,
      outlineVariant: c.separator,
      error: c.danger,
      elevation: { ...base.colors.elevation, level3: c.surface },
    },
    fonts: {
      ...base.fonts,
      bodyLarge: { ...base.fonts.bodyLarge, fontFamily: fonts.regular },
      bodyMedium: { ...base.fonts.bodyMedium, fontFamily: fonts.regular },
      labelLarge: { ...base.fonts.labelLarge, fontFamily: fonts.semibold },
      titleLarge: { ...base.fonts.titleLarge, fontFamily: fonts.semibold },
      headlineSmall: { ...base.fonts.headlineSmall, fontFamily: fonts.semibold },
    },
  };
};

const navigationTheme = (theme: AppTheme): Theme => {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.separator,
      notification: theme.colors.expense,
    },
  };
};

export const AppThemeProvider = ({ children }: { children: ReactNode }) => {
  const system = useColorScheme();
  const preference = usePreferences((s) => s.theme);
  const scheme: 'light' | 'dark' = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(() => buildTheme(scheme), [scheme]);
  const paper = useMemo(() => paperTheme(value), [value]);
  const nav = useMemo(() => navigationTheme(value), [value]);

  return (
    <ThemeContext.Provider value={value}>
      <PaperProvider theme={paper}>
        <NavigationThemeProvider value={nav}>{children}</NavigationThemeProvider>
      </PaperProvider>
    </ThemeContext.Provider>
  );
};

export const useTheme = (): AppTheme => {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside AppThemeProvider');
  return theme;
};
