import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatDisplayDate, isISODate, parseISODate, toISODate, type ISODate } from '@family-finance/core';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { TextField } from './TextField';

type DateFieldProps = {
  label: string;
  value: ISODate;
  onChange: (value: ISODate) => void;
  error?: string;
  maximumDate?: ISODate;
};

export const DateField = ({ label, value, onChange, error, maximumDate }: DateFieldProps) => {
  const theme = useTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const [webDraft, setWebDraft] = useState(value);

  if (Platform.OS === 'web') {
    return (
      <TextField
        label={label}
        value={webDraft}
        placeholder="YYYY-MM-DD"
        error={error ?? (isISODate(webDraft) ? undefined : 'Use the format YYYY-MM-DD')}
        onChangeText={(text) => {
          setWebDraft(text);
          if (isISODate(text)) onChange(text);
        }}
      />
    );
  }

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: parseISODate(value),
        mode: 'date',
        maximumDate: maximumDate ? parseISODate(maximumDate) : undefined,
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(toISODate(date));
        },
      });
    } else {
      setIosOpen(true);
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="subhead" color="textSecondary">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatDisplayDate(value)}`}
        onPress={open}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            borderRadius: theme.radii.md,
          },
        ]}
      >
        <Ionicons name="calendar-outline" size={18} color={theme.colors.textSecondary} />
        <Text variant="body" style={{ flex: 1 }}>
          {formatDisplayDate(value)}
        </Text>
      </Pressable>
      {error ? (
        <Text variant="footnote" color="danger">
          {error}
        </Text>
      ) : null}
      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setIosOpen(false)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl }]}>
              <DateTimePicker
                value={parseISODate(value)}
                mode="date"
                display="inline"
                maximumDate={maximumDate ? parseISODate(maximumDate) : undefined}
                accentColor={theme.colors.primary}
                themeVariant={theme.scheme}
                onChange={(_, date) => {
                  if (date) onChange(toISODate(date));
                }}
              />
              <Pressable accessibilityRole="button" onPress={() => setIosOpen(false)} style={styles.done}>
                <Text variant="headline" color="primary">
                  Done
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 6 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 48, paddingHorizontal: 14, gap: 10 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 16 },
  sheet: { padding: 12 },
  done: { alignItems: 'flex-end', padding: 12 },
});
