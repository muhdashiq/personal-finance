import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { hitSlop, type ColorTokens } from '@/theme/tokens';

type IconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  color?: keyof ColorTokens;
  size?: number;
  filled?: boolean;
};

export const IconButton = ({ icon, onPress, accessibilityLabel, color = 'primary', size = 22, filled }: IconButtonProps) => {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? theme.colors.primaryContainer : 'transparent',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={size} color={theme.colors[color]} />
    </Pressable>
  );
};
