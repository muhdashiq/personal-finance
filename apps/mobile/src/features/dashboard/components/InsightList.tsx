import { Ionicons } from '@expo/vector-icons';
import type { Insight } from '@family-finance/core';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export const InsightList = ({ insights }: { insights: Insight[] }) => {
  const theme = useTheme();
  if (!insights.length) {
    return (
      <Text variant="callout" color="textSecondary">
        Insights appear once there is enough activity to compare with the previous period.
      </Text>
    );
  }
  return (
    <View style={{ gap: theme.spacing.md }}>
      {insights.map((insight) => {
        const color = insight.tone === 'positive' ? theme.colors.income : insight.tone === 'negative' ? theme.colors.expense : theme.colors.secondary;
        const icon: keyof typeof Ionicons.glyphMap =
          insight.tone === 'positive' ? 'trending-down' : insight.tone === 'negative' ? 'trending-up' : 'pie-chart-outline';
        return (
          <View key={insight.id} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={insight.id === 'savings-rate' ? 'wallet-outline' : icon} size={16} color={color} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline">{insight.title}</Text>
              <Text variant="footnote" color="textSecondary">
                {insight.detail}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};
