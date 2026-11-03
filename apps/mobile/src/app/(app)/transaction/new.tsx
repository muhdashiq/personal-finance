import { router, useLocalSearchParams } from 'expo-router';
import type { TransactionType } from '@family-finance/core';
import { toAppError } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { TransactionForm } from '@/features/transactions/components/TransactionForm';
import { useSaveTransaction } from '@/features/transactions/useSaveTransaction';

export default function NewTransaction() {
  const params = useLocalSearchParams<{ type?: TransactionType }>();
  const save = useSaveTransaction();
  return (
    <TransactionForm
      defaultValues={params.type ? { type: params.type } : undefined}
      submitLabel="Save transaction"
      submitting={save.isPending}
      onSubmit={(values, meta) =>
        save.mutate(
          { values, meta },
          {
            onSuccess: () => router.back(),
            onError: (error) => toast.error(toAppError(error).message),
          },
        )
      }
    />
  );
}
