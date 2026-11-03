import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categoryId, createFamilyFor, createTestDb, pgError, type Query, type TestDb, type TestUser } from './harness';

let db: TestDb;
let ashiq: TestUser;
let sara: TestUser;
let familyId: string;
let ashiqMember: string;
let saraMember: string;
let salaryAccount: string;
let card: string;

type TxnInput = {
  type: 'expense' | 'income' | 'transfer' | 'refund';
  title: string;
  amount: string;
  date: string;
  member?: string;
  bank?: string | null;
  card?: string | null;
  toBank?: string | null;
  toCard?: string | null;
  category?: string | null;
  subcategory?: string | null;
  visibility?: 'shared' | 'private';
  currency?: string;
};

const insertTxn = async (q: Query, user: TestUser, t: TxnInput): Promise<string> => {
  const [row] = await q<{ id: string }>(
    `insert into transactions (family_id, type, title, amount, currency, occurred_on, spent_by_member_id, created_by,
       bank_account_id, credit_card_id, counterparty_bank_account_id, counterparty_credit_card_id,
       category_id, subcategory_id, visibility)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) returning id`,
    [
      familyId,
      t.type,
      t.title,
      t.amount,
      t.currency ?? 'INR',
      t.date,
      t.member ?? ashiqMember,
      user.id,
      t.bank ?? null,
      t.card ?? null,
      t.toBank ?? null,
      t.toCard ?? null,
      t.category ?? null,
      t.subcategory ?? null,
      t.visibility ?? 'shared',
    ],
  );
  return row!.id;
};

beforeAll(async () => {
  db = await createTestDb();
  ashiq = await db.createUser('Ashiq');
  sara = await db.createUser('Sara');
  ({ familyId, memberId: ashiqMember } = await createFamilyFor(db, ashiq));
  const [invite] = await db.as(ashiq, (q) =>
    q<{ token: string }>(`select * from create_invitation($1, $2)`, [familyId, sara.email]),
  );
  await db.as(sara, (q) => q(`select accept_invitation($1)`, [invite!.token]));
  const [m] = await db.admin<{ id: string }>(`select id from family_members where user_id = $1`, [sara.id]);
  saraMember = m!.id;

  await db.as(ashiq, async (q) => {
    const [acc] = await q<{ id: string }>(
      `insert into bank_accounts (family_id, owner_member_id, bank_name, nickname, opening_balance, opening_balance_date, created_by)
       values ($1, $2, 'HDFC Bank', 'Salary account', 10000.00, '2026-09-01', $3) returning id`,
      [familyId, ashiqMember, ashiq.id],
    );
    salaryAccount = acc!.id;
    const [c] = await q<{ id: string }>(
      `insert into credit_cards (family_id, owner_member_id, issuer, nickname, credit_limit, opening_outstanding, opening_balance_date, created_by)
       values ($1, $2, 'ICICI Bank', 'Amazon Pay', 100000, 0, '2026-09-01', $3) returning id`,
      [familyId, ashiqMember, ashiq.id],
    );
    card = c!.id;
  });
});

afterAll(async () => {
  await db.close();
});

