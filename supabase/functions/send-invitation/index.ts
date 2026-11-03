/**
 * POST /functions/v1/send-invitation
 * Body: { invitationId: string, token: string }
 *
 * Emails an invitation that the caller (a family admin) has just created with
 * the create_invitation RPC. Email delivery is optional: without
 * RESEND_API_KEY the function answers { sent: false } and the app falls back
 * to sharing the link.
 *
 * Security:
 *  - The caller must be able to see the invitation through RLS (admins only).
 *  - The token must hash to the stored token_hash, so the function cannot be
 *    used to email arbitrary links.
 *  - The link in the email is built server-side; client input never ends up
 *    in the email body except the invitation's own family name.
 */
import { adminClient, userClient } from '../_shared/clients.ts';
import { corsHeaders, errorResponse, escapeHtml, json, log, sha256Hex } from '../_shared/http.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{48}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  const authorization = req.headers.get('Authorization');
  if (!authorization) return errorResponse(401, 'Not authenticated');

  let body: { invitationId?: unknown; token?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }
  const { invitationId, token } = body;
  if (typeof invitationId !== 'string' || !UUID.test(invitationId) || typeof token !== 'string' || !TOKEN.test(token)) {
    return errorResponse(400, 'invitationId and token are required');
  }

  try {
    // 1. Authorisation through RLS: only family admins can read their invitations.
    const asUser = userClient(authorization);
    const { data: invitation, error } = await asUser
      .from('family_invitations')
      .select('id, family_id, email, role, status, expires_at, invited_by')
      .eq('id', invitationId)
      .maybeSingle();
    if (error) throw error;
    if (!invitation || invitation.status !== 'pending') return errorResponse(404, 'Invitation not found');
    if (!invitation.email) return json({ sent: false, reason: 'no_email' });

    // 2. The token must belong to this invitation.
    const admin = adminClient();
    const { data: secret, error: secretError } = await admin
      .from('family_invitations')
      .select('token_hash')
      .eq('id', invitationId)
      .single();
    if (secretError) throw secretError;
    const storedHex = String(secret.token_hash).replace(/^\\x/, '').toLowerCase();
    if (storedHex !== (await sha256Hex(token))) return errorResponse(403, 'Token does not match invitation');

    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('INVITE_FROM_EMAIL');
    if (!apiKey || !from) {
      log('invitation_email_skipped', { reason: 'not_configured' });
      return json({ sent: false, reason: 'email_not_configured' });
    }

    const [{ data: family }, { data: inviter }] = await Promise.all([
      admin.from('families').select('name').eq('id', invitation.family_id).single(),
      admin.from('profiles').select('display_name').eq('id', invitation.invited_by).maybeSingle(),
    ]);
    const base = Deno.env.get('INVITE_BASE_URL')?.replace(/\/$/, '') ?? 'familyfinance:/';
    const link = `${base}/invite/${token}`;
    const familyName = escapeHtml(family?.name ?? 'a family');
    const inviterName = escapeHtml(inviter?.display_name ?? 'A family member');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [invitation.email],
        subject: `${inviter?.display_name ?? 'Someone'} invited you to ${family?.name ?? 'their family'} on Family Finance`,
        html: `<p>${inviterName} invited you to join <strong>${familyName}</strong> on Family Finance as ${escapeHtml(invitation.role)}.</p>
<p><a href="${escapeHtml(link)}">Accept the invitation</a></p>
<p>The link works once and expires on ${new Date(invitation.expires_at).toDateString()}. If you weren't expecting this, you can ignore this email.</p>`,
      }),
    });
    if (!response.ok) {
      log('invitation_email_failed', { status: response.status });
      return json({ sent: false, reason: 'provider_error' });
    }
    log('invitation_email_sent', { invitation: invitationId });
    return json({ sent: true });
  } catch (error) {
    log('invitation_email_error', { message: (error as Error).message.slice(0, 200) });
    return errorResponse(500, 'Could not send the invitation email');
  }
});
