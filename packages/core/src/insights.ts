/**
 * Data-backed insights. Every insight is derived from totals the caller
 * passes in (which come from the reporting RPCs) — nothing is invented, and
 * small or noisy changes are suppressed.
 */
import { formatMoney, percentChange, percentOf, type CurrencyCode, type Minor } from './money';

export type CategoryTotal = { categoryId: string | null; name: string; amountMinor: Minor };

export type Insight = {
  id: string;
  tone: 'positive' | 'negative' | 'neutral';
  title: string;
  detail: string;
};

export type InsightInput = {
  currency: CurrencyCode;
  periodLabel: string;
  previousPeriodLabel: string;
  income: Minor;
  expenses: Minor;
  previousExpenses: Minor;
  categories: readonly CategoryTotal[];
  previousCategories: readonly CategoryTotal[];
  /** Minimum absolute change worth mentioning. Default ₹1,000. */
  minAbsoluteChange?: Minor;
  /** Minimum relative change worth mentioning, in percent. Default 15. */
  minPercentChange?: number;
};

export const buildInsights = (input: InsightInput): Insight[] => {
  const minAbs = input.minAbsoluteChange ?? 100_000;
  const minPct = input.minPercentChange ?? 15;
  const money = (m: Minor) => formatMoney(m, input.currency, { wholeOnly: true });
  const insights: Insight[] = [];

  const totalChange = percentChange(input.expenses, input.previousExpenses);
  if (totalChange !== null && Math.abs(input.expenses - input.previousExpenses) >= minAbs && Math.abs(totalChange) >= minPct) {
    const up = totalChange > 0;
    insights.push({
      id: 'total-expenses-change',
      tone: up ? 'negative' : 'positive',
      title: `Spending ${up ? 'up' : 'down'} ${Math.abs(totalChange)}%`,
      detail: `You spent ${money(Math.abs(input.expenses - input.previousExpenses))} ${up ? 'more' : 'less'} ${input.periodLabel.toLowerCase()} than ${input.previousPeriodLabel.toLowerCase()}.`,
    });
  }

  const previousByKey = new Map(input.previousCategories.map((c) => [c.categoryId ?? c.name, c.amountMinor]));
  const changes = input.categories
    .map((c) => {
      const previous = previousByKey.get(c.categoryId ?? c.name) ?? 0;
      return { ...c, previous, delta: c.amountMinor - previous, pct: percentChange(c.amountMinor, previous) };
    })
    .filter((c) => c.pct !== null && Math.abs(c.delta) >= minAbs && Math.abs(c.pct) >= minPct)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  for (const c of changes) {
    const up = c.delta > 0;
    insights.push({
      id: `category-change-${c.categoryId ?? c.name}`,
      tone: up ? 'negative' : 'positive',
      title: `${c.name} ${up ? 'increased' : 'decreased'} by ${Math.abs(c.pct!)}%`,
      detail: `${money(c.amountMinor)} ${input.periodLabel.toLowerCase()} vs ${money(c.previous)} ${input.previousPeriodLabel.toLowerCase()}.`,
    });
  }

  const top = [...input.categories].sort((a, b) => b.amountMinor - a.amountMinor)[0];
  const topShare = top ? percentOf(top.amountMinor, input.expenses) : null;
  if (top && topShare !== null && top.amountMinor > 0 && topShare >= 25) {
    insights.push({
      id: 'top-category-share',
      tone: 'neutral',
      title: `${top.name} is ${topShare}% of spending`,
      detail: `${money(top.amountMinor)} of ${money(input.expenses)} went to ${top.name.toLowerCase()}.`,
    });
  }

  const savingsRate = percentOf(input.income - input.expenses, input.income);
  if (savingsRate !== null) {
    insights.push(
      savingsRate >= 0
        ? {
            id: 'savings-rate',
            tone: savingsRate >= 20 ? 'positive' : 'neutral',
            title: `You saved ${savingsRate}% of income`,
            detail: `${money(input.income - input.expenses)} left after expenses ${input.periodLabel.toLowerCase()}.`,
          }
        : {
            id: 'savings-rate',
            tone: 'negative',
            title: 'Expenses exceeded income',
            detail: `You spent ${money(input.expenses - input.income)} more than you earned ${input.periodLabel.toLowerCase()}.`,
          },
    );
  }

  return insights;
};
