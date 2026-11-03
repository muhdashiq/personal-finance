/**
 * Money is handled as an integer number of minor units (paise, cents) in the
 * app and as numeric(14,2) in PostgreSQL. Floating point is only used at the
 * very edge, when PostgREST hands back a JSON number, and is rounded
 * immediately.
 */

/** Integer amount in minor units, e.g. ₹1,234.50 => 123450. */
export type Minor = number;

export type CurrencyCode = string;

/** Largest amount numeric(14,2) can hold: 999,999,999,999.99 */
export const MAX_MINOR: Minor = 99_999_999_999_999;

export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyParseError';
  }
}

const AMOUNT_PATTERN = /^-?\d+(\.\d{1,2})?$/;

/**
 * Parses user input such as "1,23,456.50", "₹ 450", "2999.9" into minor
 * units. Rejects more than two decimal places instead of silently rounding.
 */
export const parseAmountInput = (input: string): Minor => {
  const cleaned = input.replace(/[\s,₹$€£]/g, '').replace(/^(INR|Rs\.?)/i, '');
  if (cleaned === '' || !AMOUNT_PATTERN.test(cleaned)) {
    throw new MoneyParseError('Enter a valid amount with up to two decimal places');
  }
  return decimalStringToMinor(cleaned);
};

/** Safe variant for forms. */
export const tryParseAmountInput = (input: string): Minor | null => {
  try {
    return parseAmountInput(input);
  } catch {
    return null;
  }
};

const decimalStringToMinor = (value: string): Minor => {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
  if (!Number.isSafeInteger(minor) || minor > MAX_MINOR) {
    throw new MoneyParseError('Amount is too large');
  }
  return negative ? -minor : minor;
};

/**
 * Converts a value returned by the database (numeric arrives as a JSON
 * number through PostgREST, or as a string through pg) into minor units.
 */
export const fromDb = (value: number | string | null | undefined): Minor => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new MoneyParseError('Amount is not a finite number');
    return Math.round(value * 100);
  }
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) throw new MoneyParseError(`Invalid amount "${value}"`);
  const [whole = '0', fraction = ''] = trimmed.replace('-', '').split('.');
  // Round half away from zero on the third decimal (numeric(14,2) never has one, but be safe).
  let minor = Number(whole) * 100 + Number(fraction.padEnd(3, '0').slice(0, 2));
  if (Number(fraction.padEnd(3, '0')[2]) >= 5) minor += 1;
  return trimmed.startsWith('-') ? -minor : minor;
};

/** Minor units => "1234.50", the exact string sent to numeric columns. */
export const toDecimalString = (minor: Minor): string => {
  if (!Number.isSafeInteger(minor)) throw new MoneyParseError('Amount must be an integer number of minor units');
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
};

/** Minor units => value suitable for an editable text field ("1234.5" => "1234.50", whole => "1234"). */
export const toInputString = (minor: Minor): string => {
  const s = toDecimalString(minor);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
};

export const sumMinor = (values: readonly Minor[]): Minor => values.reduce((total, v) => total + v, 0);

/** Percentage of part in whole, rounded to one decimal. Returns null when whole is 0. */
export const percentOf = (part: Minor, whole: Minor): number | null => {
  if (whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
};

/** Percentage change from previous to current, one decimal. Null when there is no baseline. */
export const percentChange = (current: Minor, previous: Minor): number | null => {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
};

const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SGD: 'S$', AUD: 'A$', CAD: 'C$' };

export const currencySymbol = (currency: CurrencyCode): string => SYMBOLS[currency] ?? `${currency} `;

/** Groups digits Indian style (12,34,567) for INR and Western style (1,234,567) otherwise. */
const groupDigits = (whole: string, currency: CurrencyCode): string => {
  if (currency === 'INR' && whole.length > 3) {
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `${rest},${last3}`;
  }
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export type FormatOptions = {
  /** Show +/− sign explicitly. */
  signed?: boolean;
  /** Hide the .00 fraction when the amount is whole. Default false. */
  trimZeroFraction?: boolean;
  /** Hide the fraction entirely (rounds to nearest whole). */
  wholeOnly?: boolean;
};

/**
 * Deterministic currency formatting (does not depend on the device's Intl
 * data, which varies between Hermes builds).
 *   formatMoney(12345650, 'INR') => "₹1,23,456.50"
 */
export const formatMoney = (minor: Minor, currency: CurrencyCode = 'INR', options: FormatOptions = {}): string => {
  const negative = minor < 0;
  let abs = Math.abs(minor);
  if (options.wholeOnly) abs = Math.round(abs / 100) * 100;
  const whole = groupDigits(String(Math.floor(abs / 100)), currency);
  const fraction = String(abs % 100).padStart(2, '0');
  const showFraction = !options.wholeOnly && !(options.trimZeroFraction && fraction === '00');
  const body = `${currencySymbol(currency)}${whole}${showFraction ? `.${fraction}` : ''}`;
  if (negative) return `−${body}`;
  if (options.signed && minor > 0) return `+${body}`;
  return body;
};

/**
 * Short form for charts and tiles: ₹1.2L, ₹3.4Cr for INR; $1.2K, $3.4M otherwise.
 */
export const formatMoneyCompact = (minor: Minor, currency: CurrencyCode = 'INR'): string => {
  const negative = minor < 0;
  const major = Math.abs(minor) / 100;
  const units: Array<[number, string]> =
    currency === 'INR'
      ? [
          [1e7, 'Cr'],
          [1e5, 'L'],
          [1e3, 'K'],
        ]
      : [
          [1e9, 'B'],
          [1e6, 'M'],
          [1e3, 'K'],
        ];
  let text = `${Math.round(major)}`;
  for (const [size, suffix] of units) {
    if (major >= size) {
      const value = major / size;
      const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
      text = `${rounded}${suffix}`;
      break;
    }
  }
  return `${negative ? '−' : ''}${currencySymbol(currency)}${text}`;
};

/** Masks an account/card number for display: "•• 1234". */
export const maskLast4 = (last4: string | null | undefined): string => (last4 ? `•• ${last4}` : '');
