import type { FamilyRole, MemberRelationship } from '@family-finance/core';
import * as Linking from 'expo-linking';
import { env } from '@/lib/env';
import { check, unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type Family = Pick<Tables<'families'>, 'id' | 'name' | 'base_currency' | 'created_at'>;
export type FamilyMember = Tables<'family_members'>;
export type Profile = Tables<'profiles'>;
export type Invitation = Pick<
  Tables<'family_invitations'>,
  'id' | 'family_id' | 'email' | 'role' | 'member_id' | 'status' | 'invited_by' | 'expires_at' | 'created_at'
>;

export const fetchFamilies = async (): Promise<Family[]> =>
  unwrap(await supabase.from('families').select('id, name, base_currency, created_at').order('created_at'));

export const fetchProfile = async (userId: string): Promise<Profile> =>
  unwrap(await supabase.from('profiles').select('*').eq('id', userId).single());

export const updateProfile = async (
  userId: string,
  patch: Partial<Pick<Profile, 'display_name' | 'default_family_id' | 'theme_preference'>>,
) => {
  check(await supabase.from('profiles').update(patch).eq('id', userId));
};

export const fetchMembers = async (familyId: string): Promise<FamilyMember[]> =>
  unwrap(
    await supabase
      .from('family_members')
      .select('*')
      .eq('family_id', familyId)
      .order('status')
      .order('created_at'),
  );

export const createFamily = async (input: { name: string; baseCurrency: string; displayName: string }): Promise<string> =>
  unwrap(
    await supabase.rpc('create_family', {
      p_name: input.name,
      p_base_currency: input.baseCurrency,
      p_member_display_name: input.displayName,
    }),
  );

export const renameFamily = async (familyId: string, name: string) => {
  check(await supabase.from('families').update({ name }).eq('id', familyId));
};

export const deleteFamily = async (familyId: string, confirmName: string) => {
  check(await supabase.rpc('delete_family', { p_family_id: familyId, p_confirm_name: confirmName }));
};

/** Builds the link shared with an invitee. */
export const invitationLink = (token: string): string =>
  env.inviteBaseUrl ? `${env.inviteBaseUrl.replace(/\/$/, '')}/invite/${token}` : Linking.createURL(`/invite/${token}`);

export type CreatedInvitation = { invitationId: string; token: string; link: string; expiresAt: string; emailSent: boolean };

export const createInvitation = async (input: {
  familyId: string;
  email: string | null;
  role: FamilyRole;
  memberId: string | null;
}): Promise<CreatedInvitation> => {
  const rows = unwrap(
    await supabase.rpc('create_invitation', {
      p_family_id: input.familyId,
      p_email: input.email ?? undefined,
      p_role: input.role,
      p_member_id: input.memberId ?? undefined,
    }),
  );
  const row = rows[0];
  if (!row) throw new Error('Invitation was not created');
  const link = invitationLink(row.token);

  // Email delivery is optional: it needs the send-invitation Edge Function
  // and an email provider. Without it, the admin shares the link manually.
  let emailSent = false;
  if (input.email) {
    const { data } = await supabase.functions.invoke<{ sent: boolean }>('send-invitation', {
      body: { invitationId: row.invitation_id, token: row.token },
    });
    emailSent = Boolean(data?.sent);
  }
  return { invitationId: row.invitation_id, token: row.token, link, expiresAt: row.expires_at, emailSent };
};

export const fetchFamilyInvitations = async (familyId: string): Promise<Invitation[]> =>
  unwrap(
    await supabase
      .from('family_invitations')
      .select('id, family_id, email, role, member_id, status, invited_by, expires_at, created_at')
      .eq('family_id', familyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  );

export type PendingInvitation = Invitation & { family_name: string | null };

/** Invitations addressed to the signed-in user's email. */
export const fetchMyInvitations = async (email: string): Promise<Invitation[]> =>
  unwrap(
    await supabase
      .from('family_invitations')
      .select('id, family_id, email, role, member_id, status, invited_by, expires_at, created_at')
      .eq('status', 'pending')
      .ilike('email', email)
      .gt('expires_at', new Date().toISOString()),
  );

export const previewInvitation = async (token: string) => {
  const rows = unwrap(await supabase.rpc('get_invitation_by_token', { p_token: token }));
  return rows[0] ?? null;
};

export const acceptInvitationToken = async (token: string): Promise<string> =>
  unwrap(await supabase.rpc('accept_invitation', { p_token: token }));

export const respondToInvitation = async (invitationId: string, accept: boolean): Promise<string> =>
  unwrap(await supabase.rpc('respond_to_invitation', { p_invitation_id: invitationId, p_accept: accept }));

export const revokeInvitation = async (invitationId: string) => {
  check(await supabase.rpc('revoke_invitation', { p_invitation_id: invitationId }));
};

export const addMember = async (input: {
  familyId: string;
  displayName: string;
  relationship: MemberRelationship;
  color: string;
}) => {
  check(
    await supabase.from('family_members').insert({
      family_id: input.familyId,
      display_name: input.displayName,
      relationship: input.relationship,
      color: input.color,
    }),
  );
};

export const updateMember = async (
  memberId: string,
  patch: { display_name?: string; relationship?: MemberRelationship; color?: string },
) => {
  check(await supabase.from('family_members').update(patch).eq('id', memberId));
};

export const setMemberRole = async (memberId: string, role: FamilyRole) => {
  check(await supabase.rpc('set_member_role', { p_member_id: memberId, p_role: role }));
};

export const removeMember = async (memberId: string) => {
  check(await supabase.rpc('remove_member', { p_member_id: memberId }));
};

export const exportFamilyData = async (familyId: string) =>
  unwrap(await supabase.rpc('export_family_data', { p_family_id: familyId }));
