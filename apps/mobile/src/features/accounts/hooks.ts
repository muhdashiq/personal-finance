import { fromDb, maskLast4 } from '@family-finance/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { qk } from '@/lib/queryKeys';
import { useActiveFamily } from '@/features/family/hooks';
import { fetchBalances, fetchBankAccounts, fetchCreditCards, type BankAccount, type CreditCard } from './api';

export const useAccounts = () => {
  const { family } = useActiveFamily();
  return useQuery({
    queryKey: qk.accounts(family.id),
    queryFn: async () => {
      const [banks, cards] = await Promise.all([fetchBankAccounts(family.id), fetchCreditCards(family.id)]);
      return { banks, cards };
    },
  });
};

export const useBalances = () => {
  const { family } = useActiveFamily();
  return useQuery({ queryKey: qk.balances(family.id), queryFn: () => fetchBalances(family.id) });
};

export type Instrument = {
  key: `bank:${string}` | `card:${string}`;
  kind: 'bank' | 'card';
  id: string;
  label: string;
  description: string;
  status: string;
};

export const instrumentLabel = (account: { nickname: string; last4: string | null }) =>
  [account.nickname, maskLast4(account.last4)].filter(Boolean).join(' ');

/** Bank accounts and cards as one list for pickers. */
export const useInstruments = (options: { includeClosed?: boolean } = {}) => {
  const { data } = useAccounts();
  const { memberById } = useActiveFamily();
  return useMemo<Instrument[]>(() => {
    const banks: Instrument[] = (data?.banks ?? []).map((b: BankAccount) => ({
      key: `bank:${b.id}`,
      kind: 'bank',
      id: b.id,
      label: instrumentLabel(b),
      description: `${b.bank_name} · ${memberById(b.owner_member_id)?.display_name ?? ''}`,
      status: b.status,
    }));
    const cards: Instrument[] = (data?.cards ?? []).map((c: CreditCard) => ({
      key: `card:${c.id}`,
      kind: 'card',
      id: c.id,
      label: instrumentLabel(c),
      description: `${c.issuer} credit card · ${memberById(c.owner_member_id)?.display_name ?? ''}`,
      status: c.status,
    }));
    return [...banks, ...cards].filter((i) => options.includeClosed || i.status !== 'closed');
  }, [data, memberById, options.includeClosed]);
};

/** Totals for the dashboard: bank balances and card outstanding in the base currency. */
export const useBalanceTotals = () => {
  const { currency } = useActiveFamily();
  const query = useBalances();
  const totals = useMemo(() => {
    const rows = (query.data ?? []).filter((r) => r.currency === currency && r.status !== 'closed');
    const banks = rows.filter((r) => r.kind === 'bank');
    const cards = rows.filter((r) => r.kind === 'card');
    const cardOutstanding = cards.reduce((sum, r) => sum + Math.max(0, fromDb(r.balance)), 0);
    const creditLimit = cards.reduce((sum, r) => sum + fromDb(r.credit_limit), 0);
    return {
      hasBanks: banks.length > 0,
      hasCards: cards.length > 0,
      bankBalance: banks.reduce((sum, r) => sum + fromDb(r.balance), 0),
      cardOutstanding,
      creditLimit,
      utilization: creditLimit > 0 ? cardOutstanding / creditLimit : null,
    };
  }, [query.data, currency]);
  return { ...query, totals };
};
