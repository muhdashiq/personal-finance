import { fromDb, toInputString, toInstrumentKey } from '@family-finance/core';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { ErrorState } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { TransactionForm } from '@/features/transactions/components/TransactionForm';
import { useTransaction } from '@/features/transactions/hooks';
import { useSaveTransaction } from '@/features/transactions/useSaveTransaction';

export default function EditTransaction() {
  const theme = useTheme();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const query = useTransaction(id);
  const t = query.data;
  const save = useSaveTransaction(t ? { id: t.id, currency: t.currency } : undefined);

  if (query.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
  if (!t) return <ErrorState message={query.error?.message ?? 'Transaction not found'} onRetry={() => void query.refetch()} />;

  return (
    <TransactionForm
      allowReceipt
      submitLabel="Save changes"
      submitting={save.isPending}
      defaultValues={{
        type: t.type,
        title: t.title,
        amount: toInputString(fromDb(t.amount)),
        occurredOn: t.occurred_on,
        categoryId: t.category_id,
        subcategoryId: t.subcategory_id,
        paymentMethod: t.payment_method,
        instrument: toInstrumentKey(t.bank_account_id, t.credit_card_id),
        toInstrument: toInstrumentKey(t.counterparty_bank_account_id, t.counterparty_credit_card_id),
        spentByMemberId: t.spent_by_member_id,
        merchant: t.merchant ?? '',
        notes: t.notes ?? '',
        visibility: t.visibility,
      }}
      onSubmit={(values, meta) =>
        save.mutate(
          { values, meta },
          { onSuccess: () => router.back(), onError: (error) => toast.error(toAppError(error).message) },
        )
      }
    />
  );
}
