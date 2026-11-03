import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { formatDisplayDate, invitationSchema, toISODate, type InvitationFormValues } from '@family-finance/core';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Share, View } from 'react-native';
import { Button, Card, Screen, SegmentedControl, SelectField, Text, TextField } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { createInvitation, type CreatedInvitation } from '@/features/family/api';
import { useActiveFamily, useInvalidateFamily } from '@/features/family/hooks';

const ROLES = [
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'admin', label: 'Admin' },
] as const;

const ROLE_HELP = {
  member: 'Can add transactions, accounts and cards, and see family reports.',
  viewer: 'Can see shared family finances but cannot change anything.',
  admin: 'Full control, including inviting and removing members.',
} as const;

export default function Invite() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ memberId?: string }>();
  const { family, members } = useActiveFamily();
  const invalidate = useInvalidateFamily();
  const placeholders = members.filter((m) => !m.user_id);

  const { control, handleSubmit, watch, formState } = useForm<InvitationFormValues>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { email: '', role: 'member', memberId: params.memberId ?? null },
  });

  const create = useMutation<CreatedInvitation, Error, InvitationFormValues>({
    mutationFn: (values) =>
      createInvitation({ familyId: family.id, email: values.email.trim() || null, role: values.role, memberId: values.memberId }),
    onSuccess: async () => {
      await invalidate();
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const share = async (invite: CreatedInvitation) => {
    await Share.share({
      message: `Join ${family.name} on Family Finance: ${invite.link}\n\nThe link expires on ${formatDisplayDate(toISODate(new Date(invite.expiresAt)))}.`,
    });
  };

  if (create.data) {
    const invite = create.data;
    return (
      <Screen>
        <Card style={{ alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xxl }}>
          <Ionicons name="checkmark-circle" size={48} color={theme.colors.income} />
          <Text variant="title2" align="center">
            Invitation ready
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            {invite.emailSent
              ? 'We emailed the invitation. You can also share the link directly.'
              : 'Share this link with the person you are inviting. It works once and expires in 7 days.'}
          </Text>
        </Card>
        <Card>
          <Text variant="footnote" color="textSecondary" selectable>
            {invite.link}
          </Text>
        </Card>
        <Button label="Share link" icon="share-outline" onPress={() => void share(invite)} />
        <Button label="Done" variant="tertiary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const role = watch('role');
  return (
    <Screen>
      <Text variant="callout" color="textSecondary">
        Invite your spouse or another family member. They sign up (or sign in) and join {family.name}.
      </Text>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label="Their email (optional)"
            value={field.value}
            onChangeText={field.onChange}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            error={formState.errors.email?.message}
            helper="With an email, only that person can accept and they’ll also see it in the app. Leave blank for a link anyone you share it with can use."
          />
        )}
      />
      <Controller
        control={control}
        name="role"
        render={({ field }) => (
          <View style={{ gap: 6 }}>
            <Text variant="subhead" color="textSecondary">
              Role
            </Text>
            <SegmentedControl options={ROLES} value={field.value} onChange={field.onChange} />
            <Text variant="footnote" color="textTertiary">
              {ROLE_HELP[role]}
            </Text>
          </View>
        )}
      />
      {placeholders.length > 0 ? (
        <Controller
          control={control}
          name="memberId"
          render={({ field }) => (
            <SelectField
              label="Link to an existing member (optional)"
              value={field.value}
              onChange={field.onChange}
              allowClear
              clearLabel="No — add as a new member"
              placeholder="No — add as a new member"
              options={placeholders.map((m) => ({ value: m.id, label: m.display_name }))}
              helper="Their past transactions stay attached when they join."
            />
          )}
        />
      ) : null}
      <Button label="Create invitation" loading={create.isPending} onPress={handleSubmit((v) => create.mutate(v))} />
    </Screen>
  );
}
