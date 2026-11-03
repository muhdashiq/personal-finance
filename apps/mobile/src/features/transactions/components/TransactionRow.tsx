import { Ionicons } from '@expo/vector-icons';
import { fromDb, maskLast4, type TransactionType } from '@family-finance/core';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Amount, IconBadge, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useAccounts } from '@/features/accounts/hooks';
import { useCategoryLookup } from '@/features/categories/hooks';
import { useActiveFamily } from '@/features/family/hooks';
import type { Transaction } from '../api';

type TransactionRowProps = {
  transaction: Pick<
    Transaction,
    | 'id'
    | 'type'
    | 'title'
    | 'amount'
    | 'currency'
    | 'category_id'
    | 'subcategory_id'
    | 'spent_by_member_id'
    | 'bank_account_id'
    | 'credit_card_id'
    | 'counterparty_bank_account_id'
    | 'counterparty_credit_card_id'
    | 'visibility'
    | 'merchant'
  >;
  onPress?: () => void;
  pending?: 'pending' | 'failed';
};

const typeIcon: Record<TransactionType, keyof typeof Ionicons.glyphMap> = {
  expense: 'arrow-up',
  income: 'arrow-down',
  refund: 'return-down-back',
  transfer: 'swap-horizontal',
};

export const TransactionRow = memo(({ transaction: t, onPress, pending }: TransactionRowProps) => {
  const theme = useTheme();
  const { byId } = useCategoryLookup();
  const { memberById, members } = useActiveFamily();
  const { data: accounts } = useAccounts();

  const category = byId(t.category_id);
  const subcategory = byId(t.subcategory_id);
  const member = memberById(t.spent_by_member_id);
  const instrumentName = (bankId: string | null, cardId: string | null) => {
    const account = bankId ? accounts?.banks.find((b) => b.id === bankId) : cardId ? accounts?.cards.find((c) => c.id === cardId) : undefined;
    return account ? `${account.nickname} ${maskLast4(account.last4)}`.trim() : null;
  };

  const source = instrumentName(t.bank_account_id, t.credit_card_id);
  const destination = instrumentName(t.counterparty_bank_account_id, t.counterparty_credit_card_id);
  const parts =
    t.type === 'transfer'
      ? [source && destination ? `${source} → ${destination}` : 'Transfer']
      : [subcategory?.name ?? category?.name ?? 'Uncategorised', members.length > 1 ? member?.display_name : null, source];

  const iconColor = category?.color ?? (t.type === 'income' || t.type === 'refund' ? theme.colors.income : theme.colors.textSecondary);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.title}, ${parts.filter(Boolean).join(', ')}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { paddingHorizontal: theme.spacing.lg }, pressed && { backgroundColor: theme.colors.surfacePressed }]}
    >
      {category?.icon ? (
        <IconBadge icon={category.icon} color={iconColor} />
      ) : (
        <IconBadge icon={typeIcon[t.type]} color={iconColor} ionicon />
      )}
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text variant="body" numberOfLines={1} style={styles.flexShrink}>
            {t.title}
          </Text>
          {t.visibility === 'private' ? <Ionicons name="lock-closed" size={12} color={theme.colors.textTertiary} accessibilityLabel="Private" /> : null}
        </View>
        <Text variant="footnote" color={pending === 'failed' ? 'danger' : 'textSecondary'} numberOfLines={1}>
          {pending === 'pending' ? 'Waiting to sync · ' : pending === 'failed' ? 'Sync failed · ' : ''}
          {parts.filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Amount minor={fromDb(t.amount)} currency={t.currency} type={t.type} variant="headline" />
    </Pressable>
  );
});
TransactionRow.displayName = 'TransactionRow';

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  text: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flexShrink: { flexShrink: 1 },
});