describe('financial calculations', () => {
  beforeAll(async () => {
    const salary = await categoryId(db, familyId, 'Salary');
    const food = await categoryId(db, familyId, 'Food');
    const delivery = await categoryId(db, familyId, 'Food delivery', 'Food');
    const shopping = await categoryId(db, familyId, 'Lifestyle');
    const groceries = await categoryId(db, familyId, 'Groceries', 'Household');

    await db.as(ashiq, async (q) => {
      // October 2026
      await insertTxn(q, ashiq, { type: 'income', title: 'Salary', amount: '85000.00', date: '2026-10-01', bank: salaryAccount, category: salary });
      await insertTxn(q, ashiq, { type: 'expense', title: 'Swiggy', amount: '450.50', date: '2026-10-03', card, category: food, subcategory: delivery });
      await insertTxn(q, ashiq, { type: 'expense', title: 'Amazon', amount: '2999.99', date: '2026-10-05', card, category: shopping });
      await insertTxn(q, ashiq, { type: 'refund', title: 'Amazon refund', amount: '999.99', date: '2026-10-09', card, category: shopping });
      await insertTxn(q, ashiq, { type: 'expense', title: 'BigBasket', amount: '1800.25', date: '2026-10-10', bank: salaryAccount, member: saraMember, subcategory: groceries });
      // Paying the card bill is a transfer: it must not count as an expense.
      await insertTxn(q, ashiq, { type: 'transfer', title: 'Card bill', amount: '2450.50', date: '2026-10-20', bank: salaryAccount, toCard: card });
      // A foreign-currency expense is excluded from INR totals.
      await insertTxn(q, ashiq, { type: 'expense', title: 'Dubai duty free', amount: '100.00', date: '2026-10-21', currency: 'AED' });
      // September 2026
      await insertTxn(q, ashiq, { type: 'income', title: 'Salary', amount: '85000.00', date: '2026-09-01', bank: salaryAccount, category: salary });
      await insertTxn(q, ashiq, { type: 'expense', title: 'Rent', amount: '25000.00', date: '2026-09-05', bank: salaryAccount });
    });
  });

  it('computes monthly income, expenses net of refunds, and excludes transfers', async () => {
    const [s] = await db.as(ashiq, (q) =>
      q<Record<string, string>>(`select * from get_cashflow_summary($1, '2026-10-01', '2026-10-31')`, [familyId]),
    );
    // 450.50 + 2999.99 + 1800.25 - 999.99 = 4250.75
    expect(s).toMatchObject({
      currency: 'INR',
      income: '85000.00',
      expenses: '4250.75',
      refunds: '999.99',
      net: '80749.25',
      transaction_count: '5',
      excluded_other_currency: '1',
    });
  });

  it('filters by family member for the individual view', async () => {
    const [s] = await db.as(ashiq, (q) =>
      q<Record<string, string>>(`select * from get_cashflow_summary($1, '2026-10-01', '2026-10-31', $2)`, [
        familyId,
        saraMember,
      ]),
    );
    expect(s).toMatchObject({ income: '0', expenses: '1800.25' });
  });

  it('returns a zero-filled monthly series', async () => {
    const rows = await db.as(ashiq, (q) =>
      q<{ month: Date; income: string; expenses: string }>(`select * from get_monthly_cashflow($1, 3, '2026-10-15')`, [
        familyId,
      ]),
    );
    expect(rows.map((r) => [r.month.toISOString().slice(0, 7), r.income, r.expenses])).toEqual([
      ['2026-08', '0', '0'],
      ['2026-09', '85000.00', '25000.00'],
      ['2026-10', '85000.00', '4250.75'],
    ]);
  });

  it('breaks down spending by top-level category, netting refunds', async () => {
    const rows = await db.as(ashiq, (q) =>
      q<{ name: string; amount: string }>(
        `select name, amount from get_category_spending($1, '2026-10-01', '2026-10-31')`,
        [familyId],
      ),
    );
    expect(rows).toEqual([
      { name: 'Lifestyle', amount: '2000.00' },
      { name: 'Household', amount: '1800.25' },
      { name: 'Food', amount: '450.50' },
    ]);
  });

  it('breaks down spending by member', async () => {
    const rows = await db.as(ashiq, (q) =>
      q<{ display_name: string; expenses: string; income: string }>(
        `select display_name, expenses, income from get_member_spending($1, '2026-10-01', '2026-10-31')`,
        [familyId],
      ),
    );
    expect(rows).toEqual([
      { display_name: 'Ashiq', expenses: '2450.50', income: '85000.00' },
      { display_name: 'Sara', expenses: '1800.25', income: '0' },
    ]);
  });

  it('computes bank balance and card outstanding without double counting', async () => {
    const rows = await db.as(ashiq, (q) =>
      q<{ kind: string; balance: string; credit_limit: string | null }>(
        `select kind, balance, credit_limit from get_account_balances($1) order by kind`,
        [familyId],
      ),
    );
    // Bank: 10000 + 85000 + 85000 - 25000 - 1800.25 - 2450.50 (card payment) = 150749.25
    // Card: 450.50 + 2999.99 - 999.99 - 2450.50 = 0.00
    expect(rows).toEqual([
      { kind: 'bank', balance: '150749.25', credit_limit: null },
      { kind: 'card', balance: '0.00', credit_limit: '100000.00' },
    ]);
  });
});

