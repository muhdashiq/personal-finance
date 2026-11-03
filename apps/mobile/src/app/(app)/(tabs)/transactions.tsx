import { Ionicons } from '@expo/vector-icons';
import {
  PERIOD_LABELS,
  formatRelativeDay,
  rangeForPreset,
  todayISO,
  type PeriodPreset,
  type TransactionType,
} from '@family-finance/core';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, EmptyState, ErrorState, PickerSheet, SkeletonCard, Text, TextField } from '@/components/ui';
import { confirm } from '@/stores/confirm';
import { useTheme } from '@/theme/ThemeProvider';
import { useActiveFamily } from '@/features/family/hooks';
import type { Transaction, TransactionFilters } from '@/features/transactions/api';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import { usePendingTransactions, useTransactionList } from '@/features/transactions/hooks';
import { syncOutbox, useOutbox } from '@/features/transactions/outbox';

const TYPE_FILTERS: { value: TransactionType | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'refund', label: 'Refunds' },
];
const PERIODS: PeriodPreset[] = ['this_week', 'this_month', 'last_month', 'last_3_months', 'this_year'];

type Section = { title: string; data: Transaction[] };

export default function Transactions() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { members } = useActiveFamily();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState<TransactionType | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodPreset | null>(null);
  const [sheet, setSheet] = useState<'member' | 'period' | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo<TransactionFilters>(() => {
    const range = period ? rangeForPreset(period, todayISO()) : null;
    return {
      search: debounced || undefined,
      type: type ?? undefined,
      memberId: memberId ?? undefined,
      from: range?.from,
      to: range?.to,
    };
  }, [debounced, type, memberId, period]);

  const list = useTransactionList(filters);
  const pending = usePendingTransactions();
  const retry = useOutbox((s) => s.retry);
  const remove = useOutbox((s) => s.remove);

  const sections = useMemo<Section[]>(() => {
    const rows = list.data?.pages.flat() ?? [];
    const groups = new Map<string, Transaction[]>();
    for (const row of rows) {
      const list = groups.get(row.occurred_on) ?? [];
      list.push(row);
      groups.set(row.occurred_on, list);
    }
    return [...groups].map(([date, data]) => ({ title: formatRelativeDay(date), data }));
  }, [list.data]);

  const hasFilters = Boolean(debounced || type || memberId || period);
  const memberName = members.find((m) => m.id === memberId)?.display_name;

  const header = (
    <View style={{ gap: theme.spacing.md, paddingTop: insets.top + theme.spacing.md, paddingBottom: theme.spacing.sm }}>
      <Text variant="largeTitle" accessibilityRole="header" style={{ paddingHorizontal: theme.spacing.lg }}>
        Transactions
      </Text>
      <View style={{ paddingHorizontal: theme.spacing.lg }}>
        <TextField
          placeholder="Search title, merchant or notes"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search transactions"
          leading={<Ionicons name="search" size={18} color={theme.colors.textTertiary} />}
          trailing={
            search ? (
              <Pressable accessibilityLabel="Clear search" onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
              </Pressable>
            ) : null
          }
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: theme.spacing.lg }}>
        {TYPE_FILTERS.map((f) => (
          <Chip key={f.label} label={f.label} selected={type === f.value} onPress={() => setType(f.value)} />
        ))}
        {members.length > 1 ? (
          <Chip
            label={memberName ?? 'Anyone'}
            icon="person-outline"
            selected={Boolean(memberId)}
            onPress={() => setSheet('member')}
            onClear={() => setMemberId(null)}
          />
        ) : null}
        <Chip
          label={period ? PERIOD_LABELS[period] : 'Any time'}
          icon="calendar-outline"
          selected={Boolean(period)}
          onPress={() => setSheet('period')}
          onClear={() => setPeriod(null)}
        />
      </ScrollView>
      {pending.length > 0 ? (
        <View style={{ marginHorizontal: theme.spacing.lg, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, overflow: 'hidden' }}>
          {pending.map((item) => (
            <Pressable
              key={item.id}
              accessibilityHint={item.status === 'failed' ? 'Retry or discard' : undefined}
              onPress={async () => {
                if (item.status !== 'failed') return;
                const discard = await confirm({
                  title: 'Couldn’t sync this transaction',
                  message: `${item.error ?? 'The server rejected it.'} Discard it? Choose Cancel to retry later.`,
                  confirmLabel: 'Discard',
                  destructive: true,
                });
                if (discard) remove(item.id);
                else {
                  retry(item.id);
                  void syncOutbox();
                }
              }}
            >
              <TransactionRow
                transaction={{
                  id: item.id,
                  type: item.row.type,
                  title: item.row.title,
                  amount: item.row.amount,
                  currency: item.row.currency,
                  category_id: item.row.category_id ?? null,
                  subcategory_id: item.row.subcategory_id ?? null,
                  spent_by_member_id: item.row.spent_by_member_id,
                  bank_account_id: item.row.bank_account_id ?? null,
                  credit_card_id: item.row.credit_card_id ?? null,
                  counterparty_bank_account_id: item.row.counterparty_bank_account_id ?? null,
                  counterparty_credit_card_id: item.row.counterparty_credit_card_id ?? null,
                  visibility: item.row.visibility ?? 'shared',
                  merchant: item.row.merchant ?? null,
                }}
                pending={item.status}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => (
          <Text variant="subhead" color="textSecondary" style={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, paddingBottom: 6 }}>
            {section.title}
          </Text>
        )}
        renderItem={({ item, index, section }) => (
          <View
            style={{
              marginHorizontal: theme.spacing.lg,
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: index === 0 ? theme.radii.lg : 0,
              borderTopRightRadius: index === 0 ? theme.radii.lg : 0,
              borderBottomLeftRadius: index === section.data.length - 1 ? theme.radii.lg : 0,
              borderBottomRightRadius: index === section.data.length - 1 ? theme.radii.lg : 0,
              overflow: 'hidden',
            }}
          >
            {index > 0 ? <View style={[styles.separator, { backgroundColor: theme.colors.separator }]} /> : null}
            <TransactionRow transaction={item} onPress={() => router.push(`/transaction/${item.id}`)} />
          </View>
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} tintColor={theme.colors.textTertiary} />}
        ListEmptyComponent={
          list.isLoading ? (
            <View style={{ paddingHorizontal: theme.spacing.lg, gap: 12 }}>
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : list.error ? (
            <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
          ) : hasFilters ? (
            <EmptyState icon="search-outline" title="No matching transactions" message="Try a different search or clear the filters." compact />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title="No transactions yet"
              message="Tap + to record an expense, income or transfer."
              actionLabel="Add transaction"
              onAction={() => router.push('/transaction/new')}
            />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator style={{ margin: 16 }} color={theme.colors.textTertiary} /> : undefined}
      />
      <PickerSheet
        visible={sheet === 'member'}
        title="Spent by"
        options={members.map((m) => ({ value: m.id, label: m.display_name }))}
        selected={memberId}
        allowClear
        clearLabel="Anyone"
        onSelect={setMemberId}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === 'period'}
        title="Period"
        options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
        selected={period}
        allowClear
        clearLabel="Any time"
        onSelect={(v) => setPeriod(v as PeriodPreset | null)}
        onClose={() => setSheet(null)}
        searchable={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  separator: { height: 1, marginLeft: 64 },
});
