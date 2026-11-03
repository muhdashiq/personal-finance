import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { encryptedStorage } from '@/lib/secureStorage';
import { supabase } from '@/lib/supabase';
import type { TablesInsert } from '@/types/database';

/**
 * Offline queue for new transactions.
 *
 * - Rows carry a client-generated UUID, so a retry after a timeout cannot
 *   create a duplicate: the insert uses ON CONFLICT (id) DO NOTHING.
 * - The queue is encrypted at rest (same scheme as the auth session).
 * - Rows the server rejects (validation, permissions) are kept and marked
 *   failed so the user can see and discard them; nothing is dropped silently.
 */
export type OutboxItem = {
  id: string;
  row: TablesInsert<'transactions'>;
  queuedAt: string;
  attempts: number;
  status: 'pending' | 'failed';
  error?: string;
};

type OutboxState = {
  items: OutboxItem[];
  syncing: boolean;
  add: (row: TablesInsert<'transactions'>) => void;
  remove: (id: string) => void;
  markFailed: (id: string, error: string) => void;
  retry: (id: string) => void;
  setSyncing: (syncing: boolean) => void;
  clear: () => void;
};

export const useOutbox = create<OutboxState>()(
  persist(
    (set) => ({
      items: [],
      syncing: false,
      add: (row) =>
        set((s) =>
          s.items.some((i) => i.id === row.id)
            ? s
            : { items: [...s.items, { id: row.id!, row, queuedAt: new Date().toISOString(), attempts: 0, status: 'pending' }] },
        ),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      markFailed: (id, error) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, status: 'failed', error, attempts: i.attempts + 1 } : i)) })),
      retry: (id) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, status: 'pending', error: undefined } : i)) })),
      setSyncing: (syncing) => set({ syncing }),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'ff.outbox.v1',
      storage: createJSONStorage(() => encryptedStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

export const enqueueTransaction = (row: TablesInsert<'transactions'>) => {
  useOutbox.getState().add(row);
  logger.info('outbox_enqueued', { id: row.id ?? null });
};

/** Pushes pending rows. Returns the family ids that changed. */
export const syncOutbox = async (): Promise<Set<string>> => {
  const state = useOutbox.getState();
  const changed = new Set<string>();
  if (state.syncing) return changed;
  const pending = state.items.filter((i) => i.status === 'pending');
  if (!pending.length) return changed;

  state.setSyncing(true);
  try {
    for (const item of pending) {
      const { error } = await supabase.from('transactions').upsert(item.row, { onConflict: 'id', ignoreDuplicates: true });
      if (!error) {
        useOutbox.getState().remove(item.id);
        changed.add(item.row.family_id);
        continue;
      }
      const appError = toAppError(error);
      if (appError.isNetwork) break; // still offline; try again later
      useOutbox.getState().markFailed(item.id, appError.message);
      logger.warn('outbox_rejected', { id: item.id, code: appError.code });
    }
  } finally {
    useOutbox.getState().setSyncing(false);
  }
  return changed;
};
