/**
 * Public runtime configuration. EXPO_PUBLIC_* values are inlined at build
 * time; only non-secret values (the Supabase URL and anon key) belong here.
 */
const read = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy apps/mobile/.env.example to apps/mobile/.env.local and set your Supabase project values.`,
    );
  }
  return value;
};

export const env = {
  supabaseUrl: read(process.env.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: read(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, 'EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  inviteBaseUrl: process.env.EXPO_PUBLIC_INVITE_BASE_URL || null,
} as const;
