import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * App configuration. Values that differ per environment come from
 * EXPO_PUBLIC_* variables (see .env.example) or EAS build profiles.
 */
const IS_DEV = process.env.APP_VARIANT === 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'Family Finance (Dev)' : 'Family Finance',
  slug: 'family-finance',
  scheme: 'familyfinance',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: IS_DEV ? 'com.familyfinance.app.dev' : 'com.familyfinance.app',
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: IS_DEV ? 'com.familyfinance.app.dev' : 'com.familyfinance.app',
    adaptiveIcon: {
      backgroundColor: '#262F6E',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Financial data must not end up in Android cloud backups.
    allowBackup: false,
    intentFilters: [
      {
        action: 'VIEW',
        data: [{ scheme: 'familyfinance', host: 'invite' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    favicon: './assets/favicon.png',
    output: 'single',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    'expo-font',
    'expo-web-browser',
    '@react-native-community/datetimepicker',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: '#F2F3F7',
        dark: { backgroundColor: '#0B0D14' },
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Family Finance to attach receipt photos to transactions.',
        cameraPermission: 'Allow Family Finance to photograph receipts.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