describe('transaction validation', () => {
  it('derives the category from a subcategory and rejects mismatches', async () => {
    const coffee = await categoryId(db, familyId, 'Coffee', 'Food');
    const food = await categoryId(db, familyId, 'Food');
    const household = await categoryId(db, familyId, 'Household');

    const id = await db.as(ashiq, (q) =>
      insertTxn(q, ashiq, { type: 'expense', title: 'Coffee', amount: '180', date: '2026-10-02', subcategory: coffee }),
    );
    const [row] = await db.admin<{ category_id: string }>(`select category_id from transactions where id = $1`, [id]);
    expect(row?.category_id).toBe(food);

    expect(
      await pgError(
        db.as(ashiq, (q) =>
          insertTxn(q, ashiq, { type: 'expense', title: 'X', amount: '1', date: '2026-10-02', category: household, subcategory: coffee }),
        ),
      ),
    ).toMatch(/does not belong/);
  });

  it('rejects income categories on expenses', async () => {
    const salary = await categoryId(db, familyId, 'Salary');
    expect(
      await pgError(
        db.as(ashiq, (q) => insertTxn(q, ashiq, { type: 'expense', title: 'X', amount: '1', date: '2026-10-02', category: salary })),
      ),
    ).toMatch(/kind does not match/);
  });

  it('enforces transfer shape and positive amounts', async () => {
    expect(
      await pgError(db.as(ashiq, (q) => insertTxn(q, ashiq, { type: 'transfer', title: 'X', amount: '10', date: '2026-10-02', bank: salaryAccount }))),
    ).toMatch(/transfer_shape/);
    expect(
      await pgError(
        db.as(ashiq, (q) =>
          insertTxn(q, ashiq, { type: 'transfer', title: 'X', amount: '10', date: '2026-10-02', bank: salaryAccount, toBank: salaryAccount }),
        ),
      ),
    ).toMatch(/not_self/);
    expect(
      await pgError(db.as(ashiq, (q) => insertTxn(q, ashiq, { type: 'expense', title: 'X', amount: '-5', date: '2026-10-02' }))),
    ).toMatch(/amount_check/);
  });

  it('is idempotent for client-generated ids (offline sync)', async () => {
    const id = '7d8f8a9e-1c2b-4c1a-9a55-3f1e2d3c4b5a';
    const insert = (q: Query) =>
      q(
        `insert into transactions (id, family_id, type, title, amount, currency, occurred_on, spent_by_member_id, created_by)
         values ($1, $2, 'expense', 'Offline chai', 20, 'INR', '2026-10-02', $3, $4)
         on conflict (id) do nothing`,
        [id, familyId, ashiqMember, ashiq.id],
      );
    await db.as(ashiq, insert);
    await db.as(ashiq, insert);
    const rows = await db.admin(`select 1 from transactions where id = $1`, [id]);
    expect(rows).toHaveLength(1);
  });
});

describe('visibility', () => {
  it('hides private transactions from other members but keeps them in balances', async () => {
    const id = await db.as(ashiq, (q) =>
      insertTxn(q, ashiq, { type: 'expense', title: 'Surprise gift', amount: '5000', date: '2026-10-25', bank: salaryAccount, visibility: 'private' }),
    );
    const saraSees = await db.as(sara, (q) => q(`select 1 from transactions where id = $1`, [id]));
    expect(saraSees).toHaveLength(0);
    const ashiqSees = await db.as(ashiq, (q) => q(`select 1 from transactions where id = $1`, [id]));
    expect(ashiqSees).toHaveLength(1);

    const [saraBalance] = await db.as(sara, (q) =>
      q<{ balance: string }>(`select balance from get_account_balances($1) where kind = 'bank'`, [familyId]),
    );
    const [ashiqBalance] = await db.as(ashiq, (q) =>
      q<{ balance: string }>(`select balance from get_account_balances($1) where kind = 'bank'`, [familyId]),
    );
    expect(saraBalance?.balance).toBe(ashiqBalance?.balance);
  });

  it('makes every transaction on a private account private', async () => {
    const [acc] = await db.as(sara, (q) =>
      q<{ id: string }>(
        `insert into bank_accounts (family_id, owner_member_id, bank_name, nickname, visibility, created_by)
         values ($1, $2, 'SBI', 'Personal savings', 'private', $3) returning id`,
        [familyId, saraMember, sara.id],
      ),
    );
    const id = await db.as(sara, (q) =>
      insertTxn(q, sara, { type: 'expense', title: 'Salon', amount: '1200', date: '2026-10-11', bank: acc!.id, member: saraMember }),
    );
    const [row] = await db.admin<{ visibility: string }>(`select visibility from transactions where id = $1`, [id]);
    expect(row?.visibility).toBe('private');

    expect(await db.as(ashiq, (q) => q(`select 1 from bank_accounts where id = $1`, [acc!.id]))).toHaveLength(0);
    expect(await db.as(ashiq, (q) => q(`select 1 from transactions where id = $1`, [id]))).toHaveLength(0);
  });

  it('lets the spender edit a shared transaction someone else created for them', async () => {
    const id = await db.as(ashiq, (q) =>
      insertTxn(q, ashiq, { type: 'expense', title: 'Pharmacy', amount: '640', date: '2026-10-12', member: saraMember }),
    );
    const updated = await db.as(sara, (q) => q(`update transactions set amount = 650 where id = $1 returning id`, [id]));
    expect(updated).toHaveLength(1);
    const [row] = await db.admin<{ created_by: string }>(`select created_by from transactions where id = $1`, [id]);
    expect(row?.created_by).toBe(ashiq.id);
  });
});

