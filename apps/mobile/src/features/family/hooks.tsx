import type { FamilyRole } from '@family-finance/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { qk } from '@/lib/queryKeys';
import { usePreferences } from '@/stores/preferences';
import { useAuth, useUser } from '@/features/auth/AuthProvider';
import {
  fetchFamilies,
  fetchFamilyInvitations,
  fetchMembers,
  fetchMyInvitations,
  fetchProfile,
  type Family,
  type FamilyMember,
} from './api';

export const useFamilies = () => {
  const user = useUser();
  return useQuery({ queryKey: qk.families(user.id), queryFn: fetchFamilies });
};

export const useProfile = () => {
  const user = useUser();
  return useQuery({ queryKey: qk.profile(user.id), queryFn: () => fetchProfile(user.id) });
};

export const useMyInvitations = () => {
  const { user } = useAuth();
  const email = user?.email ?? '';
  return useQuery({
    queryKey: qk.myInvitations(user?.id ?? 'anon'),
    queryFn: () => fetchMyInvitations(email),
    enabled: Boolean(email),
  });
};

type ActiveFamily = {
  family: Family;
  families: Family[];
  /** Active members, ordered with the current user first. */
  members: FamilyMember[];
  /** Includes removed members (for history and filters). */
  allMembers: FamilyMember[];
  me: FamilyMember;
  role: FamilyRole;
  isAdmin: boolean;
  canWrite: boolean;
  currency: string;
  memberById: (id: string | null | undefined) => FamilyMember | undefined;
};

const ActiveFamilyContext = createContext<ActiveFamily | null>(null);

/**
 * Picks the active family (persisted preference → profile default → first)
 * and loads its members. Children render only when everything is ready.
 */
export const ActiveFamilyProvider = ({
  families,
  children,
  fallback,
}: {
  families: Family[];
  children: ReactNode;
  fallback: ReactNode;
}) => {
  const user = useUser();
  const profile = useProfile();
  const preferred = usePreferences((s) => s.activeFamilyId);
  const setActiveFamilyId = usePreferences((s) => s.setActiveFamilyId);

  const family =
    families.find((f) => f.id === preferred) ??
    families.find((f) => f.id === profile.data?.default_family_id) ??
    families[0];

  useEffect(() => {
    if (family && family.id !== preferred) setActiveFamilyId(family.id);
  }, [family, preferred, setActiveFamilyId]);

  const membersQuery = useQuery({
    queryKey: qk.members(family?.id ?? 'none'),
    queryFn: () => fetchMembers(family!.id),
    enabled: Boolean(family),
  });

  const value = useMemo<ActiveFamily | null>(() => {
    if (!family || !membersQuery.data) return null;
    const allMembers = membersQuery.data;
    const me = allMembers.find((m) => m.user_id === user.id && m.status === 'active');
    if (!me) return null;
    const members = [me, ...allMembers.filter((m) => m.status === 'active' && m.id !== me.id)];
    const byId = new Map(allMembers.map((m) => [m.id, m]));
    return {
      family,
      families,
      members,
      allMembers,
      me,
      role: me.role,
      isAdmin: me.role === 'admin',
      canWrite: me.role !== 'viewer',
      currency: family.base_currency,
      memberById: (id) => (id ? byId.get(id) : undefined),
    };
  }, [family, families, membersQuery.data, user.id]);

  if (!value) return <>{fallback}</>;
  return <ActiveFamilyContext.Provider value={value}>{children}</ActiveFamilyContext.Provider>;
};

export const useActiveFamily = (): ActiveFamily => {
  const ctx = useContext(ActiveFamilyContext);
  if (!ctx) throw new Error('useActiveFamily must be used inside ActiveFamilyProvider');
  return ctx;
};

export const useFamilyInvitations = () => {
  const { family, isAdmin } = useActiveFamily();
  return useQuery({
    queryKey: qk.invitations(family.id),
    queryFn: () => fetchFamilyInvitations(family.id),
    enabled: isAdmin,
  });
};

/** Invalidate everything membership-related after a change. */
export const useInvalidateFamily = () => {
  const queryClient = useQueryClient();
  const user = useUser();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.families(user.id) }),
      queryClient.invalidateQueries({ queryKey: qk.myInvitations(user.id) }),
      queryClient.invalidateQueries({ queryKey: qk.profile(user.id) }),
      queryClient.invalidateQueries({ queryKey: ['family'] }),
    ]);
};

