/**
 * Calendar dates are exchanged as ISO strings ("2026-11-03") and never as
 * Date objects with times, which avoids timezone shifts between the device
 * and the database `date` columns.
 */

export type ISODate = string & { readonly __brand?: 'ISODate' };

export type DateRange = { from: ISODate; to: ISODate };

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isISODate = (value: string): value is ISODate => {
  const match = ISO_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d);
};

/** Local calendar date of a Date object. */
export const toISODate = (date: Date): ISODate => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const todayISO = (now: Date = new Date()): ISODate => toISODate(now);

/** Parses an ISO date as a local Date at midnight. */
export const parseISODate = (iso: ISODate): Date => {
  const match = ISO_PATTERN.exec(iso);
  if (!match) throw new Error(`Invalid ISO date "${iso}"`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

export const addDays = (iso: ISODate, days: number): ISODate => {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

/** Adds months, clamping to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
export const addMonths = (iso: ISODate, months: number): ISODate => {
  const d = parseISODate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toISODate(d);
};

export const startOfMonth = (iso: ISODate): ISODate => `${iso.slice(0, 7)}-01`;

export const endOfMonth = (iso: ISODate): ISODate => {
  const d = parseISODate(startOfMonth(iso));
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

/** Monday-based week. */
export const startOfWeek = (iso: ISODate): ISODate => {
  const d = parseISODate(iso);
  const offset = (d.getDay() + 6) % 7;
  return addDays(iso, -offset);
};

export const startOfYear = (iso: ISODate): ISODate => `${iso.slice(0, 4)}-01-01`;
export const endOfYear = (iso: ISODate): ISODate => `${iso.slice(0, 4)}-12-31`;

/** Whole days from a to b (b - a). */
export const daysBetween = (a: ISODate, b: ISODate): number => {
  const ms = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10))) -
    Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
  return Math.round(ms / 86_400_000);
};

export type PeriodPreset = 'this_week' | 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'last_12_months';

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  this_week: 'This week',
  this_month: 'This month',
  last_month: 'Last month',
  last_3_months: 'Last 3 months',
  last_6_months: 'Last 6 months',
  this_year: 'This year',
  last_12_months: 'Last 12 months',
};

export const rangeForPreset = (preset: PeriodPreset, today: ISODate = todayISO()): DateRange => {
  switch (preset) {
    case 'this_week':
      return { from: startOfWeek(today), to: addDays(startOfWeek(today), 6) };
    case 'this_month':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'last_month': {
      const prev = addMonths(startOfMonth(today), -1);
      return { from: prev, to: endOfMonth(prev) };
    }
    case 'last_3_months':
      return { from: addMonths(startOfMonth(today), -2), to: endOfMonth(today) };
    case 'last_6_months':
      return { from: addMonths(startOfMonth(today), -5), to: endOfMonth(today) };
    case 'this_year':
      return { from: startOfYear(today), to: endOfYear(today) };
    case 'last_12_months':
      return { from: addMonths(startOfMonth(today), -11), to: endOfMonth(today) };
    default: {
      const exhaustive: never = preset;
      throw new Error(`Unknown preset ${String(exhaustive)}`);
    }
  }
};

/** The range of equal length immediately before the given one (for comparisons). */
export const previousRange = (range: DateRange): DateRange => {
  // Whole calendar months compare against the previous whole months.
  if (range.from === startOfMonth(range.from) && range.to === endOfMonth(range.to)) {
    const months =
      (Number(range.to.slice(0, 4)) - Number(range.from.slice(0, 4))) * 12 +
      (Number(range.to.slice(5, 7)) - Number(range.from.slice(5, 7))) +
      1;
    const from = addMonths(range.from, -months);
    return { from, to: endOfMonth(addMonths(range.to, -months)) };
  }
  const length = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "3 Nov 2026"; omits the year when it is the current year. */
export const formatDisplayDate = (iso: ISODate, today: ISODate = todayISO()): string => {
  const d = parseISODate(iso);
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${d.getFullYear()}`;
};

/** "Today", "Yesterday", or a display date — used for list section headers. */
export const formatRelativeDay = (iso: ISODate, today: ISODate = todayISO()): string => {
  const diff = daysBetween(iso, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return formatDisplayDate(iso, today);
};

/** "Nov" or "Nov '26". */
export const formatMonthShort = (iso: ISODate, withYear = false): string => {
  const d = parseISODate(iso);
  const month = MONTHS_SHORT[d.getMonth()] ?? '';
  return withYear ? `${month} '${String(d.getFullYear()).slice(2)}` : month;
};

export const formatRange = (range: DateRange, today: ISODate = todayISO()): string => {
  if (range.from === range.to) return formatDisplayDate(range.from, today);
  if (range.from === startOfMonth(range.from) && range.to === endOfMonth(range.from)) {
    const d = parseISODate(range.from);
    return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  }
  return `${formatDisplayDate(range.from, today)} – ${formatDisplayDate(range.to, today)}`;
};

const MONTH_INDEX: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

/**
 * Parses the date formats found in Indian bank and card statements:
 * 03/11/2026, 03-11-26, 03.11.2026, 03-Nov-2026, 3 Nov 26, 2026-11-03,
 * Nov 03, 2026. Day-first is assumed for numeric dates unless dayFirst=false.
 * Returns null when the string is not a valid date.
 */
export const parseStatementDate = (input: string, options: { dayFirst?: boolean } = {}): ISODate | null => {
  const dayFirst = options.dayFirst ?? true;
  const s = input.trim().toUpperCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let y: number | undefined;
  let m: number | undefined;
  let d: number | undefined;

  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/.exec(s))) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    [d, m] = dayFirst ? [a, b] : [b, a];
    y = Number(match[3]);
  } else if ((match = /^(\d{1,2})[-/. ]?([A-Z]{3,4})[-/. ]?(\d{2}|\d{4})$/.exec(s))) {
    d = Number(match[1]);
    m = MONTH_INDEX[match[2]!];
    y = Number(match[3]);
  } else if ((match = /^([A-Z]{3,4}) (\d{1,2}) (\d{2}|\d{4})$/.exec(s))) {
    m = MONTH_INDEX[match[1]!];
    d = Number(match[2]);
    y = Number(match[3]);
  }

  if (y === undefined || m === undefined || d === undefined) return null;
  if (y < 100) y += 2000;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isISODate(iso) ? iso : null;
};
