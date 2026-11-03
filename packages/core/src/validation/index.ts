/**
 * Form/input schemas shared by the app (React Hook Form) and server code.
 * Amounts are kept as strings in forms and converted with parseAmountInput.
 */
import { z } from 'zod';
import { isISODate } from '../dates';
import { MAX_MINOR, tryParseAmountInput } from '../money';

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer', 'refund'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const PAYMENT_METHODS = [
  'cash', 'upi', 'debit_card', 'credit_card', 'net_banking', 'bank_transfer', 'cheque', 'wallet', 'auto_debit', 'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  debit_card: 'Debit card',
  credit_card: 'Credit card',
  net_banking: 'Net banking',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  wallet: 'Wallet',
  auto_debit: 'Auto-debit',
  other: 'Other',
};

export const FAMILY_ROLES = ['admin', 'member', 'viewer'] as const;
export type FamilyRole = (typeof FAMILY_ROLES)[number];

export const MEMBER_RELATIONSHIPS = ['self', 'spouse', 'partner', 'child', 'parent', 'sibling', 'other'] as const;
export type MemberRelationship = (typeof MEMBER_RELATIONSHIPS)[number];

export const VISIBILITIES = ['shared', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const BANK_ACCOUNT_TYPES = ['savings', 'current', 'salary', 'nre', 'nro', 'wallet', 'cash', 'other'] as const;
export const CARD_NETWORKS = ['visa', 'mastercard', 'rupay', 'amex', 'diners', 'discover', 'other'] as const;
export const ACCOUNT_STATUSES = ['active', 'dormant', 'closed'] as const;

/**
 * A payment instrument is encoded as "bank:<uuid>" or "card:<uuid>" in forms
 * so a single picker can choose between bank accounts and cards.
 */
export type InstrumentKey = `bank:${string}` | `card:${string}`;

export const parseInstrumentKey = (
  key: string | null | undefined,
): { bankAccountId: string | null; creditCardId: string | null } => {
  if (!key) return { bankAccountId: null, creditCardId: null };
  const [kind, id] = key.split(':');
  if (kind === 'bank' && id) return { bankAccountId: id, creditCardId: null };
  if (kind === 'card' && id) return { bankAccountId: null, creditCardId: id };
  return { bankAccountId: null, creditCardId: null };
};

export const toInstrumentKey = (bankAccountId?: string | null, creditCardId?: string | null): InstrumentKey | null => {
  if (bankAccountId) return `bank:${bankAccountId}`;
  if (creditCardId) return `card:${creditCardId}`;
  return null;
};

const amountString = z
  .string()
  .trim()
  .min(1, 'Enter an amount')
  .refine((v) => {
    const minor = tryParseAmountInput(v);
    return minor !== null && minor > 0 && minor <= MAX_MINOR;
  }, 'Enter an amount greater than zero, with up to two decimals');

const optionalAmountString = z
  .string()
  .trim()
  .refine((v) => v === '' || tryParseAmountInput(v) !== null, 'Enter a valid amount');

const isoDate = z.string().refine(isISODate, 'Choose a valid date');
const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);
const last4 = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{4}$/.test(v), 'Enter exactly the last 4 digits');

export const transactionFormSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    title: z.string().trim().min(1, 'Add a short title').max(140),
    amount: amountString,
    occurredOn: isoDate,
    categoryId: z.string().nullable(),
    subcategoryId: z.string().nullable(),
    paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
    instrument: z.string().nullable(),
    toInstrument: z.string().nullable(),
    spentByMemberId: z.string().min(1, 'Choose who spent it'),
    merchant: optionalText(140),
    notes: optionalText(2000),
    visibility: z.enum(VISIBILITIES),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'transfer') {
      if (!value.instrument) ctx.addIssue({ code: 'custom', path: ['instrument'], message: 'Choose where the money came from' });
      if (!value.toInstrument) ctx.addIssue({ code: 'custom', path: ['toInstrument'], message: 'Choose where the money went' });
      if (value.instrument && value.instrument === value.toInstrument) {
        ctx.addIssue({ code: 'custom', path: ['toInstrument'], message: 'Choose two different accounts' });
      }
    }
  });

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export const familySchema = z.object({
  name: z.string().trim().min(1, 'Give your family a name').max(80),
  baseCurrency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
  displayName: z.string().trim().min(1, 'Tell us your name').max(80),
});
export type FamilyFormValues = z.infer<typeof familySchema>;

export const invitationSchema = z.object({
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email address'),
  role: z.enum(FAMILY_ROLES),
  memberId: z.string().nullable(),
});
export type InvitationFormValues = z.infer<typeof invitationSchema>;

export const memberSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter a name').max(80),
  relationship: z.enum(MEMBER_RELATIONSHIPS),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
export type MemberFormValues = z.infer<typeof memberSchema>;

export const bankAccountSchema = z.object({
  bankName: z.string().trim().min(1, 'Enter the bank name').max(80),
  nickname: z.string().trim().min(1, 'Give the account a nickname').max(60),
  accountType: z.enum(BANK_ACCOUNT_TYPES),
  last4,
  currency: z.string().regex(/^[A-Z]{3}$/),
  openingBalance: optionalAmountString,
  openingBalanceDate: isoDate,
  ownerMemberId: z.string().min(1, 'Choose the account holder'),
  visibility: z.enum(VISIBILITIES),
  status: z.enum(ACCOUNT_STATUSES),
});
export type BankAccountFormValues = z.infer<typeof bankAccountSchema>;

const dayOfMonth = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 31), 'Enter a day between 1 and 31');

export const creditCardSchema = z.object({
  issuer: z.string().trim().min(1, 'Enter the issuing bank').max(80),
  nickname: z.string().trim().min(1, 'Give the card a nickname').max(60),
  network: z.enum(CARD_NETWORKS),
  last4,
  currency: z.string().regex(/^[A-Z]{3}$/),
  creditLimit: optionalAmountString,
  statementDay: dayOfMonth,
  paymentDueDay: dayOfMonth,
  openingOutstanding: optionalAmountString,
  openingBalanceDate: isoDate,
  ownerMemberId: z.string().min(1, 'Choose the cardholder'),
  visibility: z.enum(VISIBILITIES),
  status: z.enum(ACCOUNT_STATUSES),
});
export type CreditCardFormValues = z.infer<typeof creditCardSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
  kind: z.enum(['expense', 'income']),
  parentId: z.string().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
  icon: z.string().max(60).nullable(),
});
export type CategoryFormValues = z.infer<typeof categorySchema>;

export const signUpSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Tell us your name').max(80),
    email: z.string().trim().toLowerCase().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
export type SignUpValues = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
export type SignInValues = z.infer<typeof signInSchema>;
