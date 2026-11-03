import { forwardRef, useState, type ComponentRef, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string;
  helper?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
};

export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextFieldProps>(
  ({ label, error, helper, leading, trailing, style, onFocus, onBlur, editable = true, ...rest }, ref) => {
    const theme = useTheme();
    const [focused, setFocused] = useState(false);
    const borderColor = error ? theme.colors.danger : focused ? theme.colors.primary : theme.colors.border;

    return (
      <View style={styles.container}>
        {label ? (
          <Text variant="subhead" color="textSecondary">
            {label}
          </Text>
        ) : null}
        <View
          style={[
            styles.field,
            {
              backgroundColor: editable ? theme.colors.surface : theme.colors.surfaceSecondary,
              borderColor,
              borderRadius: theme.radii.md,
            },
          ]}
        >
          {leading}
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            placeholderTextColor={theme.colors.textTertiary}
            selectionColor={theme.colors.primary}
            editable={editable}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={[styles.input, theme.typography.body, { color: theme.colors.text }, style]}
            {...rest}
          />
          {trailing}
        </View>
        {error ? (
          <Text variant="footnote" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : helper ? (
          <Text variant="footnote" color="textTertiary">
            {helper}
          </Text>
        ) : null}
      </View>
    );
  },
);
TextField.displayName = 'TextField';

const styles = StyleSheet.create({
  container: { gap: 6 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 48, paddingHorizontal: 14, gap: 8 },
  input: { flex: 1, paddingVertical: 12 },
});
