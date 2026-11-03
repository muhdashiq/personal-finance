import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryId, createFamilyFor, createTestDb, pgError, type TestDb, type TestUser } from './harness';

/**
 * Family-level data isolation: nothing belonging to family A is visible to,
 * or writable by, a member of family B — through tables, RPCs or storage.
 */
let db: TestDb;
let alice: TestUser;
let bob: TestUser;
let famA: { familyId: string; memberId: string };
let famB: { familyId: string; memberId: string };
let accountA: string;
let cardA: string;
let txnA: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await db.createUser('Alice');
  bob = await db.createUser('Bob');
  famA = await createFamilyFor(db, alice);
  famB = await createFamilyFor(db, bob);

  await db.as(alice, async (q) => {
    const [acc] = await q<{ id: string }>(
      `insert into bank_accounts (family_id, owner_member_id, bank_name, nickname, last4, opening_balance, created_by)
       values ($1, $2, 'HDFC Bank', 'Salary', '1234', 50000, $3) returning id`,
      [famA.familyId, famA.memberId, alice.id],
    );
    accountA = acc!.id;
    const [card] = await q<{ id: string }>(
      `insert into credit_cards (family_id, owner_member_id, issuer, nickname, last4, credit_limit, created_by)
       values ($1, $2, 'ICICI Bank', 'Amazon Pay', '9876', 200000, $3) returning id`,
      [famA.familyId, famA.memberId, alice.id],
    );
    cardA = card!.id;
    const [txn] = await q<{ id: string }>(
      `insert into transactions (family_id, type, title, amount, currency, occurred_on, spent_by_member_id, bank_account_id, created_by)
       values ($1, 'expense', 'Groceries', 2500, 'INR', current_date, $2, $3, $4) returning id`,
      [famA.familyId, famA.memberId, accountA, alice.id],
    );
    txnA = txn!.id;
  });
});

afterAll(async () => {
  await db.close();
});

describe('reads across families', () => {
  const tables = [
    'families',
    'family_members',
    'family_invitations',
    'bank_accounts',
    'credit_cards',
    'transactions',
    'transaction_categories',
    'tags',
    'transaction_rules',
    'recurring_transactions',
    'statement_imports',
    'imported_statement_transactions',
    'transaction_matches',
    'loans',
    'emi_schedules',
    'budgets',
    'budget_categories',
    'trips',
    'trip_members',
    'investments',
    'investment_transactions',
    'investment_valuations',
    'attachments',
    'audit_logs',
  ];

  it.each(tables)('%s: Bob sees nothing from Alice’s family', async (table) => {
    const column = table === 'families' ? 'id' : 'family_id';
    const rows = await db.as(bob, (q) => q(`select 1 from ${table} where ${column} = $1`, [famA.familyId]));
    expect(rows).toHaveLength(0);
  });

  it('Bob only sees his own profile and family', async () => {
    const profiles = await db.as(bob, (q) => q<{ id: string }>(`select id from profiles`));
    expect(profiles.map((p) => p.id)).toEqual([bob.id]);
    const families = await db.as(bob, (q) => q<{ id: string }>(`select id from families`));
    expect(families.map((f) => f.id)).toEqual([famB.familyId]);
  });

  it('reporting RPCs return nothing for another family', async () => {
    const balances = await db.as(bob, (q) => q(`select * from get_account_balances($1)`, [famA.familyId]));
    expect(balances).toHaveLength(0);

    const [summary] = await db.as(bob, (q) =>
      q(`select * from get_cashflow_summary($1, current_date - 30, current_date)`, [famA.familyId]),
    );
    expect(summary).toBeUndefined();

    const categories = await db.as(bob, (q) =>
      q(`select * from get_category_spending($1, current_date - 30, current_date)`, [famA.familyId]),
    );
    expect(categories).toHaveLength(0);

    const members = await db.as(bob, (q) => q(`select * from get_member_spending($1, current_date - 30, current_date)`, [famA.familyId]));
    expect(members).toHaveLength(0);

    const [exported] = await db.as(bob, (q) => q<{ data: unknown }>(`select export_family_data($1) as data`, [famA.familyId]));
    expect(exported?.data).toBeNull();
  });
});

