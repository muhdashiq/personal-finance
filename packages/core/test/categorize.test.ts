import { describe, expect, it } from 'vitest';
import {
  categorize,
  learnRuleFromCorrection,
  matchMerchant,
  resolveCategoryPath,
  ruleMatches,
  type CategoryNode,
  type CategoryRule,
} from '../src/categorize';

// A slice of the default tree as seeded in the database.
const tree: Array<[string, string, string[]]> = [
  ['expense', 'Household', ['Rent', 'Electricity', 'Groceries', 'Internet', 'Mobile & DTH']],
  ['expense', 'Food', ['Restaurants', 'Food delivery', 'Coffee', 'Snacks']],
  ['expense', 'Transportation', ['Fuel', 'Taxi', 'Tolls']],
  ['expense', 'Family', ['Education', 'Medical', 'Shopping']],
  ['expense', 'Financial', ['EMI', 'Insurance', 'Investment']],
  ['expense', 'Lifestyle', ['Travel', 'Subscriptions']],
  ['income', 'Salary', ['Salary', 'Bonus']],
];
const categories: CategoryNode[] = tree.flatMap(([kind, name, children]) => [
  { id: name, name, parentId: null, kind: kind as 'expense' | 'income' },
  ...children.map((c) => ({ id: `${name}/${c}`, name: c, parentId: name, kind: kind as 'expense' | 'income' })),
]);

const expectPath = (description: string, expected: string | null, extra: { merchant?: string; direction?: 'debit' | 'credit' } = {}) => {
  const s = categorize({ description, ...extra }, { categories });
  expect(s ? s.subcategoryId ?? s.categoryId : null).toBe(expected);
};

describe('built-in merchant mapping', () => {
  it.each([
    ['UPI/SWIGGY/412345678901/Payment', 'Food/Food delivery'],
    ['ZOMATO ONLINE ORDER', 'Food/Restaurants'],
    ['AMAZON PAY INDIA PRIVATE LTD', 'Family/Shopping'],
    ['UBER INDIA SYSTEMS', 'Transportation/Taxi'],
    ['OLA CABS', 'Transportation/Taxi'],
    ['BESCOM ELECTRICITY BILL', 'Household/Electricity'],
    ['SWIGGY INSTAMART', 'Household/Groceries'],
    ['NETFLIX.COM', 'Lifestyle/Subscriptions'],
    ['IRCTC E-TICKET', 'Lifestyle/Travel'],
    ['FASTAG RECHARGE NETC', 'Transportation/Tolls'],
  ])('%s → %s', (description, expected) => {
    expectPath(description, expected);
  });

  it('returns a canonical merchant name', () => {
    expect(matchMerchant({ description: 'POS 4521XXXX SWIGGYBANGALORE' })?.merchant).toBe('Swiggy');
  });

  it('matches short merchant names only as whole words', () => {
    expect(matchMerchant({ description: 'COLAB SPACES' })).toBeNull(); // contains "OLA"
    expect(matchMerchant({ description: 'MANJIO TRADERS' })).toBeNull(); // contains "JIO"
  });
});

describe('keyword rules', () => {
  it('categorises by keyword with lower confidence', () => {
    const s = categorize({ description: 'SCHOOL FEE TERM 2', direction: 'debit' }, { categories });
    expect(s).toMatchObject({ subcategoryId: 'Family/Education', source: 'keyword', confidence: 0.6 });
  });

  it('respects direction: salary only for credits', () => {
    expectPath('NEFT ACME CORP SALARY OCT', 'Salary/Salary', { direction: 'credit' });
    expectPath('NEFT ACME CORP SALARY OCT', null, { direction: 'debit' });
  });

  it('returns null when nothing matches', () => {
    expect(categorize({ description: 'XYZ TRADERS' }, { categories })).toBeNull();
  });
});

