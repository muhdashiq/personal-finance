import {
  parseAmountInput,
  parseInstrumentKey,
  type ISODate,
  type TransactionFormValues,
  type TransactionType,
} from '@family-finance/core';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { check, toAppError, unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database';
import { enqueueTransaction } from './outbox';

export type Transaction = Tables<'transactions'>;
export type Attachment = Tables<'attachments'>;

export const PAGE_SIZE = 40;

export type TransactionFilters = {
  search?: string;
  type?: TransactionType;
  memberId?: string;
  categoryId?: string;
  instrument?: string;
  from?: ISODate;
  to?: ISODate;
};

/** Strip characters that have meaning in PostgREST filter syntax. */
const sanitizeSearch = (value: string) => value.replace(/[,()%*\\:"]/g, ' ').trim().slice(0, 60);

export const fetchTransactionsPage = async (
  familyId: string,
  filters: TransactionFilters,
  page: number,
): Promise<Transaction[]> => {
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('family_id', familyId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (filters.type) query = query.eq('type', filters.type);
  if (filters.memberId) query = query.eq('spent_by_member_id', filters.memberId);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.from) query = query.gte('occurred_on', filters.from);
  if (filters.to) query = query.lte('occurred_on', filters.to);
  if (filters.instrument) {
    const { bankAccountId, creditCardId } = parseInstrumentKey(filters.instrument);
    if (bankAccountId) query = query.or(`bank_account_id.eq.${bankAccountId},counterparty_bank_account_id.eq.${bankAccountId}`);
    if (creditCardId) query = query.or(`credit_card_id.eq.${creditCardId},counterparty_credit_card_id.eq.${creditCardId}`);
  }
  const search = filters.search ? sanitizeSearch(filters.search) : '';
  if (search) query = query.or(`title.ilike.*${search}*,merchant.ilike.*${search}*,notes.ilike.*${search}*`);

  return unwrap(await query);
};

export const fetchRecentTransactions = async (familyId: string, limit = 5): Promise<Transaction[]> =>
  unwrap(
    await supabase
      .from('transactions')
      .select('*')
      .eq('family_id', familyId)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
  );

export const fetchTransaction = async (id: string): Promise<Transaction> =>
  unwrap(await supabase.from('transactions').select('*').eq('id', id).single());

/** Converts validated form values into a database row. */
export const toTransactionRow = (
  values: TransactionFormValues,
  context: { familyId: string; currency: string },
): Omit<TablesInsert<'transactions'>, 'id' | 'created_by'> => {
  const source = parseInstrumentKey(values.instrument);
  const destination = parseInstrumentKey(values.type === 'transfer' ? values.toInstrument : null);
  const isTransfer = values.type === 'transfer';
  return {
    family_id: context.familyId,
    type: values.type,
    title: values.title.trim(),
    // numeric(14,2): minor units / 100 is exact for every value the column can hold.
    amount: parseAmountInput(values.amount) / 100,
    currency: context.currency,
    occurred_on: values.occurredOn,
    category_id: isTransfer ? null : values.categoryId,
    subcategory_id: isTransfer ? null : values.subcategoryId,
    payment_method: values.paymentMethod,
    bank_account_id: source.bankAccountId,
    credit_card_id: source.creditCardId,
    counterparty_bank_account_id: destination.bankAccountId,
    counterparty_credit_card_id: destination.creditCardId,
    spent_by_member_id: values.spentByMemberId,
    merchant: values.merchant.trim() || null,
    notes: values.notes.trim() || null,
    visibility: values.visibility,
  };
};

export type CreateResult = { id: string; queued: boolean };

/**
 * Creates a transaction with a client-generated id. If the device is offline
 * (or the request fails at the network level) the row is queued and synced
 * later; the id makes the eventual insert idempotent.
 */
export const createTransaction = async (
  row: Omit<TablesInsert<'transactions'>, 'id' | 'created_by'>,
  userId: string,
): Promise<CreateResult> => {
  const full: TablesInsert<'transactions'> = { ...row, id: Crypto.randomUUID(), created_by: userId };
  const network = await NetInfo.fetch();
  if (network.isConnected === false) {
    enqueueTransaction(full);
    return { id: full.id!, queued: true };
  }
  const { error } = await supabase.from('transactions').insert(full);
  if (error) {
    const appError = toAppError(error);
    if (appError.isNetwork) {
      enqueueTransaction(full);
      return { id: full.id!, queued: true };
    }
    throw appError;
  }
  return { id: full.id!, queued: false };
};

export const updateTransaction = async (id: string, patch: TablesUpdate<'transactions'>) => {
  check(await supabase.from('transactions').update(patch).eq('id', id));
};

export const deleteTransaction = async (id: string) => {
  check(await supabase.from('transactions').delete().eq('id', id));
};

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

export const fetchAttachments = async (transactionId: string): Promise<Attachment[]> =>
  unwrap(await supabase.from('attachments').select('*').eq('transaction_id', transactionId).order('created_at'));

export type LocalFile = { uri: string; mimeType: string; fileName: string; size: number };

export const uploadReceipt = async (familyId: string, transactionId: string, file: LocalFile, userId: string) => {
  const extension = file.fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${familyId}/${transactionId}/${Crypto.randomUUID()}.${extension}`;
  const body = await (await fetch(file.uri)).arrayBuffer();
  check(await supabase.storage.from('receipts').upload(path, body, { contentType: file.mimeType, upsert: false }));
  const { error } = await supabase.from('attachments').insert({
    family_id: familyId,
    transaction_id: transactionId,
    bucket: 'receipts',
    storage_path: path,
    file_name: file.fileName.slice(0, 200),
    mime_type: file.mimeType,
    size_bytes: file.size || body.byteLength,
    uploaded_by: userId,
  });
  if (error) {
    // Do not leave an orphaned object behind.
    await supabase.storage.from('receipts').remove([path]);
    throw toAppError(error);
  }
};

/** Short-lived signed URL; receipts are never public. */
export const receiptUrl = async (attachment: Attachment): Promise<string> => {
  const { data, error } = await supabase.storage.from(attachment.bucket).createSignedUrl(attachment.storage_path, 300);
  if (error || !data) throw toAppError(error);
  return data.signedUrl;
};

export const deleteAttachment = async (attachment: Attachment) => {
  check(await supabase.from('attachments').delete().eq('id', attachment.id));
  await supabase.storage.from(attachment.bucket).remove([attachment.storage_path]);
};
