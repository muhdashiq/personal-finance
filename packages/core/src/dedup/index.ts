/**
 * Duplicate detection and reconciliation.
 *
 * A transaction can reach the system from a manual entry, a bank statement,
 * a card statement, or a re-upload of an overlapping statement. Before an
 * imported row becomes a transaction it is compared with existing
 * transactions and classified as:
 *
 *   confirmed_duplicate  same account, same reference, or same account +
 *                        same day + same amount + (near) identical text
 *   possible_duplicate   same amount and direction within a few days, with
 *                        similar text — needs a human decision
 *   unique               nothing plausible matched
 *
 * Nothing here deletes anything: callers record matches and let the user
 * resolve uncertain ones.
 */
import { daysBetween, type ISODate } from '../dates';
import type { Minor } from '../money';
import { descriptionSimilarity, fnv1a, normalizeDescription, tokens } from '../text';

export type Direction = 'debit' | 'credit';

export type MatchClassification = 'confirmed_duplicate' | 'possible_duplicate' | 'unique';

export type ComparableTransaction = {
  id?: string;
  date: ISODate;
  /** Always positive. */
  amountMinor: Minor;
  /** Debit = money out of the account/card holder's pocket (purchase, withdrawal). */
  direction: Direction;
  description: string;
  merchant?: string | null;
  reference?: string | null;
  /** Bank account or card id the line belongs to; null for manual cash entries. */
  accountId?: string | null;
  /** The statement import a row came from, if any. */
  importId?: string | null;
};

export type MatchReason =
  | 'same_reference'
  | 'same_account'
  | 'different_account'
  | 'same_amount'
  | 'same_day'
  | 'date_within_tolerance'
  | 'identical_description'
  | 'similar_description'
  | 'same_fingerprint';

export type MatchResult = {
  classification: MatchClassification;
  /** 0..1 */
  score: number;
  reasons: MatchReason[];
  candidateId?: string;
};

export type MatchOptions = {
  /** Max days between posting/transaction dates to consider a match. Default 3. */
  dateToleranceDays?: number;
  /** Score at or above which a pair is a possible duplicate. Default 0.6. */
  possibleThreshold?: number;
};

/**
 * Stable fingerprint of a statement line. Re-uploading the same or an
 * overlapping statement yields the same fingerprints for the same lines.
 */
export const fingerprint = (t: ComparableTransaction): string => {
  const text = tokens(normalizeDescription(t.merchant || t.description)).slice(0, 4).join(' ');
  return [t.accountId ?? 'none', t.date, t.direction, t.amountMinor, fnv1a(text)].join('|');
};

/**
 * References are compared on their digits when they are mostly numeric
 * (UTR/RRN numbers are printed as "UTR 4123 4567 8901" in one statement and
 * "412345678901" in another), otherwise on their alphanumeric form.
 */
const normalizeReference = (ref: string | null | undefined): string | null => {
  const cleaned = ref?.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (!cleaned) return null;
  const digits = cleaned.replace(/\D/g, '');
  const value = digits.length >= 8 ? digits : cleaned;
  return value.length >= 6 && !/^0+$/.test(value) ? value : null;
};

const dateScore = (days: number): number => [0.3, 0.22, 0.15, 0.08][days] ?? 0;

/** Compares one incoming transaction with one existing transaction. */
export const compareTransactions = (
  incoming: ComparableTransaction,
  existing: ComparableTransaction,
  options: MatchOptions = {},
): MatchResult => {
  const tolerance = options.dateToleranceDays ?? 3;
  const possibleThreshold = options.possibleThreshold ?? 0.6;
  const unique: MatchResult = { classification: 'unique', score: 0, reasons: [], candidateId: existing.id };

  if (incoming.amountMinor !== existing.amountMinor || incoming.direction !== existing.direction) return unique;

  const days = Math.abs(daysBetween(incoming.date, existing.date));
  const sameAccount = Boolean(incoming.accountId && existing.accountId && incoming.accountId === existing.accountId);
  const differentAccount = Boolean(incoming.accountId && existing.accountId && incoming.accountId !== existing.accountId);
  const refA = normalizeReference(incoming.reference);
  const refB = normalizeReference(existing.reference);

  // References are only comparable within the same account.
  if (sameAccount && refA && refB) {
    if (refA === refB) {
      return { classification: 'confirmed_duplicate', score: 1, reasons: ['same_reference', 'same_account', 'same_amount'], candidateId: existing.id };
    }
    return unique;
  }

  if (days > tolerance) return unique;
  // A purchase on one card cannot be the same transaction as a purchase on another account.
  if (differentAccount) return unique;
  // Two identical lines in the same statement are separate purchases (two coffees), unless the reference says otherwise.
  if (incoming.importId && incoming.importId === existing.importId) return unique;

  const similarity = descriptionSimilarity(incoming.merchant || incoming.description, existing.merchant || existing.description);
  const reasons: MatchReason[] = ['same_amount'];
  reasons.push(days === 0 ? 'same_day' : 'date_within_tolerance');
  if (sameAccount) reasons.push('same_account');
  if (similarity === 1) reasons.push('identical_description');
  else if (similarity >= 0.5) reasons.push('similar_description');

  if (sameAccount && fingerprint(incoming) === fingerprint(existing)) {
    return { classification: 'confirmed_duplicate', score: 1, reasons: [...reasons, 'same_fingerprint'], candidateId: existing.id };
  }

  const score = Math.min(1, 0.4 + dateScore(days) + similarity * 0.25 + (sameAccount ? 0.05 : 0));
  const rounded = Math.round(score * 10_000) / 10_000;

  if (sameAccount && days === 0 && similarity >= 0.9) {
    return { classification: 'confirmed_duplicate', score: rounded, reasons, candidateId: existing.id };
  }
  if (rounded >= possibleThreshold) {
    return { classification: 'possible_duplicate', score: rounded, reasons, candidateId: existing.id };
  }
  return { ...unique, score: rounded, reasons };
};

