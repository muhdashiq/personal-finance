import { formatMoney, formatRange, percentChange, type DateRange } from '@family-finance/core';
import { StyleSheet, View } from 'react-native';
import { Card, Skeleton, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { CashflowSummary } from '../hooks';

type SummaryCardProps = {
  summary: CashflowSummary | undefined;
  previous?: CashflowSummary;
  range: DateRange;
  loading: boolean;
};

/** Headline card: what came in, what went out, and what was kept. */
export const SummaryCard = ({ summary, previous, range, loading }: SummaryCardProps) => {
  const theme = useTheme();
  const onPrimary = { color: theme.colors.onPrimary };
  const muted = { color: theme.colors.onPrimary, opacity: 0.72 };

  if (loading || !summary) {
    return (
      <Card tone="primary" style={styles.gap}>
        <Skeleton width="35%" height={12} style={styles.skeletonOnPrimary} />
        <Skeleton width="60%" height={34} style={styles.skeletonOnPrimary} />
        <Skeleton width="80%" height={12} style={styles.skeletonOnPrimary} />
      </Card>
    );
  }

  const change = previous ? percentChange(summary.expenses, previous.expenses) : null;
  const money = (minor: number) => formatMoney(minor, summary.currency, { wholeOnly: true });

  return (
    <Card tone="primary" style={styles.gap} accessibilityLabel="Cash flow summary">
      <Text variant="subhead" style={muted}>
        Saved · {formatRange(range)}
      </Text>
      <Text variant="amountXL" style={onPrimary} accessibilityLabel={`Saved ${formatMoney(summary.net, summary.currency)}`}>
        {formatMoney(summary.net, summary.currency, { wholeOnly: true })}
      </Text>
      {summary.savingsRate !== null ? (
        <Text variant="footnote" style={muted}>
          {summary.savingsRate >= 0 ? `${summary.savingsRate}% of income saved` : 'Spending exceeded income'}
        </Text>
      ) : null}
      <View style={[styles.row, { borderTopColor: 'rgba(255,255,255,0.18)' }]}>
        <View style={styles.col}>
          <Text variant="caption" style={muted}>
            INCOME
          </Text>
          <Text variant="title3" style={onPrimary} tabular>
            {money(summary.income)}
          </Text>
        </View>
        <View style={styles.col}>
          <Text variant="caption" style={muted}>
            EXPENSES
          </Text>
          <Text variant="title3" style={onPrimary} tabular>
            {money(summary.expenses)}
          </Text>
          {change !== null ? (
            <Text variant="caption" style={muted}>
              {change > 0 ? '▲' : change < 0 ? '▼' : '•'} {Math.abs(change)}% vs previous
            </Text>
          ) : null}
        </View>
      </View>
      {summary.excludedOtherCurrency > 0 ? (
        <Text variant="caption" style={muted}>
          {summary.excludedOtherCurrency} foreign-currency transaction{summary.excludedOtherCurrency === 1 ? '' : 's'} not included
        </Text>
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  gap: { gap: 6 },
  row: { flexDirection: 'row', marginTop: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 16 },
  col: { flex: 1, gap: 2 },
  skeletonOnPrimary: { backgroundColor: 'rgba(255,255,255,0.18)' },
});
