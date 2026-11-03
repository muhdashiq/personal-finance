import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb, type TestUser } from './harness';

const SEED = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'seed.sql');

let db: TestDb;
const ashiq: TestUser = { id: '11111111-1111-4111-8111-111111111111', email: 'ashiq@example.com', name: 'Ashiq' };
const sara: TestUser = { id: '22222222-2222-4222-8222-222222222222', email: 'sara@example.com', name: 'Sara' };

beforeAll(async () => {
  db = await createTestDb();
  await db.admin(readFileSync(SEED, 'utf8'));
});

afterAll(async () => {
  await db.close();
});

describe('development seed', () => {
  it('creates a shared family with two logins and a child member', async () => {
    const members = await db.as(sara, (q) =>
      q<{ display_name: string; role: string; has_login: boolean }>(
        `select display_name, role, user_id is not null as has_login from family_members order by display_name`,
      ),
    );
    expect(members).toEqual([
      { display_name: 'Ashiq', role: 'admin', has_login: true },
      { display_name: 'Ayaan', role: 'member', has_login: false },
      { display_name: 'Sara', role: 'member', has_login: true },
    ]);
  });

  it('is idempotent', async () => {
    await db.admin(readFileSync(SEED, 'utf8'));
    const [row] = await db.admin<{ n: string }>(`select count(*) as n from families`);
    expect(row?.n).toBe('1');
  });

  it('produces internally consistent reports (sum of categories = total expenses)', async () => {
    const [family] = await db.admin<{ id: string }>(`select id from families`);
    const [summary] = await db.as(ashiq, (q) =>
      q<{ expenses: string; income: string }>(
        `select * from get_cashflow_summary($1, date_trunc('month', current_date - interval '1 month')::date,
           (date_trunc('month', current_date) - interval '1 day')::date)`,
        [family!.id],
      ),
    );
    const categories = await db.as(ashiq, (q) =>
      q<{ amount: string }>(
        `select amount from get_category_spending($1, date_trunc('month', current_date - interval '1 month')::date,
           (date_trunc('month', current_date) - interval '1 day')::date)`,
        [family!.id],
      ),
    );
    const members = await db.as(ashiq, (q) =>
      q<{ expenses: string }>(
        `select expenses from get_member_spending($1, date_trunc('month', current_date - interval '1 month')::date,
           (date_trunc('month', current_date) - interval '1 day')::date)`,
        [family!.id],
      ),
    );
    const sum = (rows: Array<{ amount?: string; expenses?: string }>, key: 'amount' | 'expenses') =>
      rows.reduce((total, r) => total + Math.round(Number(r[key]) * 100), 0);

    expect(Number(summary!.income)).toBeGreaterThan(0);
    expect(sum(categories, 'amount')).toBe(Math.round(Number(summary!.expenses) * 100));
    expect(sum(members, 'expenses')).toBe(Math.round(Number(summary!.expenses) * 100));
  });

  it('keeps Sara’s private gift out of Ashiq’s view', async () => {
    const sees = await db.as(ashiq, (q) => q(`select 1 from transactions where title = 'Anniversary gift'`));
    const own = await db.as(sara, (q) => q(`select 1 from transactions where title = 'Anniversary gift'`));
    expect(sees).toHaveLength(0);
    expect(own).toHaveLength(1);
  });

  it('nets card bill payments out of expenses but into card balances', async () => {
    const [family] = await db.admin<{ id: string }>(`select id from families`);
    const cards = await db.as(ashiq, (q) =>
      q<{ nickname: string; balance: string }>(`select nickname, balance from get_account_balances($1) where kind = 'card'`, [family!.id]),
    );
    expect(cards.map((c) => c.nickname).sort()).toEqual(['Amazon Pay', 'Millennia']);
    const transfers = await db.as(ashiq, (q) =>
      q<{ n: string }>(`select count(*) as n from transactions where type = 'transfer' and category_id is null`),
    );
    expect(Number(transfers[0]!.n)).toBeGreaterThan(0);
  });
});
