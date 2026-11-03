import { describe, expect, it } from 'vitest';
import { buildInsights } from '../src/insights';
import { parseInstrumentKey, signUpSchema, toInstrumentKey, transactionFormSchema } from '../src/validation';

describe('buildInsights', () => {
  const base = {
    currency: 'INR',
    periodLabel: 'This month',
    previousPeriodLabel: 'Last month',
    income: 10_000_000,
    expenses: 6_000_000,
    previousExpenses: 5_000_000,
    categories: [
      { categoryId: 'food', name: 'Food', amountMinor: 1_180_000 },
      { categoryId: 'shopping', name: 'Shopping', amountMinor: 2_200_000 },
      { categoryId: 'fuel', name: 'Fuel', amountMinor: 500_000 },
    ],
    previousCategories: [
      { categoryId: 'food', name: 'Food', amountMinor: 1_000_000 },
      { categoryId: 'shopping', name: 'Shopping', amountMinor: 1_000_000 },
      { categoryId: 'fuel', name: 'Fuel', amountMinor: 490_000 },
    ],
  };

  it('reports real changes computed from the totals', () => {
    const insights = buildInsights(base);
    const titles = insights.map((i) => i.title);
    expect(titles).toContain('Spending up 20%');
    expect(titles).toContain('Shopping increased by 120%');
    expect(titles).toContain('Food increased by 18%');
    expect(titles).toContain('Shopping is 36.7% of spending');
    expect(titles).toContain('You saved 40% of income');
    const shopping = insights.find((i) => i.id === 'category-change-shopping');
    expect(shopping?.detail).toBe('₹22,000 this month vs ₹10,000 last month.');
  });

  it('suppresses small changes and missing baselines', () => {
    const titles = buildInsights(base).map((i) => i.title);
    expect(titles.some((t) => t.startsWith('Fuel'))).toBe(false); // +2%, ₹100
    const noBaseline = buildInsights({ ...base, previousExpenses: 0, previousCategories: [] });
    expect(noBaseline.some((i) => i.id.startsWith('category-change'))).toBe(false);
    expect(noBaseline.some((i) => i.id === 'total-expenses-change')).toBe(false);
  });

  it('warns when expenses exceed income and says nothing about savings without income', () => {
    expect(buildInsights({ ...base, income: 5_000_000 }).find((i) => i.id === 'savings-rate')?.tone).toBe('negative');
    expect(buildInsights({ ...base, income: 0 }).find((i) => i.id === 'savings-rate')).toBeUndefined();
  });
});

describe('transactionFormSchema', () => {
  const valid = {
    type: 'expense' as const,
    title: 'Groceries',
    amount: '1,800.25',
    occurredOn: '2026-11-03',
    categoryId: null,
    subcategoryId: null,
    paymentMethod: 'upi' as const,
    instrument: null,
    toInstrument: null,
    spentByMemberId: 'member-1',
    merchant: '',
    notes: '',
    visibility: 'shared' as const,
  };

  it('accepts a valid expense', () => {
    expect(transactionFormSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    [{ amount: '0' }, 'amount'],
    [{ amount: '12.345' }, 'amount'],
    [{ title: '  ' }, 'title'],
    [{ occurredOn: '2026-02-30' }, 'occurredOn'],
    [{ spentByMemberId: '' }, 'spentByMemberId'],
  ])('rejects %o', (patch, field) => {
    const result = transactionFormSchema.safeParse({ ...valid, ...patch });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });

  it('requires two different instruments for a transfer', () => {
    const result = transactionFormSchema.safeParse({ ...valid, type: 'transfer', instrument: 'bank:a', toInstrument: 'bank:a' });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(['toInstrument']);
    expect(transactionFormSchema.safeParse({ ...valid, type: 'transfer', instrument: 'bank:a', toInstrument: 'card:b' }).success).toBe(true);
  });
});

describe('instrument keys', () => {
  it('round-trips bank and card ids', () => {
    expect(parseInstrumentKey(toInstrumentKey('abc', null))).toEqual({ bankAccountId: 'abc', creditCardId: null });
    expect(parseInstrumentKey(toInstrumentKey(null, 'xyz'))).toEqual({ bankAccountId: null, creditCardId: 'xyz' });
    expect(parseInstrumentKey('nonsense')).toEqual({ bankAccountId: null, creditCardId: null });
  });
});

describe('signUpSchema', () => {
  it('enforces password strength and confirmation', () => {
    const ok = { displayName: 'Ashiq', email: 'ASHIQ@Example.com ', password: 'secret123', confirmPassword: 'secret123' };
    const parsed = signUpSchema.parse(ok);
    expect(parsed.email).toBe('ashiq@example.com');
    expect(signUpSchema.safeParse({ ...ok, password: 'short1', confirmPassword: 'short1' }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, confirmPassword: 'other123' }).success).toBe(false);
  });
});
