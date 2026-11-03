import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { familySchema, type FamilyFormValues } from '@family-finance/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Screen, SelectField, Text, TextField } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { qk } from '@/lib/queryKeys';
import { usePreferences } from '@/stores/preferences';
import { toast } from '@/stores/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { signOut } from '@/features/auth/api';
import { createFamily, fetchFamilies, fetchProfile, respondToInvitation } from '@/features/family/api';
import { useMyInvitations } from '@/features/family/hooks';

const CURRENCIES = [
  { value: 'INR', label: 'Indian Rupee (₹)' },
  { value: 'USD', label: 'US Dollar ($)' },
  { value: 'EUR', label: 'Euro (€)' },
  { value: 'GBP', label: 'British Pound (£)' },
  { value: 'AED', label: 'UAE Dirham (AED)' },
  { value: 'SGD', label: 'Singapore Dollar (S$)' },
  { value: 'AUD', label: 'Australian Dollar (A$)' },
  { value: 'CAD', label: 'Canadian Dollar (C$)' },
];

const extractToken = (input: string): string | null => {
  const match = /([0-9a-f]{48})/i.exec(input.trim());
  return match ? match[1]!.toLowerCase() : null;
};

/** First run: create a family, accept a pending invitation, or open an invite link. */
export default function Onboarding() {
  const theme = useTheme();
  const { session, user } = useAuth();
  const queryClient = useQueryClient();
  const setActiveFamilyId = usePreferences((s) => s.setActiveFamilyId);
  const [inviteInput, setInviteInput] = useState('');

  const families = useQuery({ queryKey: qk.families(user?.id ?? 'anon'), queryFn: fetchFamilies, enabled: Boolean(user) });
  const profile = useQuery({ queryKey: qk.profile(user?.id ?? 'anon'), queryFn: () => fetchProfile(user!.id), enabled: Boolean(user) });
  const invitations = useMyInvitations();

  const { control, handleSubmit, formState } = useForm<FamilyFormValues>({
    resolver: zodResolver(familySchema),
    values: {
      name: profile.data ? `${profile.data.display_name.split(' ')[0]}'s Family` : '',
      baseCurrency: 'INR',
      displayName: profile.data?.display_name ?? '',
    },
  });

  const enterFamily = async (familyId: string) => {
    setActiveFamilyId(familyId);
    await queryClient.invalidateQueries({ queryKey: ['families'] });
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    router.replace('/(app)/(tabs)');
  };

  const create = useMutation({
    mutationFn: createFamily,
    onSuccess: async (familyId) => {
      toast.success('Family created');
      await enterFamily(familyId);
    },
    onError: (error) => toast.error(toAppError(error).message),
  });

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => respondToInvitation(id, accept),
    onSuccess: async (familyId, { accept }) => {
      if (accept) {
        toast.success('Welcome to the family!');
        await enterFamily(familyId);
      } else {
        await queryClient.invalidateQueries({ queryKey: ['invitations'] });
      }
    },
    onError: (error) => toast.error(toAppError(error).message),
  });

  if (!session) return <Redirect href="/sign-in" />;
  if (families.data && families.data.length > 0 && !create.isPending) return <Redirect href="/(app)/(tabs)" />;
  if (families.isLoading || profile.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const token = extractToken(inviteInput);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edgeTop contentStyle={{ paddingTop: 40, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
        <View style={{ gap: 6 }}>
          <Text variant="largeTitle">Set up your family</Text>
          <Text variant="callout" color="textSecondary">
            Everyone in a family shares one place for expenses, accounts and reports — with private items kept private.
          </Text>
        </View>

        {invitations.data && invitations.data.length > 0 ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="title3">You’ve been invited</Text>
            {invitations.data.map((inv) => (
              <Card key={inv.id} style={{ gap: theme.spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="mail-open-outline" size={22} color={theme.colors.primary} />
                  <Text variant="headline" style={{ flex: 1 }}>
                    Join as {inv.role}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button label="Decline" variant="secondary" size="md" onPress={() => respond.mutate({ id: inv.id, accept: false })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Accept" size="md" loading={respond.isPending} onPress={() => respond.mutate({ id: inv.id, accept: true })} />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        <Card style={{ gap: theme.spacing.md }}>
          <Text variant="title3">Create a new family</Text>
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <TextField label="Family name" value={field.value} onChangeText={field.onChange} error={formState.errors.name?.message} />
            )}
          />
          <Controller
            control={control}
            name="displayName"
            render={({ field }) => (
              <TextField label="Your name in the family" value={field.value} onChangeText={field.onChange} error={formState.errors.displayName?.message} />
            )}
          />
          <Controller
            control={control}
            name="baseCurrency"
            render={({ field }) => (
              <SelectField
                label="Main currency"
                value={field.value}
                options={CURRENCIES}
                onChange={(v) => field.onChange(v ?? 'INR')}
                helper="Reports are calculated in this currency."
              />
            )}
          />
          <Button label="Create family" loading={create.isPending} onPress={handleSubmit((v) => create.mutate(v))} />
        </Card>

        <Card style={{ gap: theme.spacing.md }}>
          <Text variant="title3">Have an invitation link?</Text>
          <TextField
            label="Paste the link you received"
            value={inviteInput}
            onChangeText={setInviteInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="familyfinance://invite/…"
          />
          <Button label="Open invitation" variant="secondary" disabled={!token} onPress={() => token && router.push(`/invite/${token}`)} />
        </Card>

        <Button label="Sign out" variant="tertiary" onPress={() => void signOut()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
