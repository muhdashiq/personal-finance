import NetInfo from '@react-native-community/netinfo';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { qk } from '@/lib/queryKeys';
import { useActiveFamily } from '@/features/family/hooks';
import {
  PAGE_SIZE,
  fetchAttachments,
  fetchRecentTransactions,
  fetchTransaction,
  fetchTransactionsPage,
  type TransactionFilters,
} from './api';
import { syncOutbox, useOutbox } from './outbox';

export const useTransactionList = (filters: TransactionFilters) => {
  const { family } = useActiveFamily();
  return useInfiniteQuery({
    queryKey: qk.transactionList(family.id, filters),
    queryFn: ({ pageParam }) => fetchTransactionsPage(family.id, filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === PAGE_SIZE ? all.length : undefined),
  });
};

export const useRecentTransactions = (limit = 5) => {
  const { family } = useActiveFamily();
  return useQuery({
    queryKey: [...qk.transactions(family.id), 'recent', limit],
    queryFn: () => fetchRecentTransactions(family.id, limit),
  });
};

export const useTransaction = (id: string) => {
  const { family } = useActiveFamily();
  return useQuery({ queryKey: qk.transaction(family.id, id), queryFn: () => fetchTransaction(id) });
};

export const useAttachments = (transactionId: string) => {
  const { family } = useActiveFamily();
  return useQuery({ queryKey: qk.attachments(family.id, transactionId), queryFn: () => fetchAttachments(transactionId) });
};

/** Everything that depends on transactions: lists, reports, balances. */
export const useInvalidateMoney = () => {
  const queryClient = useQueryClient();
  return useCallback(
    (familyId: string) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.transactions(familyId) }),
        queryClient.invalidateQueries({ queryKey: qk.reports(familyId) }),
        queryClient.invalidateQueries({ queryKey: qk.balances(familyId) }),
      ]),
    [queryClient],
  );
};

/** Pending offline items for the active family. */
export const usePendingTransactions = () => {
  const { family } = useActiveFamily();
  const items = useOutbox((s) => s.items);
  return items.filter((i) => i.row.family_id === family.id);
};

/** Syncs the offline queue on start, on reconnect and when the app returns to the foreground. */
export const useOutboxSync = () => {
  const invalidate = useInvalidateMoney();
  useEffect(() => {
    const run = () => {
      void syncOutbox().then((changed) => {
        changed.forEach((familyId) => void invalidate(familyId));
      });
    };
    run();
    const netSub = NetInfo.addEventListener((state) => {
      if (state.isConnected) run();
    });
    const appSub = AppState.addEventListener('change', (status) => {
      if (status === 'active') run();
    });
    return () => {
      netSub();
      appSub.remove();
    };
  }, [invalidate]);
};