/**
 * Finds the best match for an incoming transaction among existing ones.
 * Returns `unique` when nothing qualifies.
 */
export const findBestMatch = (
  incoming: ComparableTransaction,
  existing: readonly ComparableTransaction[],
  options: MatchOptions = {},
): MatchResult => {
  let best: MatchResult = { classification: 'unique', score: 0, reasons: [] };
  const rank = { confirmed_duplicate: 2, possible_duplicate: 1, unique: 0 } as const;
  for (const candidate of existing) {
    const result = compareTransactions(incoming, candidate, options);
    if (
      rank[result.classification] > rank[best.classification] ||
      (rank[result.classification] === rank[best.classification] && result.score > best.score)
    ) {
      best = result;
    }
  }
  return best.classification === 'unique' ? { classification: 'unique', score: best.score, reasons: [] } : best;
};

export type ImportSummary = {
  total: number;
  new: number;
  confirmedDuplicates: number;
  possibleDuplicates: number;
  failed: number;
  needsReview: number;
};

/**
 * Classifies a batch of parsed rows against existing transactions and
 * against each other (so a row repeated across two uploaded files in the same
 * batch is caught too).
 */
export const reconcileBatch = (
  rows: ReadonlyArray<ComparableTransaction | null>,
  existing: readonly ComparableTransaction[],
  options: MatchOptions = {},
): { results: Array<MatchResult | null>; summary: ImportSummary } => {
  const accepted: ComparableTransaction[] = [];
  const results = rows.map((row, index) => {
    if (!row) return null;
    const result = findBestMatch(row, [...existing, ...accepted], options);
    if (result.classification === 'unique') accepted.push({ ...row, id: row.id ?? `row:${index}` });
    return result;
  });
  const summary: ImportSummary = {
    total: rows.length,
    new: results.filter((r) => r?.classification === 'unique').length,
    confirmedDuplicates: results.filter((r) => r?.classification === 'confirmed_duplicate').length,
    possibleDuplicates: results.filter((r) => r?.classification === 'possible_duplicate').length,
    failed: results.filter((r) => r === null).length,
    needsReview: 0,
  };
  summary.needsReview = summary.possibleDuplicates + summary.failed;
  return { results, summary };
};

// ---------------------------------------------------------------------------
// Credit card payments, refunds and reversals
// ---------------------------------------------------------------------------

const CARD_PAYMENT_PATTERNS = [
  /\bCREDIT ?CARD\b.*\b(PAYMENT|PYMT|BILL|PAY)\b/,
  /\b(CC|CARD) ?(PAYMENT|PYMT|BILL ?PAY)\b/,
  /\bCRED\b|\bCRED ?CLUB\b/,
  /\bAUTOPAY\b.*\bCARD\b|\bCARD\b.*\bAUTOPAY\b/,
  /\bPAYMENT RECEIVED\b|\bPAYMENT - THANK YOU\b|\bTHANK YOU FOR (YOUR )?PAYMENT\b/,
  /\bBBPS\b.*\bCARD\b/,
];

/** Bank debit or card credit that represents paying a credit card bill. */
export const isCardPaymentDescription = (description: string): boolean => {
  const upper = description.toUpperCase();
  return CARD_PAYMENT_PATTERNS.some((p) => p.test(upper));
};

const REFUND_PATTERNS = [/\bREFUND\b/, /\bREVERSAL\b|\bREVERSED\b|\bRVSL\b|\bREV\b/, /\bCHARGEBACK\b/, /\bCASHBACK\b/, /\bRETURN\b/];

export const isRefundDescription = (description: string): boolean => {
  const upper = description.toUpperCase();
  return REFUND_PATTERNS.some((p) => p.test(upper));
};

export type SuggestedType = 'expense' | 'income' | 'refund' | 'transfer';

/**
 * Suggests the transaction type for a statement line so that card payments
 * become transfers (never expenses) and card credits become refunds.
 */
export const suggestTransactionType = (line: {
  description: string;
  direction: Direction;
  source: 'bank_account' | 'credit_card';
}): SuggestedType => {
  if (isCardPaymentDescription(line.description)) return 'transfer';
  if (line.source === 'credit_card') {
    return line.direction === 'debit' ? 'expense' : 'refund';
  }
  if (line.direction === 'debit') return 'expense';
  return isRefundDescription(line.description) ? 'refund' : 'income';
};

/**
 * Links the bank-side debit of a card bill payment to the card-side credit
 * ("PAYMENT RECEIVED") so they can be recorded as one transfer instead of an
 * expense plus a refund.
 */
export const findCardPaymentPair = (
  bankDebit: ComparableTransaction,
  cardCredits: readonly ComparableTransaction[],
  toleranceDays = 5,
): ComparableTransaction | null => {
  if (bankDebit.direction !== 'debit') return null;
  const candidates = cardCredits
    .filter(
      (c) =>
        c.direction === 'credit' &&
        c.amountMinor === bankDebit.amountMinor &&
        Math.abs(daysBetween(bankDebit.date, c.date)) <= toleranceDays,
    )
    .sort((a, b) => Math.abs(daysBetween(bankDebit.date, a.date)) - Math.abs(daysBetween(bankDebit.date, b.date)));
  return candidates[0] ?? null;
};
