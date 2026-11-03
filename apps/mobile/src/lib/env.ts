/**
 * Public runtime configuration. EXPO_PUBLIC_* values are inlined at build
 * time; only non-secret values (the Supabase URL and anon key) belong here.
 */
import { Platform } from 'react-native';

const read = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy apps/mobile/.env.example to apps/mobile/.env.local and set your Supabase project values.`,
    );
  }
  return value;
};

const readUrl = (value: string | undefined): string => {
  const url = read(value, 'EXPO_PUBLIC_SUPABASE_URL').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/.test(url)) {
    throw new Error(`EXPO_PUBLIC_SUPABASE_URL must look like https://<project-ref>.supabase.co (got "${url}").`);
  }
  if (__DEV__ && Platform.OS !== 'web' && /\/\/(127\.0\.0\.1|localhost)(:|$)/.test(url)) {
    console.warn(
      `EXPO_PUBLIC_SUPABASE_URL is ${url}. On a phone this points at the phone itself, so every request will fail. ` +
        'Use your hosted project URL (https://<project-ref>.supabase.co) or your computer’s LAN IP, then restart with `npx expo start -c`.',
    );
  }
  return url;
};

export const env = {
  supabaseUrl: readUrl(process.env.EXPO_PUBLIC_SUPABASE_URL),
  // Either the publishable key (sb_publishable_…) or the legacy anon key.
  supabaseAnonKey: read(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, 'EXPO_PUBLIC_SUPABASE_ANON_KEY').trim(),
  inviteBaseUrl: process.env.EXPO_PUBLIC_INVITE_BASE_URL || null,
} as const;
