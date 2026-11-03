import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFamilyFor, createTestDb, pgError, type TestDb, type TestUser } from './harness';

let db: TestDb;
let ashiq: TestUser;
let spouse: TestUser;
let stranger: TestUser;
let familyId: string;

beforeAll(async () => {
  db = await createTestDb();
  ashiq = await db.createUser('Ashiq');
  spouse = await db.createUser('Sara');
  stranger = await db.createUser('Stranger');
  ({ familyId } = await createFamilyFor(db, ashiq, "Ashiq's Family"));
});

afterAll(async () => {
  await db.close();
});

describe('profiles', () => {
  it('creates a profile for each new auth user using the display name metadata', async () => {
    const rows = await db.admin<{ display_name: string }>(`select display_name from profiles where id = $1`, [ashiq.id]);
    expect(rows[0]?.display_name).toBe('Ashiq');
  });
});

describe('create_family', () => {
  it('makes the creator an admin member and sets their default family', async () => {
    const [member] = await db.as(ashiq, (q) =>
      q<{ role: string; relationship: string }>(`select role, relationship from family_members where family_id = $1`, [familyId]),
    );
    expect(member).toEqual({ role: 'admin', relationship: 'self' });

    const [profile] = await db.as(ashiq, (q) =>
      q<{ default_family_id: string }>(`select default_family_id from profiles where id = $1`, [ashiq.id]),
    );
    expect(profile?.default_family_id).toBe(familyId);
  });

  it('seeds the default category tree for the family', async () => {
    const rows = await db.as(ashiq, (q) =>
      q<{ name: string; children: string[] }>(
        `select p.name, array_agg(c.name order by c.sort_order) as children
           from transaction_categories p
           left join transaction_categories c on c.parent_id = p.id
          where p.family_id = $1 and p.parent_id is null
          group by p.name, p.sort_order order by p.sort_order`,
        [familyId],
      ),
    );
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.children]));
    expect(Object.keys(byName)).toEqual(
      expect.arrayContaining(['Household', 'Food', 'Transportation', 'Family', 'Financial', 'Lifestyle', 'Salary']),
    );
    expect(byName.Household).toEqual(expect.arrayContaining(['Rent', 'Electricity', 'Groceries']));
    expect(byName.Food).toEqual(['Restaurants', 'Food delivery', 'Coffee', 'Snacks']);
  });

  it('rejects anonymous callers', async () => {
    const message = await pgError(db.admin(`set role anon; select public.create_family('x')`));
    expect(message).toMatch(/permission denied/);
    await db.admin('reset role');
  });
});

