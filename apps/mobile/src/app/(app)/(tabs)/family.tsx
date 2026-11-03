import { Ionicons } from '@expo/vector-icons';
import { formatDisplayDate, toISODate } from '@family-finance/core';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Avatar, Card, IconBadge, ListRow, Screen, Section, Text } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { confirm } from '@/stores/confirm';
import { usePreferences } from '@/stores/preferences';
import { toast } from '@/stores/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { respondToInvitation, revokeInvitation } from '@/features/family/api';
import { useActiveFamily, useFamilyInvitations, useInvalidateFamily, useMyInvitations } from '@/features/family/hooks';

const ROLE_LABEL = { admin: 'Admin', member: 'Member', viewer: 'Viewer' } as const;

const Soon = ({ phase }: { phase: number }) => {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.colors.surfaceSecondary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text variant="caption" color="textTertiary">
        Phase {phase}
      </Text>
    </View>
  );
};

export default function FamilyTab() {
  const theme = useTheme();
  const { family, families, members, allMembers, me, isAdmin } = useActiveFamily();
  const setActiveFamilyId = usePreferences((s) => s.setActiveFamilyId);
  const invitations = useFamilyInvitations();
  const myInvitations = useMyInvitations();
  const invalidate = useInvalidateFamily();

  const revoke = useMutation({
    mutationFn: revokeInvitation,
    onSuccess: async () => {
      toast.show('Invitation revoked');
      await invalidate();
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => respondToInvitation(id, accept),
    onSuccess: async (familyId, { accept }) => {
      await invalidate();
      if (accept) {
        setActiveFamilyId(familyId);
        toast.success('Joined family');
      }
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const otherInvites = (myInvitations.data ?? []).filter((i) => !families.some((f) => f.id === i.family_id));
  const removed = allMembers.filter((m) => m.status === 'removed');

  return (
    <Screen edgeTop bottomInset={72}>
      <Text variant="largeTitle" accessibilityRole="header">
        Family
      </Text>

      <Card style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="home" size={24} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title2">{family.name}</Text>
            <Text variant="footnote" color="textSecondary">
              {members.length} member{members.length === 1 ? '' : 's'} · {family.base_currency} · you are {ROLE_LABEL[me.role].toLowerCase()}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginLeft: 4 }}>
          {members.slice(0, 6).map((m, i) => (
            <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, borderWidth: 2, borderColor: theme.colors.surface, borderRadius: 20 }}>
              <Avatar name={m.display_name} color={m.color} size={32} />
            </View>
          ))}
        </View>
      </Card>

      {otherInvites.length > 0 ? (
        <Section title="Invitations for you">
          {otherInvites.map((inv) => (
            <ListRow
              key={inv.id}
              title={`Join another family as ${inv.role}`}
              subtitle={`Expires ${formatDisplayDate(toISODate(new Date(inv.expires_at)))}`}
              leading={<IconBadge icon="mail-unread-outline" color={theme.colors.secondary} ionicon />}
              onPress={async () => {
                const accept = await confirm({ title: 'Join this family?', message: 'You can belong to more than one family and switch between them.', confirmLabel: 'Join' });
                respond.mutate({ id: inv.id, accept });
              }}
            />
          ))}
        </Section>
      ) : null}

      <Section
        title="Members"
        action={
          isAdmin ? (
            <Text variant="subhead" color="primary" onPress={() => router.push('/family/add-member')} accessibilityRole="button">
              Add member
            </Text>
          ) : null
        }
      >
        {members.map((m) => (
          <ListRow
            key={m.id}
            title={m.id === me.id ? `${m.display_name} (you)` : m.display_name}
            subtitle={[ROLE_LABEL[m.role], m.relationship !== 'other' ? m.relationship : null, m.user_id ? null : 'No login yet'].filter(Boolean).join(' · ')}
            leading={<Avatar name={m.display_name} color={m.color} />}
            onPress={() => router.push(`/family/member/${m.id}`)}
          />
        ))}
        {isAdmin ? (
          <ListRow
            title="Invite someone"
            subtitle="Send a link to your spouse or family"
            leading={<IconBadge icon="person-add-outline" color={theme.colors.primary} ionicon />}
            onPress={() => router.push('/family/invite')}
          />
        ) : null}
      </Section>

      {isAdmin && invitations.data && invitations.data.length > 0 ? (
        <Section title="Pending invitations" footer="Invitation links expire after 7 days. Revoke a link if it was shared by mistake.">
          {invitations.data.map((inv) => (
            <ListRow
              key={inv.id}
              title={inv.email ?? 'Shareable link'}
              subtitle={`${ROLE_LABEL[inv.role]} · expires ${formatDisplayDate(toISODate(new Date(inv.expires_at)))}`}
              leading={<IconBadge icon="hourglass-outline" color={theme.colors.warning} ionicon />}
              trailing={
                <Text
                  variant="subhead"
                  color="danger"
                  accessibilityRole="button"
                  onPress={async () => {
                    if (await confirm({ title: 'Revoke invitation?', message: 'The link will stop working.', confirmLabel: 'Revoke', destructive: true })) {
                      revoke.mutate(inv.id);
                    }
                  }}
                >
                  Revoke
                </Text>
              }
              chevron={false}
            />
          ))}
        </Section>
      ) : null}

      {removed.length > 0 ? (
        <Section title="Former members" footer="Their past transactions stay in your history.">
          {removed.map((m) => (
            <ListRow key={m.id} title={m.display_name} subtitle="Removed" leading={<Avatar name={m.display_name} color={theme.colors.textTertiary} />} />
          ))}
        </Section>
      ) : null}

      <Section title="Manage">
        <ListRow title="Categories" subtitle="Rename, merge and add categories" leading={<IconBadge icon="pricetags-outline" color={theme.colors.secondary} ionicon />} onPress={() => router.push('/categories')} />
        <ListRow title="Settings" subtitle="Profile, theme, data export, account" leading={<IconBadge icon="settings-outline" color={theme.colors.textSecondary} ionicon />} onPress={() => router.push('/settings')} />
        {families.length > 1 ? (
          <ListRow
            title="Switch family"
            subtitle={`${families.length} families`}
            leading={<IconBadge icon="swap-horizontal" color={theme.colors.primary} ionicon />}
            onPress={() => router.push('/settings')}
          />
        ) : null}
      </Section>

      <Section title="Planning" footer="These modules are designed in the database and arrive in later phases.">
        <ListRow title="Budgets & alerts" leading={<IconBadge icon="speedometer-outline" color={theme.colors.textTertiary} ionicon />} trailing={<Soon phase={3} />} disabled chevron={false} />
        <ListRow title="Loans & EMIs" leading={<IconBadge icon="calendar-outline" color={theme.colors.textTertiary} ionicon />} trailing={<Soon phase={4} />} disabled chevron={false} />
        <ListRow title="Trips & events" leading={<IconBadge icon="airplane-outline" color={theme.colors.textTertiary} ionicon />} trailing={<Soon phase={5} />} disabled chevron={false} />
        <ListRow title="Investments" leading={<IconBadge icon="trending-up-outline" color={theme.colors.textTertiary} ionicon />} trailing={<Soon phase={5} />} disabled chevron={false} />
      </Section>
    </Screen>
  );
}
