import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { usePreferences } from '@/stores/preferences';
import { useOutbox } from '@/features/transactions/outbox';

type AuthState = {
  session: Session | null;
  user: User | null;
  /** True until the stored session has been read. */
  initializing: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .finally(() => {
        if (mounted) setInitializing(false);
      });

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') {
        // Never leave one user's financial data cached for the next user.
        queryClient.clear();
        usePreferences.getState().setActiveFamilyId(null);
        useOutbox.getState().clear();
      }
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => ({ session, user: session?.user ?? null, initializing }), [session, initializing]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

/** The signed-in user; only use below the authenticated layout. */
export const useUser = (): User => {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called without a signed-in user');
  return user;
};
