import { Ionicons } from '@expo/vector-icons';
import { formatDisplayDate, toISODate } from '@family-finance/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Card, EmptyState, Screen, Text } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { qk } from '@/lib/queryKeys';
import { usePendingInvite } from '@/stores/pendingInvite';
import { usePreferences } from '@/stores/preferences';
import { toast } from '@/stores/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { acceptInvitationToken, previewInvitation } from '@/features/family/api';

const ROLE_COPY: Record<string, string> = {
  admin: 'You’ll be able to manage members and everything else.',
  member: 'You’ll be able to add transactions, accounts and view family reports.',
  viewer: 'You’ll be able to view family finances, but not change them.',
};

export default function InviteScreen() {
  const theme = useTheme();
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();
  const setPending = usePendingInvite((s) => s.setToken);
  const setActiveFamilyId = usePreferences((s) => s.setActiveFamilyId);
  const queryClient = useQueryClient();
  const validToken = /^[0-9a-f]{48}$/i.test(token);

  useEffect(() => {
    if (!session && validToken) setPending(token);
  }, [session, token, validToken, setPending]);

  const preview = useQuery({
    queryKey: qk.invitationPreview(token),
    queryFn: () => previewInvitation(token),
    enabled: Boolean(session) && validToken,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => acceptInvitationToken(token),
    onSuccess: async (familyId) => {
      setPending(null);
      setActiveFamilyId(familyId);
      await queryClient.invalidateQueries();
      toast.success('Welcome to the family!');
      router.replace('/(app)/(tabs)');
    },
    onError: (error) => toast.error(toAppError(error).message),
  });

  const close = () => {
    setPending(null);
    router.replace('/');
  };

  if (!validToken) {
    return (
      <Screen edgeTop>
        <EmptyState icon="alert-circle-outline" title="Invalid invitation link" message="Ask the family admin to send you a new link." actionLabel="Close" onAction={close} />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen edgeTop contentStyle={{ paddingTop: 64 }}>
        <EmptyState
          icon="people-outline"
          title="You’ve been invited to a family"
          message="Sign in or create an account to accept the invitation."
          actionLabel="Continue"
          onAction={() => router.replace('/sign-in')}
        />
      </Screen>
    );
  }

  if (preview.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const invite = preview.data;
  if (!invite || invite.status !== 'pending' || invite.is_expired) {
    const message = !invite
      ? 'This invitation could not be found.'
      : invite.is_expired
        ? 'This invitation has expired.'
        : invite.status === 'accepted'
          ? 'This invitation has already been used.'
          : 'This invitation is no longer valid.';
    return (
      <Screen edgeTop contentStyle={{ paddingTop: 64 }}>
        <EmptyState icon="time-outline" title="Invitation unavailable" message={`${message} Ask the family admin for a new one.`} actionLabel="Close" onAction={close} />
      </Screen>
    );
  }

  return (
    <Screen edgeTop contentStyle={{ paddingTop: 48, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
      <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="people" size={34} color={theme.colors.primary} />
        </View>
        <Text variant="title1" align="center">
          Join {invite.family_name}
        </Text>
        <Text variant="callout" color="textSecondary" align="center">
          {invite.invited_by_name ?? 'A family admin'} invited you as {invite.role === 'admin' ? 'an admin' : `a ${invite.role}`}.
        </Text>
      </View>
      <Card style={{ gap: 6 }}>
        <Text variant="body">{ROLE_COPY[invite.role]}</Text>
        <Text variant="footnote" color="textTertiary">
          Expires {formatDisplayDate(toISODate(new Date(invite.expires_at)))}
          {invite.email ? ` · sent to ${invite.email}` : ''}
        </Text>
      </Card>
      <Button label="Accept invitation" loading={accept.isPending} onPress={() => accept.mutate()} />
      <Button label="Not now" variant="tertiary" onPress={close} />
    </Screen>
  );
}
