import { learnRuleFromCorrection, type TransactionFormValues } from '@family-finance/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { qk } from '@/lib/queryKeys';
import { toast } from '@/stores/toast';
import { useUser } from '@/features/auth/AuthProvider';
import { saveLearnedRule } from '@/features/categories/api';
import { useActiveFamily } from '@/features/family/hooks';
import { createTransaction, toTransactionRow, updateTransaction, uploadReceipt } from './api';
import type { TransactionFormMeta } from './components/TransactionForm';
import { useInvalidateMoney } from './hooks';

type SaveInput = { values: TransactionFormValues; meta: TransactionFormMeta };
type SaveResult = { id: string; queued: boolean; receiptFailed: boolean };

/**
 * Creates or updates a transaction, then (best effort) learns a
 * categorisation rule from the user's choice and uploads a receipt.
 */
export const useSaveTransaction = (existing?: { id: string; currency: string }) => {
  const { family, currency } = useActiveFamily();
  const user = useUser();
  const queryClient = useQueryClient();
  const invalidateMoney = useInvalidateMoney();

  return useMutation({
    mutationFn: async ({ values, meta }: SaveInput): Promise<SaveResult> => {
      const row = toTransactionRow(values, { familyId: family.id, currency: existing?.currency ?? currency });
      let id: string;
      let queued = false;
      if (existing) {
        const { family_id: _familyId, ...patch } = row;
        await updateTransaction(existing.id, patch);
        id = existing.id;
      } else {
        const result = await createTransaction(row, user.id);
        id = result.id;
        queued = result.queued;
      }

      // Learn from corrections: the user chose a category the engine did not suggest.
      if (!queued && values.type !== 'transfer' && values.categoryId) {
        const s = meta.suggestion;
        const corrected = !s || s.categoryId !== values.categoryId || (s.subcategoryId ?? null) !== values.subcategoryId;
        if (corrected) {
          const draft = learnRuleFromCorrection({ description: values.title, merchant: values.merchant }, values.categoryId, values.subcategoryId);
          if (draft) {
            await saveLearnedRule(family.id, user.id, draft).catch((error: unknown) =>
              logger.warn('learn_rule_failed', { code: (error as { code?: string }).code ?? 'unknown' }),
            );
          }
        }
      }

      let receiptFailed = false;
      if (meta.receipt && !queued) {
        try {
          await uploadReceipt(family.id, id, meta.receipt, user.id);
        } catch {
          receiptFailed = true;
        }
      }
      return { id, queued, receiptFailed };
    },
    onSuccess: async (result) => {
      await Promise.all([
        invalidateMoney(family.id),
        queryClient.invalidateQueries({ queryKey: qk.rules(family.id) }),
        queryClient.invalidateQueries({ queryKey: qk.attachments(family.id, result.id) }),
      ]);
      if (result.queued) toast.show('Saved offline. It will sync when you are back online.');
      else if (result.receiptFailed) toast.error('Saved, but the receipt could not be uploaded.');
      else toast.success(existing ? 'Transaction updated' : 'Transaction added');
    },
  });
};