describe('invitations', () => {
  it('lets an admin invite by email and the invitee accept with the token', async () => {
    const [invite] = await db.as(ashiq, (q) =>
      q<{ invitation_id: string; token: string }>(`select * from create_invitation($1, $2, 'member')`, [
        familyId,
        spouse.email.toUpperCase(),
      ]),
    );
    expect(invite?.token).toMatch(/^[0-9a-f]{48}$/);

    // The plain token is never stored.
    const stored = await db.admin<{ token_hash: Buffer }>(`select token_hash from family_invitations where id = $1`, [
      invite!.invitation_id,
    ]);
    expect(stored[0]?.token_hash.toString('hex')).not.toContain(invite!.token);

    // The invitee sees it in their pending list.
    const pending = await db.as(spouse, (q) => q(`select id from family_invitations where status = 'pending'`));
    expect(pending).toHaveLength(1);

    const [preview] = await db.as(spouse, (q) =>
      q<{ family_name: string; invited_by_name: string }>(`select * from get_invitation_by_token($1)`, [invite!.token]),
    );
    expect(preview).toMatchObject({ family_name: "Ashiq's Family", invited_by_name: 'Ashiq' });

    // A different person cannot use an email-bound invitation.
    const wrongUser = await pgError(db.as(stranger, (q) => q(`select accept_invitation($1)`, [invite!.token])));
    expect(wrongUser).toMatch(/different email/);

    await db.as(spouse, (q) => q(`select accept_invitation($1)`, [invite!.token]));

    const members = await db.as(spouse, (q) =>
      q<{ display_name: string; role: string }>(
        `select display_name, role from family_members where family_id = $1 order by display_name`,
        [familyId],
      ),
    );
    expect(members).toEqual([
      { display_name: 'Ashiq', role: 'admin' },
      { display_name: 'Sara', role: 'member' },
    ]);

    // Accepted invitations cannot be reused.
    const reused = await pgError(db.as(stranger, (q) => q(`select accept_invitation($1)`, [invite!.token])));
    expect(reused).toMatch(/no longer valid|different email/);
  });

  it('notifies the inviter family when someone joins', async () => {
    const notes = await db.as(ashiq, (q) => q<{ kind: string }>(`select kind from notifications`));
    expect(notes.map((n) => n.kind)).toContain('member_joined');
  });

  it('does not let non-admins invite', async () => {
    const message = await pgError(db.as(spouse, (q) => q(`select * from create_invitation($1, null, 'member')`, [familyId])));
    expect(message).toMatch(/Only family admins/);
  });

  it('supports link invitations that claim an existing member profile', async () => {
    const [kid] = await db.as(ashiq, (q) =>
      q<{ id: string }>(
        `insert into family_members (family_id, display_name, relationship) values ($1, 'Ayaan', 'child') returning id`,
        [familyId],
      ),
    );
    const [invite] = await db.as(ashiq, (q) =>
      q<{ token: string }>(`select * from create_invitation($1, null, 'viewer', $2)`, [familyId, kid!.id]),
    );
    const kidUser = await db.createUser('Ayaan Login');
    await db.as(kidUser, (q) => q(`select accept_invitation($1)`, [invite!.token]));

    const [claimed] = await db.admin<{ user_id: string; role: string; display_name: string }>(
      `select user_id, role, display_name from family_members where id = $1`,
      [kid!.id],
    );
    expect(claimed).toEqual({ user_id: kidUser.id, role: 'viewer', display_name: 'Ayaan' });

    // Viewers are read-only.
    const message = await pgError(
      db.as(kidUser, (q) =>
        q(
          `insert into transactions (family_id, type, title, amount, currency, occurred_on, spent_by_member_id, created_by)
           values ($1, 'expense', 'Toy', 100, 'INR', current_date, $2, $3)`,
          [familyId, kid!.id, kidUser.id],
        ),
      ),
    );
    expect(message).toMatch(/row-level security/);
  });

  it('rejects expired and revoked invitations', async () => {
    const someone = await db.createUser('Late Comer');
    const [expired] = await db.as(ashiq, (q) =>
      q<{ invitation_id: string; token: string }>(`select * from create_invitation($1, null)`, [familyId]),
    );
    await db.admin(`update family_invitations set expires_at = now() - interval '1 minute' where id = $1`, [
      expired!.invitation_id,
    ]);
    expect(await pgError(db.as(someone, (q) => q(`select accept_invitation($1)`, [expired!.token])))).toMatch(/expired/);

    const [revoked] = await db.as(ashiq, (q) =>
      q<{ invitation_id: string; token: string }>(`select * from create_invitation($1, null)`, [familyId]),
    );
    await db.as(ashiq, (q) => q(`select revoke_invitation($1)`, [revoked!.invitation_id]));
    expect(await pgError(db.as(someone, (q) => q(`select accept_invitation($1)`, [revoked!.token])))).toMatch(
      /no longer valid/,
    );
  });

  it('lets an invitee decline an email invitation', async () => {
    const invitee = await db.createUser('Decliner');
    const [invite] = await db.as(ashiq, (q) =>
      q<{ invitation_id: string }>(`select * from create_invitation($1, $2)`, [familyId, invitee.email]),
    );
    await db.as(invitee, (q) => q(`select respond_to_invitation($1, false)`, [invite!.invitation_id]));
    const [row] = await db.admin<{ status: string }>(`select status from family_invitations where id = $1`, [
      invite!.invitation_id,
    ]);
    expect(row?.status).toBe('declined');
    const families = await db.as(invitee, (q) => q(`select id from families`));
    expect(families).toHaveLength(0);
  });
});

