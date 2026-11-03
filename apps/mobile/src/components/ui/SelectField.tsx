import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { PickerSheet, type PickerOption } from './PickerSheet';
import { Text } from './Text';

type SelectFieldProps = {
  label: string;
  value: string | null;
  options: readonly PickerOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  error?: string;
  allowClear?: boolean;
  clearLabel?: string;
  sheetTitle?: string;
  disabled?: boolean;
  footer?: ReactNode;
  helper?: string;
};

/** A form field that opens a picker sheet. */
export const SelectField = ({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose',
  error,
  allowClear,
  clearLabel,
  sheetTitle,
  disabled,
  footer,
  helper,
}: SelectFieldProps) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.container}>
      <Text variant="subhead" color="textSecondary">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: disabled ? theme.colors.surfaceSecondary : pressed ? theme.colors.surfacePressed : theme.colors.surface,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            borderRadius: theme.radii.md,
          },
        ]}
      >
        {selected?.leading}
        <Text variant="body" color={selected ? 'text' : 'textTertiary'} style={{ flex: 1 }} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.colors.textTertiary} />
      </Pressable>
      {error ? (
        <Text variant="footnote" color="danger">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="footnote" color="textTertiary">
          {helper}
        </Text>
      ) : null}
      <PickerSheet
        visible={open}
        title={sheetTitle ?? label}
        options={options}
        selected={value}
        onSelect={onChange}
        onClose={() => setOpen(false)}
        allowClear={allowClear}
        clearLabel={clearLabel}
        footer={footer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 6 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 48, paddingHorizontal: 14, gap: 10 },
});