describe('categories', () => {
  it('merges a subcategory into another and moves its transactions', async () => {
    const snacks = await categoryId(db, familyId, 'Snacks', 'Food');
    const coffee = await categoryId(db, familyId, 'Coffee', 'Food');
    const id = await db.as(ashiq, (q) =>
      insertTxn(q, ashiq, { type: 'expense', title: 'Samosa', amount: '60', date: '2026-10-13', subcategory: snacks }),
    );
    await db.as(ashiq, (q) => q(`select merge_categories($1, $2)`, [snacks, coffee]));

    const [row] = await db.admin<{ subcategory_id: string }>(`select subcategory_id from transactions where id = $1`, [id]);
    expect(row?.subcategory_id).toBe(coffee);
    expect(await db.admin(`select 1 from transaction_categories where id = $1`, [snacks])).toHaveLength(0);

    const [audit] = await db.as(ashiq, (q) =>
      q<{ action: string }>(`select action from audit_logs where action = 'category.merged'`),
    );
    expect(audit?.action).toBe('category.merged');
  });

  it('merges a top-level category, combining subcategories with the same name', async () => {
    const [custom] = await db.as(ashiq, (q) =>
      q<{ id: string }>(`insert into transaction_categories (family_id, name) values ($1, 'Dining') returning id`, [familyId]),
    );
    const [customChild] = await db.as(ashiq, (q) =>
      q<{ id: string }>(
        `insert into transaction_categories (family_id, parent_id, name) values ($1, $2, 'Restaurants') returning id`,
        [familyId, custom!.id],
      ),
    );
    const id = await db.as(ashiq, (q) =>
      insertTxn(q, ashiq, { type: 'expense', title: 'Dinner', amount: '2200', date: '2026-10-14', subcategory: customChild!.id }),
    );
    const food = await categoryId(db, familyId, 'Food');
    await db.as(ashiq, (q) => q(`select merge_categories($1, $2)`, [custom!.id, food]));

    const restaurants = await categoryId(db, familyId, 'Restaurants', 'Food');
    const [row] = await db.admin<{ category_id: string; subcategory_id: string }>(
      `select category_id, subcategory_id from transactions where id = $1`,
      [id],
    );
    expect(row).toEqual({ category_id: food, subcategory_id: restaurants });
  });

  it('prevents three-level nesting and system category spoofing', async () => {
    const coffee = await categoryId(db, familyId, 'Coffee', 'Food');
    expect(
      await pgError(
        db.as(ashiq, (q) =>
          q(`insert into transaction_categories (family_id, parent_id, name) values ($1, $2, 'Latte')`, [familyId, coffee]),
        ),
      ),
    ).toMatch(/cannot have their own subcategories/);
    expect(
      await pgError(
        db.as(ashiq, (q) => q(`insert into transaction_categories (family_id, name, is_system) values ($1, 'X', true)`, [familyId])),
      ),
    ).toMatch(/permission denied/);
  });
});
