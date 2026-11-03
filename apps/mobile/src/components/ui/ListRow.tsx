import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type ListRowProps = {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export const ListRow = ({
  title,
  subtitle,
  leading,
  trailing,
  value,
  onPress,
  chevron = Boolean(onPress),
  destructive,
  disabled,
  accessibilityLabel,
}: ListRowProps) => {
  const theme = useTheme();
  const content = (
    <View style={[styles.row, { paddingHorizontal: theme.spacing.lg, opacity: disabled ? 0.5 : 1 }]}>
      {leading}
      <View style={styles.text}>
        <Text variant="body" color={destructive ? 'danger' : 'text'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="callout" color="textSecondary" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} /> : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ')}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => pressed && { backgroundColor: theme.colors.surfacePressed }}
    >
      {content}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 10, gap: 12 },
  text: { flex: 1, gap: 2 },
});
