import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PeriodPreset } from '@family-finance/core';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';
/** Family view shows everyone's (visible) money; individual view filters to me. */
export type ViewScope = 'family' | 'individual';

type PreferencesState = {
  theme: ThemePreference;
  scope: ViewScope;
  period: PeriodPreset;
  activeFamilyId: string | null;
  setTheme: (theme: ThemePreference) => void;
  setScope: (scope: ViewScope) => void;
  setPeriod: (period: PeriodPreset) => void;
  setActiveFamilyId: (id: string | null) => void;
  reset: () => void;
};

const defaults = {
  theme: 'system' as ThemePreference,
  scope: 'family' as ViewScope,
  period: 'this_month' as PeriodPreset,
  activeFamilyId: null,
};

/** Device-local UI preferences (no financial data is stored here). */
export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...defaults,
      setTheme: (theme) => set({ theme }),
      setScope: (scope) => set({ scope }),
      setPeriod: (period) => set({ period }),
      setActiveFamilyId: (activeFamilyId) => set({ activeFamilyId }),
      reset: () => set(defaults),
    }),
    {
      name: 'ff.preferences.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
