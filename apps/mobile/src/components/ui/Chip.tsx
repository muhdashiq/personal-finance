import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  onClear?: () => void;
};

export const Chip = ({ label, selected = false, onPress, icon, onClear }: ChipProps) => {
  const theme = useTheme();
  const fg = selected ? theme.colors.onPrimary : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        height: 34,
        borderRadius: theme.radii.pill,
        backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
        borderWidth: selected ? 0 : 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <Text variant="subhead" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
      {selected && onClear ? (
        <Ionicons name="close-circle" size={16} color={fg} onPress={onClear} accessibilityLabel={`Clear ${label}`} />
      ) : null}
    </Pressable>
  );
};
