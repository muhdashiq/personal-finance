import { categorize, type CategorizeInput, type CategorySuggestion } from '@family-finance/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { qk } from '@/lib/queryKeys';
import { useActiveFamily } from '@/features/family/hooks';
import { fetchCategories, fetchRules, toCategoryNodes, type Category } from './api';

export const useCategories = () => {
  const { family } = useActiveFamily();
  return useQuery({ queryKey: qk.categories(family.id), queryFn: () => fetchCategories(family.id), staleTime: 5 * 60_000 });
};

export const useCategoryRules = () => {
  const { family } = useActiveFamily();
  return useQuery({ queryKey: qk.rules(family.id), queryFn: () => fetchRules(family.id), staleTime: 5 * 60_000 });
};

export type CategoryTree = (Category & { children: Category[] })[];

export const buildCategoryTree = (categories: readonly Category[], kind?: 'expense' | 'income'): CategoryTree => {
  const parents = categories.filter((c) => c.parent_id === null && (!kind || c.kind === kind));
  return parents.map((p) => ({ ...p, children: categories.filter((c) => c.parent_id === p.id) }));
};

export const useCategoryLookup = () => {
  const { data } = useCategories();
  return useMemo(() => {
    const byId = new Map((data ?? []).map((c) => [c.id, c]));
    return {
      categories: data ?? [],
      byId: (id: string | null | undefined) => (id ? byId.get(id) : undefined),
    };
  }, [data]);
};

/** Live category suggestion for a title/merchant, using family rules first. */
export const useCategorySuggestion = (input: CategorizeInput | null): CategorySuggestion | null => {
  const { data: categories } = useCategories();
  const { data: rules } = useCategoryRules();
  return useMemo(() => {
    if (!input || !categories || `${input.description}${input.merchant ?? ''}`.trim().length < 3) return null;
    return categorize(input, { categories: toCategoryNodes(categories), rules: rules ?? [] });
  }, [input, categories, rules]);
};