describe('writes across families', () => {
  it('Bob cannot insert a transaction into Alice’s family', async () => {
    const message = await pgError(
      db.as(bob, (q) =>
        q(
          `insert into transactions (family_id, type, title, amount, currency, occurred_on, spent_by_member_id, created_by)
           values ($1, 'expense', 'Sneaky', 1, 'INR', current_date, $2, $3)`,
          [famA.familyId, famA.memberId, bob.id],
        ),
      ),
    );
    expect(message).toMatch(/row-level security/);
  });

  it('Bob cannot point his own transaction at Alice’s account, member or category', async () => {
    const foodA = await categoryId(db, famA.familyId, 'Food');
    const attempts: Array<[string, string]> = [
      ['bank_account_id', accountA],
      ['credit_card_id', cardA],
      ['category_id', foodA],
    ];
    for (const [column, value] of attempts) {
      const message = await pgError(
        db.as(bob, (q) =>
          q(
            `insert into transactions (family_id, type, title, amount, currency, occurred_on, spent_by_member_id, created_by, ${column})
             values ($1, 'expense', 'Cross', 1, 'INR', current_date, $2, $3, $4)`,
            [famB.familyId, famB.memberId, bob.id, value],
          ),
        ),
      );
      expect(message).toMatch(/foreign key|violates/);
    }

    const memberMessage = await pgError(
      db.as(bob, (q) =>
        q(
          `insert into transactions (family_id, type, title, amount, currency, occurred_on, spent_by_member_id, created_by)
           values ($1, 'expense', 'Cross', 1, 'INR', current_date, $2, $3)`,
          [famB.familyId, famA.memberId, bob.id],
        ),
      ),
    );
    expect(memberMessage).toMatch(/foreign key/);
  });

  it('Bob cannot update or delete Alice’s rows', async () => {
    const updated = await db.as(bob, (q) => q(`update transactions set amount = 1 where id = $1 returning id`, [txnA]));
    expect(updated).toHaveLength(0);
    const deleted = await db.as(bob, (q) => q(`delete from bank_accounts where id = $1 returning id`, [accountA]));
    expect(deleted).toHaveLength(0);
    const renamed = await db.as(bob, (q) => q(`update families set name = 'Hacked' where id = $1 returning id`, [famA.familyId]));
    expect(renamed).toHaveLength(0);
  });

  it('a user cannot impersonate another creator', async () => {
    const message = await pgError(
      db.as(alice, (q) =>
        q(
          `insert into transactions (family_id, type, title, amount, currency, occurred_on, spent_by_member_id, created_by)
           values ($1, 'expense', 'Spoof', 1, 'INR', current_date, $2, $3)`,
          [famA.familyId, famA.memberId, bob.id],
        ),
      ),
    );
    expect(message).toMatch(/row-level security/);
  });

  it('clients cannot mark a manual transaction as imported', async () => {
    const message = await pgError(
      db.as(alice, (q) =>
        q(
          `insert into transactions (family_id, type, title, amount, currency, occurred_on, spent_by_member_id, created_by, source)
           values ($1, 'expense', 'Fake import', 1, 'INR', current_date, $2, $3, 'statement_import')`,
          [famA.familyId, famA.memberId, alice.id],
        ),
      ),
    );
    expect(message).toMatch(/permission denied/);
  });

  it('Bob cannot upload files into Alice’s family folder', async () => {
    const message = await pgError(
      db.as(bob, (q) =>
        q(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${famA.familyId}/receipt.jpg`]),
      ),
    );
    expect(message).toMatch(/row-level security/);

    await db.as(alice, (q) =>
      q(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${famA.familyId}/receipt.jpg`]),
    );
    const visibleToBob = await db.as(bob, (q) => q(`select 1 from storage.objects where bucket_id = 'receipts'`));
    expect(visibleToBob).toHaveLength(0);
  });

  it('only stores the last four digits of account numbers', async () => {
    const message = await pgError(
      db.as(alice, (q) =>
        q(
          `insert into bank_accounts (family_id, owner_member_id, bank_name, nickname, last4, created_by)
           values ($1, $2, 'SBI', 'Full number', '123456789012', $3)`,
          [famA.familyId, famA.memberId, alice.id],
        ),
      ),
    );
    expect(message).toMatch(/value too long|check constraint/);
  });
});
