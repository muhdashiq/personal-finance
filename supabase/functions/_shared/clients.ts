import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { requireEnv } from './http.ts';

/** Client that acts as the calling user, so RLS applies. */
export const userClient = (authorization: string): SupabaseClient =>
  createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Service-role client. Only use after the caller has been authorised. */
export const adminClient = (): SupabaseClient =>
  createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
