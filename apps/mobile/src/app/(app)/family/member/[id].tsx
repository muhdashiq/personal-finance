import { MEMBER_RELATIONSHIPS, type FamilyRole } from '@family-finance/core';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Avatar, Button, ErrorState, Screen, SegmentedControl, SelectField, Text, TextField } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { confirm } from '@/stores/confirm';
import { toast } from '@/stores/toast';
import { removeMember, setMemberRole, updateMember } from '@/features/family/api';
import { useActiveFamily, useInvalidateFamily } from '@/features/family/hooks';
import { RELATIONSHIP_LABELS } from '@/features/family/labels';

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
] as const;

export default function MemberScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { allMembers, me, isAdmin } = useActiveFamily();
  const invalidate = useInvalidateFamily();
  const member = allMembers.find((m) => m.id === id);
  const [name, setName] = useState(member?.display_name ?? '');
  const [relationship, setRelationship] = useState(member?.relationship ?? 'other');

  const isMe = member?.id === me.id;
  const canEditProfile = isAdmin || isMe;

  const save = useMutation({
    mutationFn: () => updateMember(id, { display_name: name.trim(), relationship }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Saved');
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const role = useMutation({
    mutationFn: (r: FamilyRole) => setMemberRole(id, r),
    onSuccess: async () => {
      await invalidate();
      toast.success('Role updated');
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const remove = useMutation({
    mutationFn: () => removeMember(id),
    onSuccess: async () => {
      await invalidate();
      toast.show(isMe ? 'You left the family' : 'Member removed');
      router.replace('/');
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  if (!member) return <ErrorState message="This member no longer exists." />;

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Avatar name={member.display_name} color={member.color} size={72} />
        <Text variant="title2">{member.display_name}</Text>
        <Text variant="footnote" color="textSecondary">
          {member.user_id ? `${member.role[0]!.toUpperCase()}${member.role.slice(1)} · signed in member` : 'No login — added by an admin'}
        </Text>
      </View>

      {canEditProfile ? (
        <>
          <TextField label="Name" value={name} onChangeText={setName} maxLength={80} />
          {!isMe ? (
            <SelectField
              label="Relationship"
              value={relationship}
              onChange={(v) => setRelationship((v as typeof relationship) ?? 'other')}
              options={MEMBER_RELATIONSHIPS.map((r) => ({ value: r, label: RELATIONSHIP_LABELS[r] }))}
            />
          ) : null}
          <Button label="Save" variant="secondary" loading={save.isPending} disabled={!name.trim()} onPress={() => save.mutate()} />
        </>
      ) : null}

      {isAdmin && member.user_id && member.status === 'active' ? (
        <View style={{ gap: 6 }}>
          <Text variant="subhead" color="textSecondary">
            Role
          </Text>
          <SegmentedControl
            options={ROLES}
            value={member.role}
            onChange={async (r) => {
              if (r === member.role) return;
              const ok = await confirm({ title: `Make ${member.display_name} ${r === 'admin' ? 'an admin' : `a ${r}`}?`, confirmLabel: 'Change role' });
              if (ok) role.mutate(r);
            }}
          />
        </View>
      ) : null}

      {isAdmin && !member.user_id ? (
        <Button label={`Invite ${member.display_name} to sign in`} icon="mail-outline" onPress={() => router.push(`/family/invite?memberId=${member.id}`)} />
      ) : null}

      {(isAdmin || isMe) && member.status === 'active' ? (
        <Button
          label={isMe ? 'Leave family' : 'Remove from family'}
          variant="destructive"
          loading={remove.isPending}
          onPress={async () => {
            const ok = await confirm({
              title: isMe ? 'Leave this family?' : `Remove ${member.display_name}?`,
              message: isMe
                ? 'You will lose access to the family’s finances. Transactions you added stay with the family.'
                : 'They lose access immediately. Their past transactions stay in the family history.',
              confirmLabel: isMe ? 'Leave' : 'Remove',
              destructive: true,
            });
            if (ok) remove.mutate();
          }}
        />
      ) : null}
    </Screen>
  );
}
