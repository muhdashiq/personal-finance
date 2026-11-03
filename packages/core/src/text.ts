/**
 * Normalisation of bank/card transaction descriptions so that the same
 * merchant compares equal across statements, e.g.
 *   "UPI/DR/412345678901/SWIGGY/YESB/swiggy@yesbank/Payment" => "SWIGGY"
 *   "POS 4521XXXXXXXX1234 SWIGGY BANGALORE IN"               => "SWIGGY BANGALORE"
 */

const CHANNEL_PREFIXES = [
  'UPI', 'IMPS', 'NEFT', 'RTGS', 'POS', 'ECOM', 'ATM', 'ACH', 'NACH', 'BIL', 'BILLPAY', 'MMT', 'INF', 'INFT',
  'TPT', 'DR', 'CR', 'IB', 'MB', 'PCD', 'VPS', 'IPS', 'VIN', 'PAYU', 'RAZORPAY', 'RAZ', 'CCAVENUE', 'BILLDESK',
];

const NOISE_WORDS = new Set([
  ...CHANNEL_PREFIXES,
  'PAYMENT', 'PAYMENTS', 'PAY', 'PVT', 'LTD', 'LIMITED', 'PRIVATE', 'INDIA', 'IN', 'IND', 'THE', 'TO', 'FROM', 'BY',
  'TXN', 'TRANSACTION', 'REF', 'NO', 'ON', 'AT', 'FOR', 'OF', 'VIA', 'COLLECT', 'REQUEST', 'SENT', 'RECEIVED',
  'YESB', 'HDFC', 'ICIC', 'SBIN', 'UTIB', 'KKBK', 'PYTM', 'AXIS', 'OKAXIS', 'OKHDFCBANK', 'OKICICI', 'OKSBI', 'YBL', 'PAYTM',
  'INR', 'RS', 'COM', 'WWW', 'NA',
]);

/** Uppercase, strip ids, VPAs, card numbers and channel noise. */
export const normalizeDescription = (input: string | null | undefined): string => {
  if (!input) return '';
  return input
    .toUpperCase()
    .replace(/[A-Z0-9._-]+@[A-Z0-9.-]+/g, ' ') // UPI VPA / email
    .replace(/\b[0-9X*]{6,}\b/g, ' ') // card numbers, references
    .replace(/\b\d+\b/g, ' ') // stray numbers
    .replace(/[^A-Z0-9&' ]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !NOISE_WORDS.has(token))
    .join(' ')
    .trim();
};

export const tokens = (normalized: string): string[] => (normalized ? normalized.split(' ') : []);

/** A short, stable key for a merchant: the first two significant tokens. */
export const merchantKey = (input: string | null | undefined): string => tokens(normalizeDescription(input)).slice(0, 2).join(' ');

/** Title-cases a normalised merchant for display ("SWIGGY INSTAMART" => "Swiggy Instamart"). */
export const displayMerchant = (normalized: string): string =>
  normalized
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');

/** Levenshtein distance (iterative, O(n*m) time, O(m) memory). */
export const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    prev = current;
  }
  return prev[b.length]!;
};

/** 0..1 similarity of two descriptions after normalisation. */
export const descriptionSimilarity = (a: string | null | undefined, b: string | null | undefined): number => {
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = new Set(tokens(na));
  const tb = new Set(tokens(nb));
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union === 0 ? 0 : intersection / union;

  // One description containing the other ("SWIGGY" vs "SWIGGY BANGALORE").
  const containment = na.includes(nb) || nb.includes(na) ? 0.85 : 0;

  // Merchant names usually lead the description ("SWIGGY ORDER" vs "SWIGGY BANGALORE").
  const [firstA = ''] = tokens(na);
  const [firstB = ''] = tokens(nb);
  const sameLeadingMerchant = firstA.length >= 4 && firstA === firstB ? 0.75 : 0;

  const ka = merchantKey(na);
  const kb = merchantKey(nb);
  const editSimilarity = 1 - levenshtein(ka, kb) / Math.max(ka.length, kb.length, 1);

  return Math.max(jaccard, containment, sameLeadingMerchant, editSimilarity * 0.9);
};

/** FNV-1a 32-bit hash as 8 hex chars; stable across platforms. */
export const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
