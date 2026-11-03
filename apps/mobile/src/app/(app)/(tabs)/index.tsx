import { Ionicons } from '@expo/vector-icons';
import { buildInsights, formatMoney, type Insight } from '@family-finance/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, EmptyState, IconButton, ProgressBar, Screen, Section, Skeleton, Text } from '@/components/ui';
import { qk } from '@/lib/queryKeys';
import { usePreferences } from '@/stores/preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { useBalanceTotals } from '@/features/accounts/hooks';
import { CashflowChart } from '@/features/dashboard/components/CashflowChart';
import { CategoryBreakdown } from '@/features/dashboard/components/CategoryBreakdown';
import { InsightList } from '@/features/dashboard/components/InsightList';
import { MemberBreakdown } from '@/features/dashboard/components/MemberBreakdown';
import { PeriodControls } from '@/features/dashboard/components/PeriodControls';
import { SummaryCard } from '@/features/dashboard/components/SummaryCard';
import {
  useCashflowSummary,
  useCategorySpending,
  useMemberSpending,
  useMonthlyCashflow,
  usePeriod,
  useScopeMemberId,
} from '@/features/dashboard/hooks';
import { useActiveFamily } from '@/features/family/hooks';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import { usePendingTransactions, useRecentTransactions } from '@/features/transactions/hooks';

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function Home() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { family, me, members, currency } = useActiveFamily();
  const scope = usePreferences((s) => s.scope);
  const memberId = useScopeMemberId();
  const period = usePeriod();
  const [refreshing, setRefreshing] = useState(false);

  const summary = useCashflowSummary(period.range, memberId);
  const previous = useCashflowSummary(period.previous, memberId);
  const monthly = useMonthlyCashflow(6, memberId);
  const categories = useCategorySpending(period.range, memberId);
  const previousCategories = useCategorySpending(period.previous, memberId);
  const memberSpend = useMemberSpending(period.range);
  const recent = useRecentTransactions(5);
  const balances = useBalanceTotals();
  const pending = usePendingTransactions();

  const insights = useMemo<Insight[]>(() => {
    if (!summary.data || !previous.data || !categories.data || !previousCategories.data) return [];
    return buildInsights({
      currency,
      periodLabel: period.label,
      previousPeriodLabel: period.previousLabel,
      income: summary.data.income,
      expenses: summary.data.expenses,
      previousExpenses: previous.data.expenses,
      categories: categories.data.map((c) => ({ categoryId: c.categoryId, name: c.name, amountMinor: c.amount })),
      previousCategories: previousCategories.data.map((c) => ({ categoryId: c.categoryId, name: c.name, amountMinor: c.amount })),
    }).slice(0, 3);
  }, [summary.data, previous.data, categories.data, previousCategories.data, currency, period.label, period.previousLabel]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.reports(family.id) }),
      queryClient.invalidateQueries({ queryKey: qk.transactions(family.id) }),
      queryClient.invalidateQueries({ queryKey: qk.balances(family.id) }),
    ]);
    setRefreshing(false);
  };

  const isEmpty = recent.data?.length === 0 && pending.length === 0;
  const { totals } = balances;

  return (
    <Screen edgeTop refreshing={refreshing} onRefresh={() => void refresh()} bottomInset={72}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="subhead" color="textSecondary">
            {greeting()}, {me.display_name.split(' ')[0]}
          </Text>
          <Text variant="largeTitle" numberOfLines={1} accessibilityRole="header">
            {family.name}
          </Text>
        </View>
        <IconButton icon="settings-outline" accessibilityLabel="Settings" onPress={() => router.push('/settings')} filled />
      </View>

      {pending.length > 0 ? (
        <Card tone="warning">
          <View style={styles.inline}>
            <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.warning} />
            <Text variant="callout" style={{ flex: 1 }}>
              {pending.length} transaction{pending.length === 1 ? '' : 's'} saved offline will sync when you’re back online.
            </Text>
          </View>
        </Card>
      ) : null}

      <PeriodControls showScope={members.length > 1} />

      <SummaryCard summary={summary.data} previous={previous.data} range={period.range} loading={summary.isLoading} />

      {balances.isLoading ? (
        <Skeleton height={92} radius={16} />
      ) : totals.hasBanks || totals.hasCards ? (
        <View style={styles.tiles}>
          <Card style={styles.tile} onPress={() => router.push('/(app)/(tabs)/accounts')} accessibilityLabel="Bank balances">
            <Text variant="caption" color="textSecondary">
              IN BANK ACCOUNTS
            </Text>
            <Text variant="amountL" numberOfLines={1} adjustsFontSizeToFit>
              {totals.hasBanks ? formatMoney(totals.bankBalance, currency, { wholeOnly: true }) : '—'}
            </Text>
            <Text variant="caption" color="textTertiary">
              Calculated from entries
            </Text>
          </Card>
          <Card style={styles.tile} onPress={() => router.push('/(app)/(tabs)/accounts')} accessibilityLabel="Credit card outstanding">
            <Text variant="caption" color="textSecondary">
              CARD OUTSTANDING
            </Text>
            <Text variant="amountL" numberOfLines={1} adjustsFontSizeToFit>
              {totals.hasCards ? formatMoney(totals.cardOutstanding, currency, { wholeOnly: true }) : '—'}
            </Text>
            {totals.utilization !== null ? (
              <View style={{ gap: 4 }}>
                <ProgressBar
                  value={totals.utilization}
                  color={totals.utilization > 0.3 ? theme.colors.warning : theme.colors.investment}
                  height={4}
                  accessibilityLabel="Credit utilisation"
                />
                <Text variant="caption" color="textTertiary">
                  {Math.round(totals.utilization * 100)}% of limit used
                </Text>
              </View>
            ) : (
              <Text variant="caption" color="textTertiary">
                Across all cards
              </Text>
            )}
          </Card>
        </View>
      ) : (
        <Card onPress={() => router.push('/accounts/bank/new')} accessibilityLabel="Add a bank account">
          <View style={styles.inline}>
            <Ionicons name="business-outline" size={22} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="headline">Add your accounts</Text>
              <Text variant="footnote" color="textSecondary">
                Track bank balances and credit card dues.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
          </View>
        </Card>
      )}

      {isEmpty ? (
        <Card>
          <EmptyState
            icon="receipt-outline"
            title="Add your first transaction"
            message="Record an expense or your salary to start seeing where your money goes."
            actionLabel="Add transaction"
            onAction={() => router.push('/transaction/new')}
            compact
          />
        </Card>
      ) : null}

      <Section title="Income vs expenses" grouped={false}>
        <Card>
          <CashflowChart data={monthly.data} currency={currency} loading={monthly.isLoading} />
        </Card>
      </Section>

      <Section
        title="Where it went"
        grouped={false}
        action={
          <Pressable accessibilityRole="link" onPress={() => router.push('/(app)/(tabs)/insights')} hitSlop={8}>
            <Text variant="subhead" color="primary">
              Details
            </Text>
          </Pressable>
        }
      >
        <Card>
          <CategoryBreakdown data={categories.data} currency={currency} loading={categories.isLoading} />
        </Card>
      </Section>

      {scope === 'family' && members.length > 1 ? (
        <Section title="Who spent" grouped={false}>
          <Card>
            <MemberBreakdown data={memberSpend.data} currency={currency} loading={memberSpend.isLoading} />
          </Card>
        </Section>
      ) : null}

      {insights.length > 0 ? (
        <Section title="Insights" grouped={false}>
          <Card>
            <InsightList insights={insights} />
          </Card>
        </Section>
      ) : null}

      {recent.data && recent.data.length > 0 ? (
        <Section
          title="Recent"
          action={
            <Pressable accessibilityRole="link" onPress={() => router.push('/(app)/(tabs)/transactions')} hitSlop={8}>
              <Text variant="subhead" color="primary">
                See all
              </Text>
            </Pressable>
          }
        >
          {recent.data.map((t) => (
            <TransactionRow key={t.id} transaction={t} onPress={() => router.push(`/transaction/${t.id}`)} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, gap: 6 },
});
