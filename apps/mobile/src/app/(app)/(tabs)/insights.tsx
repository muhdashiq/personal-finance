import { buildInsights, formatMoney, formatRange, percentChange } from '@family-finance/core';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Card, Screen, Section, SegmentedControl, Skeleton, Text } from '@/components/ui';
import { usePreferences } from '@/stores/preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { CashflowChart } from '@/features/dashboard/components/CashflowChart';
import { CategoryBreakdown } from '@/features/dashboard/components/CategoryBreakdown';
import { InsightList } from '@/features/dashboard/components/InsightList';
import { MemberBreakdown } from '@/features/dashboard/components/MemberBreakdown';
import { PeriodControls } from '@/features/dashboard/components/PeriodControls';
import {
  useCashflowSummary,
  useCategorySpending,
  useMemberSpending,
  useMonthlyCashflow,
  usePeriod,
  useScopeMemberId,
} from '@/features/dashboard/hooks';
import { useActiveFamily } from '@/features/family/hooks';

const Delta = ({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) => {
  const change = percentChange(current, previous);
  if (change === null) return <Text variant="caption" color="textTertiary">No earlier data</Text>;
  const good = invert ? change < 0 : change > 0;
  return (
    <Text variant="caption" color={change === 0 ? 'textTertiary' : good ? 'income' : 'expense'}>
      {change > 0 ? '▲' : change < 0 ? '▼' : '•'} {Math.abs(change)}%
    </Text>
  );
};

export default function Insights() {
  const theme = useTheme();
  const { currency, members } = useActiveFamily();
  const scope = usePreferences((s) => s.scope);
  const memberId = useScopeMemberId();
  const period = usePeriod();
  const [months, setMonths] = useState<'6' | '12'>('6');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');

  const summary = useCashflowSummary(period.range, memberId);
  const previous = useCashflowSummary(period.previous, memberId);
  const monthly = useMonthlyCashflow(Number(months), memberId);
  const categories = useCategorySpending(period.range, memberId, kind);
  const expenseCategories = useCategorySpending(period.range, memberId, 'expense');
  const previousCategories = useCategorySpending(period.previous, memberId, 'expense');
  const memberSpend = useMemberSpending(period.range);

  const insights = useMemo(() => {
    if (!summary.data || !previous.data || !expenseCategories.data || !previousCategories.data) return null;
    return buildInsights({
      currency,
      periodLabel: period.label,
      previousPeriodLabel: period.previousLabel,
      income: summary.data.income,
      expenses: summary.data.expenses,
      previousExpenses: previous.data.expenses,
      categories: expenseCategories.data.map((c) => ({ categoryId: c.categoryId, name: c.name, amountMinor: c.amount })),
      previousCategories: previousCategories.data.map((c) => ({ categoryId: c.categoryId, name: c.name, amountMinor: c.amount })),
    });
  }, [summary.data, previous.data, expenseCategories.data, previousCategories.data, currency, period.label, period.previousLabel]);

  const tiles = summary.data && previous.data
    ? [
        { label: 'Income', value: summary.data.income, prev: previous.data.income, invert: false },
        { label: 'Expenses', value: summary.data.expenses, prev: previous.data.expenses, invert: true },
        { label: 'Saved', value: summary.data.net, prev: previous.data.net, invert: false },
      ]
    : null;

  return (
    <Screen edgeTop bottomInset={72}>
      <Text variant="largeTitle" accessibilityRole="header">
        Insights
      </Text>
      <PeriodControls showScope={members.length > 1} />
      <Text variant="footnote" color="textSecondary">
        {formatRange(period.range)} compared with {formatRange(period.previous)}
      </Text>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {tiles
          ? tiles.map((t) => (
              <Card key={t.label} style={{ flex: 1, gap: 4, padding: theme.spacing.md }}>
                <Text variant="caption" color="textSecondary">
                  {t.label.toUpperCase()}
                </Text>
                <Text variant="headline" tabular numberOfLines={1} adjustsFontSizeToFit>
                  {formatMoney(t.value, currency, { wholeOnly: true })}
                </Text>
                <Delta current={t.value} previous={t.prev} invert={t.invert} />
              </Card>
            ))
          : [0, 1, 2].map((i) => <Skeleton key={i} height={84} radius={16} style={{ flex: 1 }} />)}
      </View>

      <Section title="Highlights" grouped={false}>
        <Card>{insights ? <InsightList insights={insights} /> : <Skeleton height={60} />}</Card>
      </Section>

      <Section
        title="Monthly trend"
        grouped={false}
        action={
          <View style={{ width: 140 }}>
            <SegmentedControl options={[{ value: '6', label: '6M' }, { value: '12', label: '12M' }]} value={months} onChange={setMonths} />
          </View>
        }
      >
        <Card>
          <CashflowChart data={monthly.data} currency={currency} loading={monthly.isLoading} />
        </Card>
      </Section>

      <Section
        title="By category"
        grouped={false}
        action={
          <View style={{ width: 170 }}>
            <SegmentedControl options={[{ value: 'expense', label: 'Spending' }, { value: 'income', label: 'Income' }]} value={kind} onChange={setKind} />
          </View>
        }
      >
        <Card>
          <CategoryBreakdown data={categories.data} currency={currency} loading={categories.isLoading} limit={12} />
        </Card>
      </Section>

      {scope === 'family' && members.length > 1 ? (
        <Section title="By family member" grouped={false}>
          <Card>
            <MemberBreakdown data={memberSpend.data} currency={currency} loading={memberSpend.isLoading} />
          </Card>
        </Section>
      ) : null}

      <Card style={{ gap: 4 }}>
        <Text variant="headline" color="textSecondary">
          Coming next
        </Text>
        <Text variant="footnote" color="textTertiary">
          Weekly and yearly reports, budgets with alerts, unusual-spending detection and PDF/Excel export are planned for Phase 3.
        </Text>
      </Card>
    </Screen>
  );
}
