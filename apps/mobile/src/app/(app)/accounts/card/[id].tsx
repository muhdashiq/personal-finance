import { useLocalSearchParams } from 'expo-router';
import { ErrorState, SkeletonCard } from '@/components/ui';
import { CreditCardForm } from '@/features/accounts/components/AccountFormScreen';
import { useAccounts } from '@/features/accounts/hooks';

export default function CreditCardScreen() {
  const { id = 'new' } = useLocalSearchParams<{ id: string }>();
  const accounts = useAccounts();
  if (id === 'new') return <CreditCardForm />;
  if (accounts.isLoading) return <SkeletonCard />;
  const card = accounts.data?.cards.find((c) => c.id === id);
  if (!card) return <ErrorState message="This card no longer exists." />;
  return <CreditCardForm card={card} />;
}
