import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

type ProgressBarProps = { value: number; color?: string; height?: number; accessibilityLabel?: string };

/** value is 0..1 (values above 1 are shown full and in the warning colour by the caller). */
export const ProgressBar = ({ value, color, height = 6, accessibilityLabel }: ProgressBarProps) => {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ height, borderRadius: height / 2, backgroundColor: theme.colors.surfaceSecondary, overflow: 'hidden' }}
    >
      <View style={{ width: `${clamped * 100}%`, height, borderRadius: height / 2, backgroundColor: color ?? theme.colors.primary }} />
    </View>
  );
};
