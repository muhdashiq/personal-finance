import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  tone?: 'default' | 'primary' | 'warning';
};

export const Card = ({ children, onPress, padded = true, style, accessibilityLabel, tone = 'default' }: CardProps) => {
  const theme = useTheme();
  const background =
    tone === 'primary' ? theme.colors.primary : tone === 'warning' ? theme.colors.warningContainer : theme.colors.surface;
  const base: ViewStyle = {
    backgroundColor: background,
    borderRadius: theme.radii.lg,
    padding: padded ? theme.spacing.lg : 0,
    borderWidth: theme.scheme === 'dark' && tone === 'default' ? 1 : 0,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    ...theme.elevation(1),
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, pressed && { transform: [{ scale: 0.985 }], opacity: 0.96 }, style]}
    >
      {children}
    </Pressable>
  );
};
