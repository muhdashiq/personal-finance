import { formatMoney, percentOf } from '@family-finance/core';
import { View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { IconBadge, ProgressBar, Skeleton, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { CategorySpend } from '../hooks';

type CategoryBreakdownProps = {
  data: CategorySpend[] | undefined;
  currency: string;
  loading: boolean;
  limit?: number;
  showChart?: boolean;
  onSelect?: (categoryId: string | null) => void;
};

export const CategoryBreakdown = ({ data, currency, loading, limit = 5, showChart = true }: CategoryBreakdownProps) => {
  const theme = useTheme();
  if (loading || !data) {
    return (
      <View style={{ gap: 12 }}>
        <Skeleton height={14} width="70%" />
        <Skeleton height={14} width="55%" />
        <Skeleton height={14} width="40%" />
      </View>
    );
  }

  const positive = data.filter((d) => d.amount > 0);
  const total = positive.reduce((sum, d) => sum + d.amount, 0);
  if (total === 0) {
    return (
      <Text variant="callout" color="textSecondary" align="center" style={{ paddingVertical: theme.spacing.lg }}>
        No spending in this period yet.
      </Text>
    );
  }

  const top = positive.slice(0, limit);
  const rest = positive.slice(limit).reduce((sum, d) => sum + d.amount, 0);
  const slices = [
    ...top.map((d) => ({ value: d.amount, color: d.color })),
    ...(rest > 0 ? [{ value: rest, color: theme.colors.textTertiary }] : []),
  ];

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {showChart ? (
        <View style={{ alignItems: 'center' }} accessible accessibilityLabel={`Spending by category. Total ${formatMoney(total, currency)}`}>
          <PieChart
            data={slices}
            donut
            radius={84}
            innerRadius={60}
            innerCircleColor={theme.colors.surface}
            strokeWidth={2}
            strokeColor={theme.colors.surface}
            centerLabelComponent={() => (
              <View style={{ alignItems: 'center' }}>
                <Text variant="caption" color="textSecondary">
                  Total
                </Text>
                <Text variant="headline" tabular>
                  {formatMoney(total, currency, { wholeOnly: true })}
                </Text>
              </View>
            )}
          />
        </View>
      ) : null}
      <View style={{ gap: theme.spacing.md }}>
        {top.map((d) => {
          const share = percentOf(d.amount, total) ?? 0;
          return (
            <View key={d.categoryId ?? d.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconBadge icon={d.icon} color={d.color} size={32} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text variant="callout" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {d.name}
                  </Text>
                  <Text variant="callout" tabular>
                    {formatMoney(d.amount, currency, { wholeOnly: true })}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <ProgressBar value={share / 100} color={d.color} height={5} accessibilityLabel={`${d.name} ${share}%`} />
                  </View>
                  <Text variant="caption" color="textTertiary" tabular style={{ width: 40, textAlign: 'right' }}>
                    {share}%
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};
