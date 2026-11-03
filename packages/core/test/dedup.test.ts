import { describe, expect, it } from 'vitest';
import {
  compareTransactions,
  findBestMatch,
  findCardPaymentPair,
  fingerprint,
  isCardPaymentDescription,
  isRefundDescription,
  reconcileBatch,
  suggestTransactionType,
  type ComparableTransaction,
} from '../src/dedup';
import { descriptionSimilarity, normalizeDescription } from '../src/text';

const CARD = 'card-1';
const BANK = 'bank-1';

const txn = (overrides: Partial<ComparableTransaction>): ComparableTransaction => ({
  date: '2026-10-03',
  amountMinor: 45_050,
  direction: 'debit',
  description: 'SWIGGY BANGALORE',
  accountId: CARD,
  ...overrides,
});

describe('description normalisation', () => {
  it('strips UPI/POS noise, VPAs, card numbers and references', () => {
    expect(normalizeDescription('UPI/DR/412345678901/SWIGGY/YESB/swiggy@yesbank/Payment')).toBe('SWIGGY');
    expect(normalizeDescription('POS 4521XXXXXXXX1234 SWIGGY BANGALORE IN')).toBe('SWIGGY BANGALORE');
    expect(normalizeDescription('NEFT-HDFC0000123-ACME CORP PVT LTD-SALARY OCT')).toBe('HDFC0000123 ACME CORP SALARY OCT');
  });

  it('scores similar merchant text highly and unrelated text low', () => {
    expect(descriptionSimilarity('SWIGGY', 'UPI/SWIGGY/123456789/Payment')).toBe(1);
    expect(descriptionSimilarity('Swiggy order', 'SWIGGY BANGALORE')).toBeGreaterThanOrEqual(0.5);
    expect(descriptionSimilarity('AMAZON PAY INDIA', 'AMAZON')).toBeGreaterThanOrEqual(0.85);
    expect(descriptionSimilarity('UBER TRIP', 'ZOMATO')).toBeLessThan(0.4);
  });
});

describe('compareTransactions', () => {
  it('confirms exact duplicates from overlapping statements of the same account', () => {
    const first = txn({ id: 'a', importId: 'import-sep' });
    const second = txn({ importId: 'import-oct' });
    const result = compareTransactions(second, first);
    expect(result.classification).toBe('confirmed_duplicate');
    expect(result.reasons).toContain('same_fingerprint');
    expect(fingerprint(first)).toBe(fingerprint(second));
  });

  it('confirms duplicates by bank reference number on the same account', () => {
    const result = compareTransactions(
      txn({ reference: 'UTR 4123 4567 8901', description: 'UPI-SWIGGY', date: '2026-10-03' }),
      txn({ id: 'a', reference: '412345678901', description: 'Swiggy food', date: '2026-10-04' }),
    );
    expect(result).toMatchObject({ classification: 'confirmed_duplicate', score: 1 });
  });

  it('treats different references on the same account as different transactions', () => {
    const result = compareTransactions(txn({ reference: '412345678901' }), txn({ reference: '998877665544' }));
    expect(result.classification).toBe('unique');
  });

  it('flags a manual entry that later appears on the card statement as a possible duplicate', () => {
    const manual = txn({ id: 'manual', description: 'Swiggy dinner', date: '2026-10-03' });
    const statementLine = txn({ description: 'SWIGGY BANGALORE IN', date: '2026-10-04', importId: 'import-oct' });
    const result = compareTransactions(statementLine, manual);
    expect(result.classification).toBe('possible_duplicate');
    expect(result.score).toBeGreaterThan(0.6);
    expect(result.reasons).toEqual(expect.arrayContaining(['same_amount', 'date_within_tolerance', 'same_account']));
  });

  it('handles a manual cash-style entry without an account', () => {
    const manual = txn({ id: 'manual', accountId: null, description: 'Swiggy' });
    const result = compareTransactions(txn({ description: 'UPI/SWIGGY/412345678901' }), manual);
    expect(result.classification).toBe('possible_duplicate');
  });

  it('never matches different amounts, directions, accounts, or dates beyond tolerance', () => {
    expect(compareTransactions(txn({ amountMinor: 45_051 }), txn({})).classification).toBe('unique');
    expect(compareTransactions(txn({ direction: 'credit' }), txn({})).classification).toBe('unique');
    expect(compareTransactions(txn({ accountId: 'card-2' }), txn({})).classification).toBe('unique');
    expect(compareTransactions(txn({ date: '2026-10-08' }), txn({})).classification).toBe('unique');
  });

  it('does not merge two identical purchases inside the same statement', () => {
    const coffee1 = txn({ id: 'c1', importId: 'imp', description: 'STARBUCKS', amountMinor: 35_000 });
    const coffee2 = txn({ importId: 'imp', description: 'STARBUCKS', amountMinor: 35_000 });
    expect(compareTransactions(coffee2, coffee1).classification).toBe('unique');
  });

  it('keeps unrelated same-amount transactions below the possible threshold', () => {
    const result = compareTransactions(
      txn({ description: 'UBER TRIP', date: '2026-10-06', accountId: null }),
      txn({ id: 'x', description: 'ZOMATO ORDER', date: '2026-10-03', accountId: null }),
    );
    expect(result.classification).toBe('unique');
  });
});

