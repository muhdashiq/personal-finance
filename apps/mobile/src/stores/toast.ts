import { create } from 'zustand';

type Toast = { id: number; message: string; tone: 'default' | 'success' | 'error' };

type ToastState = {
  current: Toast | null;
  show: (message: string, tone?: Toast['tone']) => void;
  dismiss: () => void;
};

let counter = 0;

export const useToast = create<ToastState>()((set) => ({
  current: null,
  show: (message, tone = 'default') => {
    counter += 1;
    set({ current: { id: counter, message, tone } });
  },
  dismiss: () => set({ current: null }),
}));

/** Imperative helper for non-component code (mutation callbacks). */
export const toast = {
  show: (message: string) => useToast.getState().show(message),
  success: (message: string) => useToast.getState().show(message, 'success'),
  error: (message: string) => useToast.getState().show(message, 'error'),
};