describe('family rules', () => {
  const rule = (overrides: Partial<CategoryRule>): CategoryRule => ({
    id: 'r1',
    matchField: 'any',
    matchType: 'contains',
    pattern: 'SWIGGY',
    categoryId: 'Food',
    subcategoryId: 'Food/Restaurants',
    priority: 100,
    origin: 'user',
    isActive: true,
    ...overrides,
  });

  it('user rules override the built-in dictionary', () => {
    const s = categorize({ description: 'SWIGGY BANGALORE' }, { categories, rules: [rule({})] });
    expect(s).toMatchObject({ subcategoryId: 'Food/Restaurants', source: 'user_rule', ruleId: 'r1' });
  });

  it('user rules beat learned rules; lower priority numbers win within a group', () => {
    const rules = [
      rule({ id: 'learned', origin: 'learned', priority: 1, subcategoryId: 'Food/Snacks' }),
      rule({ id: 'user-late', priority: 200, subcategoryId: 'Food/Coffee' }),
      rule({ id: 'user-early', priority: 10, subcategoryId: 'Food/Food delivery' }),
    ];
    expect(categorize({ description: 'SWIGGY' }, { categories, rules })?.ruleId).toBe('user-early');
  });

  it('ignores inactive rules and rules pointing at deleted categories', () => {
    const rules = [rule({ isActive: false }), rule({ id: 'gone', categoryId: 'Deleted' })];
    expect(categorize({ description: 'SWIGGY' }, { categories, rules })?.source).toBe('merchant');
  });

  it('supports equals, starts_with and regex matching', () => {
    const input = { description: 'ACME SCHOOL TRUST', merchant: 'Acme School' };
    expect(ruleMatches(rule({ matchField: 'merchant', matchType: 'equals', pattern: 'acme school' }), input)).toBe(true);
    expect(ruleMatches(rule({ matchField: 'description', matchType: 'starts_with', pattern: 'ACME' }), input)).toBe(true);
    expect(ruleMatches(rule({ matchType: 'regex', pattern: 'school\\s+trust$' }), input)).toBe(true);
    expect(ruleMatches(rule({ matchType: 'regex', pattern: '([' }), input)).toBe(false); // invalid regex is ignored
  });
});

describe('learning from corrections', () => {
  it('creates a learned rule from the merchant that applies to future transactions', () => {
    const draft = learnRuleFromCorrection({ description: 'UPI/LOCAL KIRANA STORE/123456789', merchant: 'Sri Ganesh Stores' }, 'Household', 'Household/Groceries');
    expect(draft).toMatchObject({ matchField: 'merchant', pattern: 'SRI GANESH', origin: 'learned' });

    const s = categorize(
      { description: 'UPI/9988776655', merchant: 'SRI GANESH STORES' },
      { categories, rules: [{ ...draft!, id: 'learned-1', isActive: true }] },
    );
    expect(s).toMatchObject({ subcategoryId: 'Household/Groceries', source: 'learned_rule' });
  });

  it('falls back to the description and refuses to learn from noise', () => {
    expect(learnRuleFromCorrection({ description: 'POS 1234XXXX5678 MEHTA OPTICALS' }, 'Family', null)).toMatchObject({
      matchField: 'any',
      pattern: 'MEHTA OPTICALS',
    });
    expect(learnRuleFromCorrection({ description: 'UPI/123456789/' }, 'Family', null)).toBeNull();
  });
});

describe('resolveCategoryPath', () => {
  it('resolves names case-insensitively and tolerates missing subcategories', () => {
    expect(resolveCategoryPath(categories, { category: 'food', subcategory: 'coffee' })).toEqual({ categoryId: 'Food', subcategoryId: 'Food/Coffee' });
    expect(resolveCategoryPath(categories, { category: 'Food', subcategory: 'Deleted' })).toEqual({ categoryId: 'Food', subcategoryId: null });
    expect(resolveCategoryPath(categories, { category: 'Nope' })).toBeNull();
  });
});
