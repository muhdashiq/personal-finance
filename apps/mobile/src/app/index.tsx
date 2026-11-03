import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';

export default function Index() {
  const { session } = useAuth();
  return <Redirect href={session ? '/(app)/(tabs)' : '/sign-in'} />;
}
