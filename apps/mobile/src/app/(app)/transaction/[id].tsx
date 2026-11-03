import { Ionicons } from '@expo/vector-icons';
import { PAYMENT_METHOD_LABELS, formatDisplayDate, fromDb, maskLast4 } from '@family-finance/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Image, Linking, Pressable, View } from 'react-native';
import { Amount, Button, Card, ErrorState, IconBadge, ListRow, Screen, Section, Text } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { confirm } from '@/stores/confirm';
import { toast } from '@/stores/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { useUser } from '@/features/auth/AuthProvider';
import { useAccounts } from '@/features/accounts/hooks';
import { useCategoryLookup } from '@/features/categories/hooks';
import { useActiveFamily } from '@/features/family/hooks';
import { deleteAttachment, deleteTransaction, receiptUrl, type Attachment } from '@/features/transactions/api';
import { useAttachments, useInvalidateMoney, useTransaction } from '@/features/transactions/hooks';

const TYPE_LABEL = { expense: 'Expense', income: 'Income', transfer: 'Transfer', refund: 'Refund' } as const;

const ReceiptThumb = ({ attachment, onDelete }: { attachment: Attachment; onDelete?: () => void }) => {
  const theme = useTheme();
  const url = useQuery({ queryKey: ['receipt-url', attachment.id], queryFn: () => receiptUrl(attachment), staleTime: 4 * 60_000 });
  const isImage = attachment.mime_type.startsWith('image/');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: theme.spacing.md }}>
      <Pressable accessibilityRole="link" accessibilityLabel={`Open ${attachment.file_name}`} onPress={() => url.data && void Linking.openURL(url.data)}>
        {isImage && url.data ? (
          <Image source={{ uri: url.data }} style={{ width: 56, height: 56, borderRadius: theme.radii.sm }} accessibilityIgnoresInvertColors />
        ) : (
          <IconBadge icon="document-outline" color={theme.colors.secondary} size={56} ionicon />
        )}
      </Pressable>
      <Text variant="callout" style={{ flex: 1 }} numberOfLines={1}>
        {attachment.file_name}
      </Text>
      {onDelete ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Delete receipt" onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
        </Pressable>
      ) : null}
    </View>
  );
};

export default function TransactionDetail() {
  const theme = useTheme();
  const user = useUser();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { family, memberById, me, isAdmin, canWrite } = useActiveFamily();
  const query = useTransaction(id);
  const attachments = useAttachments(id);
  const { byId } = useCategoryLookup();
  const { data: accounts } = useAccounts();
  const invalidate = useInvalidateMoney();

  const remove = useMutation({
    mutationFn: () => deleteTransaction(id),
    onSuccess: async () => {
      await invalidate(family.id);
      toast.show('Transaction deleted');
      router.back();
    },
    onError: (error) => toast.error(toAppError(error).message),
  });

  const removeAttachment = useMutation({
    mutationFn: deleteAttachment,
    onSuccess: () => void attachments.refetch(),
    onError: (error) => toast.error(toAppError(error).message),
  });

  if (query.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
  const t = query.data;
  if (!t) return <ErrorState message={query.error?.message ?? 'Transaction not found'} onRetry={() => void query.refetch()} />;

  const canEdit = canWrite && (isAdmin || t.created_by === user.id || t.spent_by_member_id === me.id);
  const category = byId(t.category_id);
  const subcategory = byId(t.subcategory_id);
  const instrument = (bankId: string | null, cardId: string | null) => {
    const acc = bankId ? accounts?.banks.find((b) => b.id === bankId) : cardId ? accounts?.cards.find((c) => c.id === cardId) : undefined;
    return acc ? `${acc.nickname} ${maskLast4(acc.last4)}`.trim() : null;
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: canEdit
            ? () => (
                <Pressable accessibilityRole="button" onPress={() => router.push(`/transaction/edit/${t.id}`)} hitSlop={10}>
                  <Text variant="headline" color="primary">
                    Edit
                  </Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: theme.spacing.xxl }}>
        {category?.icon ? <IconBadge icon={category.icon} color={category.color ?? theme.colors.primary} size={52} /> : null}
        <Text variant="title2" align="center">
          {t.title}
        </Text>
        <Amount minor={fromDb(t.amount)} currency={t.currency} type={t.type} variant="amountXL" />
        <Text variant="footnote" color="textSecondary">
          {TYPE_LABEL[t.type]} · {formatDisplayDate(t.occurred_on)}
          {t.visibility === 'private' ? ' · Private' : ''}
        </Text>
      </Card>

      <Section>
        {t.type !== 'transfer' ? (
          <ListRow title="Category" value={[category?.name ?? 'Uncategorised', subcategory?.name].filter(Boolean).join(' › ')} />
        ) : null}
        <ListRow title={t.type === 'income' ? 'Received by' : 'Spent by'} value={memberById(t.spent_by_member_id)?.display_name ?? '—'} />
        {t.type === 'transfer' ? (
          <>
            <ListRow title="From" value={instrument(t.bank_account_id, t.credit_card_id) ?? '—'} />
            <ListRow title="To" value={instrument(t.counterparty_bank_account_id, t.counterparty_credit_card_id) ?? '—'} />
          </>
        ) : (
          <ListRow title={t.type === 'income' ? 'Into' : 'Paid from'} value={instrument(t.bank_account_id, t.credit_card_id) ?? 'Cash / not tracked'} />
        )}
        {t.payment_method ? <ListRow title="Payment method" value={PAYMENT_METHOD_LABELS[t.payment_method]} /> : null}
        {t.merchant ? <ListRow title={t.type === 'income' ? 'Payer' : 'Merchant'} value={t.merchant} /> : null}
        {t.currency !== family.base_currency ? (
          <ListRow title="Currency" value={`${t.currency} (not included in ${family.base_currency} reports)`} />
        ) : null}
      </Section>

      {t.notes ? (
        <Section title="Notes" grouped={false}>
          <Card>
            <Text variant="body">{t.notes}</Text>
          </Card>
        </Section>
      ) : null}

      {attachments.data && attachments.data.length > 0 ? (
        <Section title="Receipts">
          {attachments.data.map((a) => (
            <ReceiptThumb
              key={a.id}
              attachment={a}
              onDelete={
                canEdit
                  ? async () => {
                      if (await confirm({ title: 'Delete receipt?', confirmLabel: 'Delete', destructive: true })) removeAttachment.mutate(a);
                    }
                  : undefined
              }
            />
          ))}
        </Section>
      ) : null}

      <Text variant="footnote" color="textTertiary" align="center">
        Added {formatDisplayDate(t.created_at.slice(0, 10))}
        {t.created_by === user.id ? ' by you' : ''}
        {t.source !== 'manual' ? ` · from ${t.source.replace('_', ' ')}` : ''}
      </Text>

      {canEdit ? (
        <Button
          label="Delete transaction"
          variant="destructive"
          loading={remove.isPending}
          onPress={async () => {
            if (await confirm({ title: 'Delete this transaction?', message: 'This cannot be undone. The deletion is recorded in the audit log.', confirmLabel: 'Delete', destructive: true })) {
              remove.mutate();
            }
          }}
        />
      ) : null}
    </Screen>
  );
}
