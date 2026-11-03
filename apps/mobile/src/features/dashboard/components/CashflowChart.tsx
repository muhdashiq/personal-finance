import { formatMoney, formatMoneyCompact, formatMonthShort } from '@family-finance/core';
import { useState } from 'react';
import { View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Skeleton, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { MonthPoint } from '../hooks';

type CashflowChartProps = { data: MonthPoint[] | undefined; currency: string; loading: boolean };

/** Grouped bars: income vs expenses per month. */
export const CashflowChart = ({ data, currency, loading }: CashflowChartProps) => {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  if (loading || !data) return <Skeleton height={180} radius={12} />;

  const hasData = data.some((d) => d.income > 0 || d.expenses > 0);
  if (!hasData) {
    return (
      <Text variant="callout" color="textSecondary" align="center" style={{ paddingVertical: theme.spacing.xl }}>
        Add income and expenses to see your monthly trend.
      </Text>
    );
  }

  const groupWidth = width > 0 ? (width - 48) / data.length : 40;
  const barWidth = Math.max(6, Math.min(18, groupWidth * 0.3));
  const chartData = data.flatMap((d) => [
    {
      value: d.income / 100,
      frontColor: theme.colors.income,
      spacing: 3,
      label: formatMonthShort(d.month),
      labelWidth: barWidth * 2 + 3,
      labelTextStyle: { color: theme.colors.textTertiary, fontSize: 11 },
    },
    { value: Math.max(0, d.expenses) / 100, frontColor: theme.colors.expense, spacing: Math.max(8, groupWidth - barWidth * 2 - 3) },
  ]);
  const max = Math.max(...data.map((d) => Math.max(d.income, d.expenses))) / 100;

  const summary = data
    .map((d) => `${formatMonthShort(d.month, true)}: income ${formatMoney(d.income, currency)}, expenses ${formatMoney(d.expenses, currency)}`)
    .join('; ');

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={`Monthly income and expenses. ${summary}`}>
      {width > 0 ? (
        <BarChart
          data={chartData}
          width={width - 44}
          height={160}
          barWidth={barWidth}
          initialSpacing={8}
          noOfSections={3}
          maxValue={max * 1.15 || 1}
          barBorderTopLeftRadius={4}
          barBorderTopRightRadius={4}
          yAxisThickness={0}
          xAxisThickness={0}
          rulesColor={theme.colors.separator}
          rulesType="solid"
          yAxisTextStyle={{ color: theme.colors.textTertiary, fontSize: 10 }}
          yAxisLabelWidth={40}
          formatYLabel={(label: string) => formatMoneyCompact(Math.round(Number(label) * 100), currency)}
          disableScroll
          isAnimated
          animationDuration={500}
        />
      ) : null}
      <View style={{ flexDirection: 'row', gap: theme.spacing.lg, marginTop: theme.spacing.sm, justifyContent: 'center' }}>
        <Legend color={theme.colors.income} label="Income" />
        <Legend color={theme.colors.expense} label="Expenses" />
      </View>
    </View>
  );
};

const Legend = ({ color, label }: { color: string; label: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
    <Text variant="caption" color="textSecondary">
      {label}
    </Text>
  </View>
);
