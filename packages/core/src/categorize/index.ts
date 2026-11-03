/**
 * Transaction categorisation engine.
 *
 * Order of precedence (first match wins):
 *   1. Family rules created by users            (confidence 0.98)
 *   2. Rules learned from the family's own corrections (0.9)
 *   3. Built-in merchant dictionary             (0.85)
 *   4. Built-in keyword rules                   (0.6)
 *
 * Optional AI categorisation can be added as a 5th stage server-side; it is
 * intentionally not part of this deterministic engine.
 */
import { merchantKey, normalizeDescription, tokens } from '../text';
import { DEFAULT_KEYWORDS, DEFAULT_MERCHANTS, type CategoryPath, type KeywordRule, type MerchantEntry } from './merchants';

export { DEFAULT_KEYWORDS, DEFAULT_MERCHANTS };
export type { CategoryPath, KeywordRule, MerchantEntry };

export type MatchField = 'merchant' | 'description' | 'any';
export type RuleMatchType = 'contains' | 'equals' | 'starts_with' | 'regex';

export type CategoryRule = {
  id: string;
  matchField: MatchField;
  matchType: RuleMatchType;
  pattern: string;
  categoryId: string;
  subcategoryId: string | null;
  setMerchant?: string | null;
  priority: number;
  origin: 'user' | 'learned';
  isActive: boolean;
};

export type CategoryNode = {
  id: string;
  name: string;
  parentId: string | null;
  kind: 'expense' | 'income';
  isArchived?: boolean;
};

export type CategorizeInput = {
  description: string;
  merchant?: string | null;
  direction?: 'debit' | 'credit';
};

export type CategorySuggestion = {
  categoryId: string;
  subcategoryId: string | null;
  confidence: number;
  source: 'user_rule' | 'learned_rule' | 'merchant' | 'keyword';
  ruleId?: string;
  merchant?: string;
};

const ruleText = (rule: CategoryRule, input: CategorizeInput): string[] => {
  const merchant = (input.merchant ?? '').toUpperCase().trim();
  const description = input.description.toUpperCase();
  const normalized = normalizeDescription(`${input.merchant ?? ''} ${input.description}`);
  switch (rule.matchField) {
    case 'merchant':
      return [merchant, normalizeDescription(input.merchant)].filter(Boolean);
    case 'description':
      return [description, normalizeDescription(input.description)];
    case 'any':
      return [merchant, description, normalized].filter(Boolean);
    default: {
      const exhaustive: never = rule.matchField;
      return exhaustive;
    }
  }
};

const regexCache = new Map<string, RegExp | null>();
const safeRegex = (pattern: string): RegExp | null => {
  if (!regexCache.has(pattern)) {
    try {
      // Guard against catastrophic patterns by limiting length.
      regexCache.set(pattern, pattern.length <= 120 ? new RegExp(pattern, 'i') : null);
    } catch {
      regexCache.set(pattern, null);
    }
  }
  return regexCache.get(pattern) ?? null;
};

export const ruleMatches = (rule: CategoryRule, input: CategorizeInput): boolean => {
  if (!rule.isActive) return false;
  const pattern = rule.pattern.toUpperCase().trim();
  if (!pattern) return false;
  return ruleText(rule, input).some((text) => {
    switch (rule.matchType) {
      case 'contains':
        return text.includes(pattern);
      case 'equals':
        return text === pattern;
      case 'starts_with':
        return text.startsWith(pattern);
      case 'regex':
        return safeRegex(rule.pattern)?.test(text) ?? false;
      default: {
        const exhaustive: never = rule.matchType;
        return exhaustive;
      }
    }
  });
};

/** Finds a family category id by default-tree names (case-insensitive). */
export const resolveCategoryPath = (
  categories: readonly CategoryNode[],
  path: CategoryPath,
): { categoryId: string; subcategoryId: string | null } | null => {
  const parent = categories.find(
    (c) => c.parentId === null && !c.isArchived && c.name.toLowerCase() === path.category.toLowerCase(),
  );
  if (!parent) return null;
  if (!path.subcategory) return { categoryId: parent.id, subcategoryId: null };
  const child = categories.find(
    (c) => c.parentId === parent.id && !c.isArchived && c.name.toLowerCase() === path.subcategory!.toLowerCase(),
  );
  return { categoryId: parent.id, subcategoryId: child?.id ?? null };
};

