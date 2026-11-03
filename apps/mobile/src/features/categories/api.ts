import type { CategoryNode, CategoryRule, LearnedRuleDraft } from '@family-finance/core';
import { check, unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type Category = Tables<'transaction_categories'>;

export const fetchCategories = async (familyId: string): Promise<Category[]> =>
  unwrap(
    await supabase
      .from('transaction_categories')
      .select('*')
      .eq('family_id', familyId)
      .order('kind')
      .order('sort_order')
      .order('name'),
  );

export const createCategory = async (input: {
  familyId: string;
  name: string;
  kind: 'expense' | 'income';
  parentId: string | null;
  color: string | null;
  icon: string | null;
}): Promise<Category> =>
  unwrap(
    await supabase
      .from('transaction_categories')
      .insert({
        family_id: input.familyId,
        name: input.name,
        kind: input.kind,
        parent_id: input.parentId,
        color: input.parentId ? null : input.color,
        icon: input.parentId ? null : input.icon,
        sort_order: 1000,
      })
      .select('*')
      .single(),
  );

export const updateCategory = async (
  id: string,
  patch: Partial<Pick<Category, 'name' | 'color' | 'icon' | 'is_archived' | 'parent_id'>>,
) => {
  check(await supabase.from('transaction_categories').update(patch).eq('id', id));
};

export const deleteCategory = async (id: string) => {
  check(await supabase.from('transaction_categories').delete().eq('id', id));
};

export const mergeCategories = async (sourceId: string, targetId: string) => {
  check(await supabase.rpc('merge_categories', { p_source_id: sourceId, p_target_id: targetId }));
};

export const fetchRules = async (familyId: string): Promise<CategoryRule[]> => {
  const rows = unwrap(
    await supabase.from('transaction_rules').select('*').eq('family_id', familyId).order('priority'),
  );
  return rows.map((r) => ({
    id: r.id,
    matchField: r.match_field as CategoryRule['matchField'],
    matchType: r.match_type as CategoryRule['matchType'],
    pattern: r.pattern,
    categoryId: r.category_id,
    subcategoryId: r.subcategory_id,
    setMerchant: r.set_merchant,
    priority: r.priority,
    origin: r.origin as CategoryRule['origin'],
    isActive: r.is_active,
  }));
};

/** Stores a learned rule; an identical pattern updates the existing rule. */
export const saveLearnedRule = async (familyId: string, userId: string, draft: LearnedRuleDraft) => {
  const existing = unwrap(
    await supabase
      .from('transaction_rules')
      .select('id, origin')
      .eq('family_id', familyId)
      .eq('match_field', draft.matchField)
      .eq('match_type', draft.matchType)
      .ilike('pattern', draft.pattern),
  );
  const match = existing[0];
  if (match) {
    // Never overwrite a rule a person wrote by hand.
    if (match.origin === 'user') return;
    check(
      await supabase
        .from('transaction_rules')
        .update({ category_id: draft.categoryId, subcategory_id: draft.subcategoryId })
        .eq('id', match.id),
    );
    return;
  }
  check(
    await supabase.from('transaction_rules').insert({
      family_id: familyId,
      match_field: draft.matchField,
      match_type: draft.matchType,
      pattern: draft.pattern,
      category_id: draft.categoryId,
      subcategory_id: draft.subcategoryId,
      origin: 'learned',
      priority: draft.priority,
      created_by: userId,
    }),
  );
};

export const toCategoryNodes = (categories: readonly Category[]): CategoryNode[] =>
  categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parent_id, kind: c.kind, isArchived: c.is_archived }));
