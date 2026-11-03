import type { TransactionFormValues } from '@family-finance/core';
import { toTransactionRow } from '../api';

const base: TransactionFormValues = {
  type: 'expense',
  title: '  Groceries ',
  amount: '1,800.25',
  occurredOn: '2026-11-03',
  categoryId: 'cat-household',
  subcategoryId: 'cat-groceries',
  paymentMethod: 'upi',
  instrument: 'bank:acc-1',
  toInstrument: null,
  spentByMemberId: 'member-1',
  merchant: ' BigBasket ',
  notes: '',
  visibility: 'shared',
};

describe('toTransactionRow', () => {
  it('maps form values to a database row with an exact amount', () => {
    expect(toTransactionRow(base, { familyId: 'fam-1', currency: 'INR' })).toEqual({
      family_id: 'fam-1',
      type: 'expense',
      title: 'Groceries',
      amount: 1800.25,
      currency: 'INR',
      occurred_on: '2026-11-03',
      category_id: 'cat-household',
      subcategory_id: 'cat-groceries',
      payment_method: 'upi',
      bank_account_id: 'acc-1',
      credit_card_id: null,
      counterparty_bank_account_id: null,
      counterparty_credit_card_id: null,
      spent_by_member_id: 'member-1',
      merchant: 'BigBasket',
      notes: null,
      visibility: 'shared',
    });
  });

  it('records a card bill payment as a transfer without a category', () => {
    const row = toTransactionRow(
      { ...base, type: 'transfer', instrument: 'bank:acc-1', toInstrument: 'card:card-9', amount: '24,500' },
      { familyId: 'fam-1', currency: 'INR' },
    );
    expect(row).toMatchObject({
      type: 'transfer',
      amount: 24500,
      category_id: null,
      subcategory_id: null,
      bank_account_id: 'acc-1',
      counterparty_credit_card_id: 'card-9',
      counterparty_bank_account_id: null,
    });
  });

  it('ignores a stale destination on non-transfers', () => {
    const row = toTransactionRow({ ...base, toInstrument: 'card:card-9' }, { familyId: 'fam-1', currency: 'INR' });
    expect(row.counterparty_credit_card_id).toBeNull();
  });

  it('keeps cents exact for values that are inexact in binary floating point', () => {
    for (const [input, expected] of [
      ['0.29', 0.29],
      ['1.10', 1.1],
      ['999999999999.99', 999999999999.99],
    ] as const) {
      const row = toTransactionRow({ ...base, amount: input }, { familyId: 'f', currency: 'INR' });
      expect(row.amount).toBe(expected);
      expect(JSON.stringify(row.amount)).toBe(String(expected));
    }
  });
});
