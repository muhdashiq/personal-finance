import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, ErrorState, IconBadge, ListRow, Screen, Section, SegmentedControl, SkeletonCard, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { buildCategoryTree, useCategories } from '@/features/categories/hooks';
import { useActiveFamily } from '@/features/family/hooks';

export default function Categories() {
  const theme = useTheme();
  const { canWrite } = useActiveFamily();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const categories = useCategories();

  const tree = buildCategoryTree(categories.data ?? [], kind);

  return (
    <Screen>
      <SegmentedControl
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {canWrite ? <Button label="Add category" icon="add" variant="secondary" onPress={() => router.push(`/categories/new?kind=${kind}`)} /> : null}
      {categories.isLoading ? (
        <SkeletonCard />
      ) : categories.error ? (
        <ErrorState message={categories.error.message} onRetry={() => void categories.refetch()} />
      ) : (
        tree.map((parent) => (
          <Section key={parent.id}>
            <ListRow
              title={parent.name}
              subtitle={parent.is_archived ? 'Archived' : `${parent.children.length} subcategor${parent.children.length === 1 ? 'y' : 'ies'}`}
              leading={<IconBadge icon={parent.icon ?? 'shape-outline'} color={parent.color ?? theme.colors.textSecondary} />}
              onPress={canWrite ? () => router.push(`/categories/${parent.id}`) : undefined}
            />
            {parent.children.map((child) => (
              <ListRow
                key={child.id}
                title={child.name}
                subtitle={child.is_archived ? 'Archived' : undefined}
                leading={<View style={{ width: 36 }} />}
                onPress={canWrite ? () => router.push(`/categories/${child.id}`) : undefined}
              />
            ))}
            {canWrite ? (
              <ListRow
                title={`Add to ${parent.name}`}
                leading={<View style={{ width: 36 }} />}
                trailing={<Text variant="headline" color="primary">+</Text>}
                chevron={false}
                onPress={() => router.push(`/categories/new?kind=${kind}&parentId=${parent.id}`)}
              />
            ) : null}
          </Section>
        ))
      )}
    </Screen>
  );
}
