import {
  PERIOD_LABELS,
  fromDb,
  previousRange,
  rangeForPreset,
  todayISO,
  type DateRange,
  type Minor,
  type PeriodPreset,
} from '@family-finance/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { unwrap } from '@/lib/errors';
import { qk } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import { usePreferences } from '@/stores/preferences';
import { useActiveFamily } from '@/features/family/hooks';

export type CashflowSummary = {
  currency: string;
  income: Minor;
  expenses: Minor;
  refunds: Minor;
  net: Minor;
  transactionCount: number;
  excludedOtherCurrency: number;
  /** Share of income kept, one decimal; null without income. */
  savingsRate: number | null;
};

export type MonthPoint = { month: string; income: Minor; expenses: Minor };
export type CategorySpend = { categoryId: string | null; name: string; icon: string; color: string; amount: Minor; count: number };
export type MemberSpend = { memberId: string; name: string; color: string; income: Minor; expenses: Minor; count: number };

const PREVIOUS_LABEL: Record<PeriodPreset, string> = {
  this_week: 'Last week',
  this_month: 'Last month',
  last_month: 'The month before',
  last_3_months: 'The 3 months before',
  last_6_months: 'The 6 months before',
  this_year: 'Last year',
  last_12_months: 'The 12 months before',
};

/** The selected reporting period and the one to compare it with. */
export const usePeriod = () => {
  const preset = usePreferences((s) => s.period);
  return useMemo(() => {
    const range = rangeForPreset(preset, todayISO());
    return { preset, range, previous: previousRange(range), label: PERIOD_LABELS[preset], previousLabel: PREVIOUS_LABEL[preset] };
  }, [preset]);
};

/** In individual view, reports are filtered to the signed-in member. */
export const useScopeMemberId = (): string | undefined => {
  const scope = usePreferences((s) => s.scope);
  const { me } = useActiveFamily();
  return scope === 'individual' ? me.id : undefined;
};

export const fetchCashflowSummary = async (familyId: string, range: DateRange, memberId?: string): Promise<CashflowSummary> => {
  const rows = unwrap(
    await supabase.rpc('get_cashflow_summary', { p_family_id: familyId, p_from: range.from, p_to: range.to, p_member_id: memberId }),
  );
  const row = rows[0];
  const income = fromDb(row?.income);
  const expenses = fromDb(row?.expenses);
  return {
    currency: row?.currency ?? 'INR',
    income,
    expenses,
    refunds: fromDb(row?.refunds),
    net: fromDb(row?.net),
    transactionCount: Number(row?.transaction_count ?? 0),
    excludedOtherCurrency: Number(row?.excluded_other_currency ?? 0),
    savingsRate: income > 0 ? Math.round(((income - expenses) / income) * 1000) / 10 : null,
  };
};

export const useCashflowSummary = (range: DateRange, memberId?: string) => {
  const { family } = useActiveFamily();
  return useQuery({
    queryKey: qk.report(family.id, 'summary', { range, memberId }),
    queryFn: () => fetchCashflowSummary(family.id, range, memberId),
  });
};

export const useMonthlyCashflow = (months: number, memberId?: string) => {
  const { family } = useActiveFamily();
  const end = todayISO();
  return useQuery({
    queryKey: qk.report(family.id, 'monthly', { months, memberId, end }),
    queryFn: async (): Promise<MonthPoint[]> => {
      const rows = unwrap(
        await supabase.rpc('get_monthly_cashflow', { p_family_id: family.id, p_months: months, p_end: end, p_member_id: memberId }),
      );
      return rows.map((r) => ({ month: r.month, income: fromDb(r.income), expenses: fromDb(r.expenses) }));
    },
  });
};

export const fetchCategorySpending = async (
  familyId: string,
  range: DateRange,
  memberId?: string,
  kind: 'expense' | 'income' = 'expense',
): Promise<CategorySpend[]> => {
  const rows = unwrap(
    await supabase.rpc('get_category_spending', {
      p_family_id: familyId,
      p_from: range.from,
      p_to: range.to,
      p_member_id: memberId,
      p_kind: kind,
    }),
  );
  return rows.map((r) => ({
    categoryId: r.category_id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    amount: fromDb(r.amount),
    count: Number(r.transaction_count),
  }));
};

export const useCategorySpending = (range: DateRange, memberId?: string, kind: 'expense' | 'income' = 'expense') => {
  const { family } = useActiveFamily();
  return useQuery({
    queryKey: qk.report(family.id, 'categories', { range, memberId, kind }),
    queryFn: () => fetchCategorySpending(family.id, range, memberId, kind),
  });
};

export const useMemberSpending = (range: DateRange) => {
  const { family } = useActiveFamily();
  return useQuery({
    queryKey: qk.report(family.id, 'members', { range }),
    queryFn: async (): Promise<MemberSpend[]> => {
      const rows = unwrap(await supabase.rpc('get_member_spending', { p_family_id: family.id, p_from: range.from, p_to: range.to }));
      return rows.map((r) => ({
        memberId: r.member_id,
        name: r.display_name,
        color: r.color,
        income: fromDb(r.income),
        expenses: fromDb(r.expenses),
        count: Number(r.transaction_count),
      }));
    },
  });
};
