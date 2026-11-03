import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { useActiveFamily } from '@/features/family/hooks';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (active: IconName, inactive: IconName) =>
  function TabBarIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={focused ? active : inactive} size={size - 2} color={typeof color === 'string' ? color : undefined} />;
  };

/** Prominent add button that floats above the tab bar on every tab. */
const AddTransactionButton = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { canWrite } = useActiveFamily();
  if (!canWrite) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'flex-end' }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        onPress={() => {
          if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/transaction/new');
        }}
        style={({ pressed }) => ({
          marginRight: theme.spacing.lg,
          marginBottom: insets.bottom + 64,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.94 : 1 }],
          ...theme.elevation(2),
        })}
      >
        <Ionicons name="add" size={30} color={theme.colors.onPrimary} />
      </Pressable>
    </View>
  );
};

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textTertiary,
          tabBarStyle: { backgroundColor: theme.colors.tabBar, borderTopColor: theme.colors.separator },
          tabBarLabelStyle: { fontFamily: theme.typography.caption.fontFamily, fontSize: 11 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home', 'home-outline') }} />
        <Tabs.Screen name="transactions" options={{ title: 'Transactions', tabBarIcon: icon('list', 'list-outline') }} />
        <Tabs.Screen name="accounts" options={{ title: 'Accounts', tabBarIcon: icon('card', 'card-outline') }} />
        <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: icon('pie-chart', 'pie-chart-outline') }} />
        <Tabs.Screen name="family" options={{ title: 'Family', tabBarIcon: icon('people', 'people-outline') }} />
      </Tabs>
      <AddTransactionButton />
    </View>
  );
}
