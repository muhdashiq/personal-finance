import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Button, Card, ErrorState, PickerSheet, Screen, SelectField, Text, TextField, type PickerOption } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { qk } from '@/lib/queryKeys';
import { confirm } from '@/stores/confirm';
import { toast } from '@/stores/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { createCategory, deleteCategory, mergeCategories, updateCategory } from '@/features/categories/api';
import { useCategories } from '@/features/categories/hooks';
import { useActiveFamily } from '@/features/family/hooks';

const COLORS = ['#5B6CF0', '#E8833A', '#2D9CDB', '#9B51E0', '#4F4F7A', '#D9547A', '#27AE60', '#B5892E', '#1A9E8F', '#8A8FA3'];
const ICONS = [
  'home-outline', 'silverware-fork-knife', 'car-outline', 'account-group-outline', 'bank-outline', 'shopping-outline',
  'heart-pulse', 'school-outline', 'airplane', 'gift-outline', 'paw', 'dumbbell', 'gamepad-variant-outline', 'cellphone',
  'baby-face-outline', 'hammer-wrench', 'briefcase-outline', 'cash-plus', 'chart-line', 'dots-horizontal-circle-outline',
] as const;

export default function CategoryEditor() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { family } = useActiveFamily();
  const params = useLocalSearchParams<{ id: string; kind?: 'expense' | 'income'; parentId?: string }>();
  const { data: categories = [] } = useCategories();
  const isNew = params.id === 'new';
  const existing = categories.find((c) => c.id === params.id);
  const kind = existing?.kind ?? params.kind ?? 'expense';

  const [name, setName] = useState(existing?.name ?? '');
  const [parentId, setParentId] = useState<string | null>(existing ? existing.parent_id : (params.parentId ?? null));
  const [color, setColor] = useState(existing?.color ?? COLORS[0]!);
  const [icon, setIcon] = useState<string>(existing?.icon ?? ICONS[0]);
  const [archived, setArchived] = useState(existing?.is_archived ?? false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.categories(family.id) }),
      queryClient.invalidateQueries({ queryKey: qk.rules(family.id) }),
      queryClient.invalidateQueries({ queryKey: qk.reports(family.id) }),
      queryClient.invalidateQueries({ queryKey: qk.transactions(family.id) }),
    ]);

  const hasChildren = existing ? categories.some((c) => c.parent_id === existing.id) : false;
  const parentOptions: PickerOption[] = categories
    .filter((c) => c.parent_id === null && c.kind === kind && c.id !== existing?.id)
    .map((c) => ({ value: c.id, label: c.name }));
  const mergeTargets: PickerOption[] = categories
    .filter((c) => c.kind === kind && c.id !== existing?.id && (existing?.parent_id !== null || c.parent_id === null))
    .map((c) => ({
      value: c.id,
      label: c.parent_id ? `${categories.find((p) => p.id === c.parent_id)?.name ?? ''} › ${c.name}` : c.name,
    }));

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Enter a name');
      if (isNew) {
        await createCategory({ familyId: family.id, name: trimmed, kind, parentId, color, icon });
      } else {
        await updateCategory(existing!.id, {
          name: trimmed,
          is_archived: archived,
          ...(existing!.parent_id ? { parent_id: parentId } : { color, icon }),
        });
      }
    },
    onSuccess: async () => {
      await refresh();
      toast.success(isNew ? 'Category added' : 'Category saved');
      router.back();
    },
    onError: (e) => toast.error(toAppError(e, (e as Error).message).message),
  });

  const merge = useMutation({
    mutationFn: (targetId: string) => mergeCategories(existing!.id, targetId),
    onSuccess: async () => {
      await refresh();
      toast.success('Categories merged');
      router.back();
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const remove = useMutation({
    mutationFn: () => deleteCategory(existing!.id),
    onSuccess: async () => {
      await refresh();
      toast.show('Category deleted');
      router.back();
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  if (!isNew && !existing) return <ErrorState message="This category no longer exists." />;
  const isTopLevel = parentId === null;

  return (
    <Screen>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={60} autoFocus={isNew} />
      {(isNew || existing?.parent_id) && !hasChildren ? (
        <SelectField
          label="Parent category"
          value={parentId}
          options={parentOptions}
          onChange={setParentId}
          allowClear={isNew}
          clearLabel="None (top-level category)"
          placeholder="None (top-level category)"
        />
      ) : null}

      {isTopLevel ? (
        <Card style={{ gap: theme.spacing.md }}>
          <Text variant="subhead" color="textSecondary">
            Colour
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityState={{ checked: c === color }}
                accessibilityLabel={`Colour ${c}`}
                onPress={() => setColor(c)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: c === color ? 3 : 0, borderColor: theme.colors.text }}
              />
            ))}
          </View>
          <Text variant="subhead" color="textSecondary">
            Icon
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {ICONS.map((i) => (
              <Pressable
                key={i}
                accessibilityRole="radio"
                accessibilityState={{ checked: i === icon }}
                accessibilityLabel={i.replace(/-/g, ' ')}
                onPress={() => setIcon(i)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: i === icon ? `${color}33` : theme.colors.surfaceSecondary,
                }}
              >
                <MaterialCommunityIcons name={i} size={22} color={i === icon ? color : theme.colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}

      {!isNew ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="body">Archived</Text>
              <Text variant="footnote" color="textSecondary">
                Hidden when adding transactions; history keeps it.
              </Text>
            </View>
            <Switch value={archived} onValueChange={setArchived} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} />
          </View>
        </Card>
      ) : null}

      <Button label={isNew ? 'Add category' : 'Save'} loading={save.isPending} onPress={() => save.mutate()} />

      {!isNew ? (
        <>
          <Button label="Merge into another category…" variant="secondary" loading={merge.isPending} onPress={() => setMergeOpen(true)} />
          <Button
            label="Delete category"
            variant="destructive"
            loading={remove.isPending}
            onPress={async () => {
              const ok = await confirm({
                title: `Delete “${existing!.name}”?`,
                message: hasChildren
                  ? 'Its subcategories are deleted too. Transactions keep their amounts but become uncategorised. Merging keeps them categorised.'
                  : 'Transactions in it become uncategorised. Merging keeps them categorised.',
                confirmLabel: 'Delete',
                destructive: true,
              });
              if (ok) remove.mutate();
            }}
          />
          <PickerSheet
            visible={mergeOpen}
            title={`Merge “${existing!.name}” into`}
            options={mergeTargets}
            onClose={() => setMergeOpen(false)}
            onSelect={async (target) => {
              if (!target) return;
              const label = mergeTargets.find((t) => t.value === target)?.label;
              const ok = await confirm({
                title: 'Merge categories?',
                message: `All transactions, rules and budgets in “${existing!.name}” move to “${label}”, and “${existing!.name}” is removed.`,
                confirmLabel: 'Merge',
              });
              if (ok) merge.mutate(target);
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
