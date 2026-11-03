import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

type ScreenProps = {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  /** Apply the top safe-area inset (for screens without a navigation header). */
  edgeTop?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  /** Extra bottom padding (e.g. to clear a floating button). */
  bottomInset?: number;
};

export const Screen = ({
  children,
  scroll = true,
  edgeTop = false,
  refreshing = false,
  onRefresh,
  contentStyle,
  keyboardShouldPersistTaps = 'handled',
  bottomInset = 0,
}: ScreenProps) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const padding: ViewStyle = {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: (edgeTop ? insets.top : 0) + theme.spacing.md,
    paddingBottom: theme.spacing.xxxl + bottomInset,
    gap: theme.spacing.lg,
  };

  if (!scroll) {
    return <View style={[styles.flex, { backgroundColor: theme.colors.background }, padding, contentStyle]}>{children}</View>;
  }

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[padding, contentStyle]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.textTertiary} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
};

const styles = StyleSheet.create({ flex: { flex: 1 } });
