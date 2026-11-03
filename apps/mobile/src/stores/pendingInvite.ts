import { create } from 'zustand';

/**
 * Holds an invitation token opened from a deep link while the user still has
 * to sign in or sign up. Kept in memory only; tokens are never persisted.
 */
type PendingInviteState = {
  token: string | null;
  setToken: (token: string | null) => void;
};

export const usePendingInvite = create<PendingInviteState>()((set) => ({
  token: null,
  setToken: (token) => set({ token }),
}));
