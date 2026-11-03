import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { ErrorState } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { ActiveFamilyProvider, useFamilies } from '@/features/family/hooks';
import { useOutboxSync } from '@/features/transactions/hooks';

const Loading = () => {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
};

const AuthenticatedApp = () => {
  const theme = useTheme();
  const families = useFamilies();
  useOutboxSync();

  if (families.isLoading) return <Loading />;
  if (families.error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ErrorState message={families.error.message} onRetry={() => void families.refetch()} />
      </View>
    );
  }
  if (!families.data?.length) return <Redirect href="/onboarding" />;

  const modal = { presentation: 'modal' as const };
  return (
    <ActiveFamilyProvider families={families.data} fallback={<Loading />}>
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTintColor: theme.colors.primary,
          headerTitleStyle: { fontFamily: theme.typography.headline.fontFamily, color: theme.colors.text },
          headerStyle: { backgroundColor: theme.colors.background },
          contentStyle: { backgroundColor: theme.colors.background },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="transaction/new" options={{ ...modal, title: 'New transaction' }} />
        <Stack.Screen name="transaction/[id]" options={{ title: 'Transaction' }} />
        <Stack.Screen name="transaction/edit/[id]" options={{ ...modal, title: 'Edit transaction' }} />
        <Stack.Screen name="accounts/bank/[id]" options={{ ...modal, title: 'Bank account' }} />
        <Stack.Screen name="accounts/card/[id]" options={{ ...modal, title: 'Credit card' }} />
        <Stack.Screen name="categories/index" options={{ title: 'Categories' }} />
        <Stack.Screen name="categories/[id]" options={{ ...modal, title: 'Category' }} />
        <Stack.Screen name="family/invite" options={{ ...modal, title: 'Invite to family' }} />
        <Stack.Screen name="family/add-member" options={{ ...modal, title: 'Add family member' }} />
        <Stack.Screen name="family/member/[id]" options={{ title: 'Member' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </ActiveFamilyProvider>
  );
};

export default function AppLayout() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/sign-in" />;
  return <AuthenticatedApp />;
}