describe('findBestMatch and reconcileBatch', () => {
  it('prefers a confirmed match over a possible one', () => {
    const existing = [
      txn({ id: 'possible', description: 'Swiggy', accountId: null, date: '2026-10-02' }),
      txn({ id: 'exact', importId: 'old' }),
    ];
    const result = findBestMatch(txn({ importId: 'new' }), existing);
    expect(result).toMatchObject({ classification: 'confirmed_duplicate', candidateId: 'exact' });
  });

  it('re-importing the same statement is fully idempotent', () => {
    const statement = [
      txn({ description: 'SWIGGY', date: '2026-10-03' }),
      txn({ description: 'AMAZON PAY', amountMinor: 299_999, date: '2026-10-05' }),
      txn({ description: 'REFUND AMAZON', amountMinor: 99_999, direction: 'credit', date: '2026-10-09' }),
    ];
    const alreadyImported = statement.map((t, i) => ({ ...t, id: `t${i}`, importId: 'first' }));
    const { summary } = reconcileBatch(
      statement.map((t) => ({ ...t, importId: 'second' })),
      alreadyImported,
    );
    expect(summary).toEqual({ total: 3, new: 0, confirmedDuplicates: 3, possibleDuplicates: 0, failed: 0, needsReview: 0 });
  });

  it('summarises new, duplicate, possible and failed rows for overlapping statements', () => {
    const existing = [
      txn({ id: 'sep-30', date: '2026-09-30', description: 'BIGBASKET', amountMinor: 180_025, importId: 'sep' }),
      txn({ id: 'manual', date: '2026-10-03', description: 'Swiggy dinner', accountId: null }),
    ];
    const rows = [
      txn({ date: '2026-09-30', description: 'BIGBASKET', amountMinor: 180_025, importId: 'oct' }), // overlap
      txn({ date: '2026-10-04', description: 'SWIGGY BANGALORE', importId: 'oct' }), // manual entry
      txn({ date: '2026-10-12', description: 'UBER', amountMinor: 32_000, importId: 'oct' }), // new
      null, // unparseable line
    ];
    const { results, summary } = reconcileBatch(rows, existing);
    expect(results.map((r) => r?.classification ?? 'failed')).toEqual([
      'confirmed_duplicate',
      'possible_duplicate',
      'unique',
      'failed',
    ]);
    expect(summary).toEqual({ total: 4, new: 1, confirmedDuplicates: 1, possibleDuplicates: 1, failed: 1, needsReview: 2 });
  });

  it('catches the same line appearing in two files uploaded together', () => {
    const line = txn({ description: 'ZEPTO', amountMinor: 64_000 });
    const { summary } = reconcileBatch([{ ...line, importId: 'a' }, { ...line, importId: 'b' }], []);
    expect(summary.new).toBe(1);
    expect(summary.confirmedDuplicates).toBe(1);
  });
});

describe('credit card payments, refunds and reversals', () => {
  it.each([
    'CC PAYMENT 4521XXXX1234',
    'CREDIT CARD BILL PAYMENT ICICI',
    'BBPS/CREDIT CARD/ICICI',
    'CRED CLUB/UPI/1234567890',
    'PAYMENT RECEIVED - THANK YOU',
    'AUTOPAY CARD 1234',
  ])('recognises card bill payment: %s', (d) => {
    expect(isCardPaymentDescription(d)).toBe(true);
  });

  it.each(['SWIGGY', 'CREDIT INTEREST', 'AMAZON CARD PURCHASE'])('does not misread %s as a card payment', (d) => {
    expect(isCardPaymentDescription(d)).toBe(false);
  });

  it('recognises refunds and reversals', () => {
    expect(isRefundDescription('REFUND AMAZON SELLER')).toBe(true);
    expect(isRefundDescription('UPI REVERSAL 1234')).toBe(true);
    expect(isRefundDescription('SALARY OCT')).toBe(false);
  });

  it('suggests transaction types so card payments are never counted as expenses', () => {
    expect(suggestTransactionType({ description: 'CC PAYMENT ICICI', direction: 'debit', source: 'bank_account' })).toBe('transfer');
    expect(suggestTransactionType({ description: 'PAYMENT RECEIVED THANK YOU', direction: 'credit', source: 'credit_card' })).toBe('transfer');
    expect(suggestTransactionType({ description: 'SWIGGY', direction: 'debit', source: 'credit_card' })).toBe('expense');
    expect(suggestTransactionType({ description: 'AMAZON', direction: 'credit', source: 'credit_card' })).toBe('refund');
    expect(suggestTransactionType({ description: 'UPI REVERSAL', direction: 'credit', source: 'bank_account' })).toBe('refund');
    expect(suggestTransactionType({ description: 'SALARY', direction: 'credit', source: 'bank_account' })).toBe('income');
  });

  it('pairs a bank-side card payment with the card-side credit', () => {
    const bankDebit = txn({ accountId: BANK, description: 'CC PAYMENT', amountMinor: 245_050, date: '2026-10-20' });
    const credits = [
      txn({ id: 'far', direction: 'credit', amountMinor: 245_050, date: '2026-10-02' }),
      txn({ id: 'match', direction: 'credit', amountMinor: 245_050, date: '2026-10-21', description: 'PAYMENT RECEIVED' }),
      txn({ id: 'other', direction: 'credit', amountMinor: 1_000, date: '2026-10-20' }),
    ];
    expect(findCardPaymentPair(bankDebit, credits)?.id).toBe('match');
    expect(findCardPaymentPair({ ...bankDebit, amountMinor: 1 }, credits)).toBeNull();
  });
});
