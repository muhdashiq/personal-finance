import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { TextField } from './TextField';

export type PickerOption = {
  value: string;
  label: string;
  description?: string;
  leading?: ReactNode;
  /** Indent (e.g. subcategories). */
  depth?: 0 | 1;
};

type PickerSheetProps = {
  visible: boolean;
  title: string;
  options: readonly PickerOption[];
  selected?: string | null;
  onSelect: (value: string | null) => void;
  onClose: () => void;
  searchable?: boolean;
  /** Show a "None" row that clears the value. */
  allowClear?: boolean;
  clearLabel?: string;
  footer?: ReactNode;
};

export const PickerSheet = ({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  searchable = options.length > 8,
  allowClear,
  clearLabel = 'None',
  footer,
}: PickerSheetProps) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q)) : options;
    return allowClear && !q ? [{ value: '__clear__', label: clearLabel } as PickerOption, ...list] : list;
  }, [options, query, allowClear, clearLabel]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      transparent={Platform.OS !== 'ios'}
      onRequestClose={close}
    >
      <View style={[styles.backdrop, Platform.OS !== 'ios' && { backgroundColor: theme.colors.overlay }]}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              paddingBottom: insets.bottom + theme.spacing.md,
              borderTopLeftRadius: Platform.OS === 'ios' ? 0 : theme.radii.xl,
              borderTopRightRadius: Platform.OS === 'ios' ? 0 : theme.radii.xl,
              maxHeight: Platform.OS === 'ios' ? undefined : '85%',
              flex: Platform.OS === 'ios' ? 1 : undefined,
            },
          ]}
        >
          <View style={[styles.header, { paddingHorizontal: theme.spacing.lg }]}>
            <Text variant="title3" accessibilityRole="header">
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={12}>
              <Text variant="headline" color="primary">
                Done
              </Text>
            </Pressable>
          </View>
          {searchable ? (
            <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
              <TextField
                placeholder="Search"
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                leading={<Ionicons name="search" size={18} color={theme.colors.textTertiary} />}
              />
            </View>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: theme.spacing.lg }}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.colors.separator, marginLeft: 16 }} />}
            renderItem={({ item, index }) => {
              const isSelected = item.value === '__clear__' ? !selected : item.value === selected;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    onSelect(item.value === '__clear__' ? null : item.value);
                    close();
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
                      paddingLeft: item.depth === 1 ? 44 : 16,
                      borderTopLeftRadius: index === 0 ? theme.radii.md : 0,
                      borderTopRightRadius: index === 0 ? theme.radii.md : 0,
                      borderBottomLeftRadius: index === filtered.length - 1 ? theme.radii.md : 0,
                      borderBottomRightRadius: index === filtered.length - 1 ? theme.radii.md : 0,
                    },
                  ]}
                >
                  {item.leading}
                  <View style={{ flex: 1 }}>
                    <Text variant={item.depth === 1 ? 'callout' : 'body'}>{item.label}</Text>
                    {item.description ? (
                      <Text variant="footnote" color="textSecondary">
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected ? <Ionicons name="checkmark" size={20} color={theme.colors.primary} /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text variant="callout" color="textSecondary" align="center" style={{ padding: theme.spacing.xl }}>
                No matches
              </Text>
            }
            ListFooterComponent={footer ? <View style={{ paddingVertical: theme.spacing.lg }}>{footer}</View> : undefined}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { paddingTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingRight: 16, paddingVertical: 10, gap: 12 },
});
