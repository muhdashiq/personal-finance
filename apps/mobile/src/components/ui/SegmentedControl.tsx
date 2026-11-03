import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Option<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

/** iOS-style segmented control. */
export const SegmentedControl = <T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedControlProps<T>) => {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: theme.scheme === 'dark' ? theme.colors.surfaceSecondary : '#E4E6EE', borderRadius: theme.radii.md }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              if (Platform.OS !== 'web') void Haptics.selectionAsync();
              onChange(option.value);
            }}
            style={[
              styles.segment,
              { borderRadius: theme.radii.md - 3 },
              selected && { backgroundColor: theme.colors.surface, ...theme.elevation(1) },
            ]}
          >
            <Text variant="subhead" color={selected ? 'text' : 'textSecondary'} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 3 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 6 },
});
