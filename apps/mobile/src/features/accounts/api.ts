import { fromDb, toDecimalString, tryParseAmountInput, type BankAccountFormValues, type CreditCardFormValues } from '@family-finance/core';
import { check, unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { RpcReturns, Tables } from '@/types/database';

export type BankAccount = Tables<'bank_accounts'>;
export type CreditCard = Tables<'credit_cards'>;
export type AccountBalance = RpcReturns<'get_account_balances'>[number];

export const fetchBankAccounts = async (familyId: string): Promise<BankAccount[]> =>
  unwrap(await supabase.from('bank_accounts').select('*').eq('family_id', familyId).order('status').order('created_at'));

export const fetchCreditCards = async (familyId: string): Promise<CreditCard[]> =>
  unwrap(await supabase.from('credit_cards').select('*').eq('family_id', familyId).order('status').order('created_at'));

export const fetchBalances = async (familyId: string): Promise<AccountBalance[]> =>
  unwrap(await supabase.rpc('get_account_balances', { p_family_id: familyId }));

const amountOrZero = (value: string) => toDecimalString(tryParseAmountInput(value || '0') ?? 0);
const amountOrNull = (value: string) => (value.trim() ? toDecimalString(tryParseAmountInput(value) ?? 0) : null);
const dayOrNull = (value: string) => (value.trim() ? Number(value) : null);

const bankRow = (v: BankAccountFormValues) => ({
  bank_name: v.bankName,
  nickname: v.nickname,
  account_type: v.accountType,
  last4: v.last4 || null,
  currency: v.currency,
  opening_balance: Number(amountOrZero(v.openingBalance)),
  opening_balance_date: v.openingBalanceDate,
  owner_member_id: v.ownerMemberId,
  visibility: v.visibility,
  status: v.status,
});

const cardRow = (v: CreditCardFormValues) => ({
  issuer: v.issuer,
  nickname: v.nickname,
  network: v.network,
  last4: v.last4 || null,
  currency: v.currency,
  credit_limit: amountOrNull(v.creditLimit) === null ? null : Number(amountOrNull(v.creditLimit)),
  statement_day: dayOrNull(v.statementDay),
  payment_due_day: dayOrNull(v.paymentDueDay),
  opening_outstanding: Number(amountOrZero(v.openingOutstanding)),
  opening_balance_date: v.openingBalanceDate,
  owner_member_id: v.ownerMemberId,
  visibility: v.visibility,
  status: v.status,
});

export const saveBankAccount = async (familyId: string, userId: string, values: BankAccountFormValues, id?: string) => {
  if (id) {
    check(await supabase.from('bank_accounts').update(bankRow(values)).eq('id', id));
  } else {
    check(await supabase.from('bank_accounts').insert({ ...bankRow(values), family_id: familyId, created_by: userId }));
  }
};

export const saveCreditCard = async (familyId: string, userId: string, values: CreditCardFormValues, id?: string) => {
  if (id) {
    check(await supabase.from('credit_cards').update(cardRow(values)).eq('id', id));
  } else {
    check(await supabase.from('credit_cards').insert({ ...cardRow(values), family_id: familyId, created_by: userId }));
  }
};

export const deleteBankAccount = async (id: string) => {
  check(await supabase.from('bank_accounts').delete().eq('id', id));
};

export const deleteCreditCard = async (id: string) => {
  check(await supabase.from('credit_cards').delete().eq('id', id));
};

export const balanceMinor = (b: AccountBalance) => fromDb(b.balance);
