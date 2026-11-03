/**
 * POST /functions/v1/delete-account
 *
 * Deletes the calling user's account.
 *  - Refuses if the user is the only admin of a family that still has other
 *    signed-in members (they must hand over admin first).
 *  - Families where the user is the only signed-in member are deleted with
 *    all their data.
 *  - In shared families the user's membership is marked removed; the
 *    transactions they recorded stay with the family (created_by becomes NULL).
 */
import { adminClient, userClient } from '../_shared/clients.ts';
import { corsHeaders, errorResponse, json, log } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  const authorization = req.headers.get('Authorization');
  if (!authorization) return errorResponse(401, 'Not authenticated');

  try {
    const { data: auth, error: authError } = await userClient(authorization).auth.getUser();
    if (authError || !auth.user) return errorResponse(401, 'Not authenticated');
    const userId = auth.user.id;

    const admin = adminClient();
    const { data: memberships, error } = await admin
      .from('family_members')
      .select('id, family_id, role')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (error) throw error;

    const toDelete: string[] = [];
    for (const m of memberships ?? []) {
      const { data: others, error: othersError } = await admin
        .from('family_members')
        .select('id, role')
        .eq('family_id', m.family_id)
        .eq('status', 'active')
        .not('user_id', 'is', null)
        .neq('user_id', userId);
      if (othersError) throw othersError;

      if (!others?.length) {
        toDelete.push(m.family_id);
      } else if (m.role === 'admin' && !others.some((o) => o.role === 'admin')) {
        return errorResponse(409, 'You are the only admin of a family with other members. Make someone else an admin first.');
      }
    }

    for (const familyId of toDelete) {
      const { error: deleteError } = await admin.from('families').delete().eq('id', familyId);
      if (deleteError) throw deleteError;
    }

    // Admins must have a login, so demote before the login disappears.
    const { error: detachError } = await admin
      .from('family_members')
      .update({ status: 'removed', role: 'member' })
      .eq('user_id', userId);
    if (detachError) throw detachError;

    const { error: userError } = await admin.auth.admin.deleteUser(userId);
    if (userError) throw userError;

    log('account_deleted', { families_deleted: toDelete.length });
    return json({ deleted: true });
  } catch (error) {
    log('account_delete_error', { message: (error as Error).message.slice(0, 200) });
    return errorResponse(500, 'Could not delete the account. Please try again.');
  }
});