const containsPhrase = (haystackTokens: string[], phrase: string): boolean => {
  const phraseTokens = phrase.split(' ');
  if (phraseTokens.length === 1) return haystackTokens.includes(phrase);
  for (let i = 0; i <= haystackTokens.length - phraseTokens.length; i += 1) {
    if (phraseTokens.every((t, j) => haystackTokens[i + j] === t)) return true;
  }
  return false;
};

/** Matches the built-in merchant dictionary; returns the entry and the canonical merchant name. */
export const matchMerchant = (
  input: CategorizeInput,
  dictionary: readonly MerchantEntry[] = DEFAULT_MERCHANTS,
): MerchantEntry | null => {
  const normalized = normalizeDescription(`${input.merchant ?? ''} ${input.description}`);
  const words = tokens(normalized);
  const squashed = normalized.replace(/\s+/g, '');
  for (const entry of dictionary) {
    for (const pattern of entry.patterns) {
      const p = normalizeDescription(pattern) || pattern.toUpperCase();
      // Single short tokens ("OLA", "JIO", "LIC") must match a whole word to avoid false hits.
      if (containsPhrase(words, p)) return entry;
      if (p.length >= 6 && !p.includes(' ') && squashed.includes(p)) return entry;
    }
  }
  return null;
};

export type CategorizeContext = {
  categories: readonly CategoryNode[];
  rules?: readonly CategoryRule[];
  merchants?: readonly MerchantEntry[];
  keywords?: readonly KeywordRule[];
};

export const categorize = (input: CategorizeInput, context: CategorizeContext): CategorySuggestion | null => {
  const categoryIds = new Set(context.categories.filter((c) => !c.isArchived).map((c) => c.id));

  const rules = [...(context.rules ?? [])]
    .filter((r) => r.isActive && categoryIds.has(r.categoryId))
    .sort((a, b) => {
      if (a.origin !== b.origin) return a.origin === 'user' ? -1 : 1;
      return a.priority - b.priority;
    });
  for (const rule of rules) {
    if (ruleMatches(rule, input)) {
      return {
        categoryId: rule.categoryId,
        subcategoryId: rule.subcategoryId && categoryIds.has(rule.subcategoryId) ? rule.subcategoryId : null,
        confidence: rule.origin === 'user' ? 0.98 : 0.9,
        source: rule.origin === 'user' ? 'user_rule' : 'learned_rule',
        ruleId: rule.id,
        merchant: rule.setMerchant ?? undefined,
      };
    }
  }

  const entry = matchMerchant(input, context.merchants ?? DEFAULT_MERCHANTS);
  if (entry) {
    const resolved = resolveCategoryPath(context.categories, entry.path);
    if (resolved) return { ...resolved, confidence: 0.85, source: 'merchant', merchant: entry.merchant };
  }

  const words = tokens(normalizeDescription(`${input.merchant ?? ''} ${input.description}`));
  for (const rule of context.keywords ?? DEFAULT_KEYWORDS) {
    if (rule.direction && input.direction && rule.direction !== input.direction) continue;
    if (rule.keywords.some((k) => containsPhrase(words, k))) {
      const resolved = resolveCategoryPath(context.categories, rule.path);
      if (resolved) return { ...resolved, confidence: 0.6, source: 'keyword' };
    }
  }

  return null;
};

export type LearnedRuleDraft = Omit<CategoryRule, 'id' | 'isActive' | 'priority'> & { priority: number };

/**
 * Turns a user's correction into a rule draft so future transactions from the
 * same merchant are categorised the same way. Returns null when there is no
 * stable merchant text to learn from.
 */
export const learnRuleFromCorrection = (
  input: CategorizeInput,
  categoryId: string,
  subcategoryId: string | null,
): LearnedRuleDraft | null => {
  const fromMerchant = merchantKey(input.merchant);
  const key = fromMerchant || merchantKey(input.description);
  if (!key || key.length < 3) return null;
  return {
    matchField: fromMerchant ? 'merchant' : 'any',
    matchType: 'contains',
    pattern: key,
    categoryId,
    subcategoryId,
    origin: 'learned',
    priority: 50,
  };
};
