import { formatMoney, percentOf } from '@family-finance/core';
import { View } from 'react-native';
import { Avatar, ProgressBar, Skeleton, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { MemberSpend } from '../hooks';

export const MemberBreakdown = ({ data, currency, loading }: { data: MemberSpend[] | undefined; currency: string; loading: boolean }) => {
  const theme = useTheme();
  if (loading || !data) return <Skeleton height={60} radius={12} />;
  const total = data.reduce((sum, m) => sum + Math.max(0, m.expenses), 0);
  return (
    <View style={{ gap: theme.spacing.md }}>
      {data.map((m) => {
        const share = percentOf(Math.max(0, m.expenses), total) ?? 0;
        return (
          <View key={m.memberId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={m.name} color={m.color} size={32} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="callout">{m.name}</Text>
                <Text variant="callout" tabular>
                  {formatMoney(m.expenses, currency, { wholeOnly: true })}
                </Text>
              </View>
              <ProgressBar value={share / 100} color={m.color} height={5} accessibilityLabel={`${m.name} ${share}% of spending`} />
            </View>
          </View>
        );
      })}
    </View>
  );
};