describe('roles and membership', () => {
  it('prevents members from changing their own role directly', async () => {
    const message = await pgError(
      db.as(spouse, (q) => q(`update family_members set role = 'admin' where user_id = $1`, [spouse.id])),
    );
    expect(message).toMatch(/permission denied/);
  });

  it('lets members edit their own display name', async () => {
    await db.as(spouse, (q) => q(`update family_members set display_name = 'Sara A' where user_id = $1`, [spouse.id]));
    const [row] = await db.admin<{ display_name: string }>(`select display_name from family_members where user_id = $1`, [
      spouse.id,
    ]);
    expect(row?.display_name).toBe('Sara A');
  });

  it('keeps at least one admin', async () => {
    const [me] = await db.admin<{ id: string }>(`select id from family_members where user_id = $1`, [ashiq.id]);
    expect(await pgError(db.as(ashiq, (q) => q(`select set_member_role($1, 'member')`, [me!.id])))).toMatch(
      /at least one admin/,
    );
    expect(await pgError(db.as(ashiq, (q) => q(`select remove_member($1)`, [me!.id])))).toMatch(/last admin/);
  });

  it('lets an admin promote a member, and a removed member loses access', async () => {
    const [sara] = await db.admin<{ id: string }>(`select id from family_members where user_id = $1`, [spouse.id]);
    await db.as(ashiq, (q) => q(`select set_member_role($1, 'admin')`, [sara!.id]));
    await db.as(ashiq, (q) => q(`select set_member_role($1, 'member')`, [sara!.id]));

    const leaver = await db.createUser('Leaver');
    const [invite] = await db.as(ashiq, (q) => q<{ token: string }>(`select * from create_invitation($1, null)`, [familyId]));
    await db.as(leaver, (q) => q(`select accept_invitation($1)`, [invite!.token]));
    expect(await db.as(leaver, (q) => q(`select id from families`))).toHaveLength(1);

    const [leaverMember] = await db.admin<{ id: string }>(`select id from family_members where user_id = $1`, [leaver.id]);
    await db.as(leaver, (q) => q(`select remove_member($1)`, [leaverMember!.id]));
    expect(await db.as(leaver, (q) => q(`select id from families`))).toHaveLength(0);
  });

  it('records membership changes in the audit log, readable by admins only', async () => {
    const adminView = await db.as(ashiq, (q) =>
      q<{ entity_type: string }>(`select entity_type from audit_logs where family_id = $1`, [familyId]),
    );
    expect(adminView.map((r) => r.entity_type)).toEqual(expect.arrayContaining(['family_members', 'family_invitations']));

    const memberView = await db.as(spouse, (q) => q(`select id from audit_logs`));
    expect(memberView).toHaveLength(0);
  });
});

describe('account deletion (as performed by the delete-account Edge Function)', () => {
  it('detaches the member, deletes the login, and keeps the family’s transactions', async () => {
    const owner = await db.createUser('Leaving Admin');
    const partner = await db.createUser('Staying Partner');
    const { familyId: fam, memberId } = await createFamilyFor(db, owner, 'Shared Home');
    const [invite] = await db.as(owner, (q) => q<{ token: string }>(`select * from create_invitation($1, null, 'admin')`, [fam]));
    await db.as(partner, (q) => q(`select accept_invitation($1)`, [invite!.token]));
    const [txn] = await db.as(owner, (q) =>
      q<{ id: string }>(
        `insert into transactions (family_id, type, title, amount, currency, occurred_on, spent_by_member_id, created_by)
         values ($1, 'expense', 'Groceries', 1500, 'INR', current_date, $2, $3) returning id`,
        [fam, memberId, owner.id],
      ),
    );

    // Edge Function steps, run with service-level privileges.
    await db.admin(`update family_members set status = 'removed', role = 'member' where user_id = $1`, [owner.id]);
    await db.admin(`delete from auth.users where id = $1`, [owner.id]);

    const [row] = await db.as(partner, (q) =>
      q<{ created_by: string | null; spent_by_member_id: string }>(`select created_by, spent_by_member_id from transactions where id = $1`, [txn!.id]),
    );
    expect(row).toEqual({ created_by: null, spent_by_member_id: memberId });
    const [member] = await db.admin<{ user_id: string | null; status: string }>(`select user_id, status from family_members where id = $1`, [memberId]);
    expect(member).toEqual({ user_id: null, status: 'removed' });
  });
});

describe('delete_family', () => {
  it('requires the exact family name and admin rights, then removes everything', async () => {
    const owner = await db.createUser('Temp Owner');
    const { familyId: tempFamily } = await createFamilyFor(db, owner, 'Temp Family');

    expect(await pgError(db.as(owner, (q) => q(`select delete_family($1, 'Wrong')`, [tempFamily])))).toMatch(/does not match/);
    await db.as(owner, (q) => q(`select delete_family($1, 'Temp Family')`, [tempFamily]));

    const left = await db.admin(`select 1 from transaction_categories where family_id = $1`, [tempFamily]);
    expect(left).toHaveLength(0);
  });
});
