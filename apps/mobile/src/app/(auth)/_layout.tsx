import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePendingInvite } from '@/stores/pendingInvite';
import { useTheme } from '@/theme/ThemeProvider';

export default function AuthLayout() {
  const { session } = useAuth();
  const pendingInvite = usePendingInvite((s) => s.token);
  const theme = useTheme();
  if (session) return <Redirect href={pendingInvite ? `/invite/${pendingInvite}` : '/'} />;
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTitle: '',
        headerTransparent: true,
        headerTintColor: theme.colors.primary,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
    </Stack>
  );
}
