import { useLocalSearchParams } from 'expo-router';
import { ErrorState, SkeletonCard } from '@/components/ui';
import { BankAccountForm } from '@/features/accounts/components/AccountFormScreen';
import { useAccounts } from '@/features/accounts/hooks';

export default function BankAccountScreen() {
  const { id = 'new' } = useLocalSearchParams<{ id: string }>();
  const accounts = useAccounts();
  if (id === 'new') return <BankAccountForm />;
  if (accounts.isLoading) return <SkeletonCard />;
  const account = accounts.data?.banks.find((b) => b.id === id);
  if (!account) return <ErrorState message="This account no longer exists." />;
  return <BankAccountForm account={account} />;
}
