import { create } from 'zustand';

/**
 * Cross-platform confirmation dialog (Alert.alert is a no-op on web).
 * Rendered by <ConfirmHost/> in the root layout.
 */
type ConfirmRequest = {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  resolve: (confirmed: boolean) => void;
};

type ConfirmState = {
  request: ConfirmRequest | null;
  open: (request: ConfirmRequest) => void;
  close: (confirmed: boolean) => void;
};

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  request: null,
  open: (request) => set({ request }),
  close: (confirmed) => {
    get().request?.resolve(confirmed);
    set({ request: null });
  },
}));

export const confirm = (options: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> =>
  new Promise((resolve) => useConfirmStore.getState().open({ ...options, resolve }));
