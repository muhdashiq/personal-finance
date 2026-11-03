import { zodResolver } from '@hookform/resolvers/zod';
import { MEMBER_RELATIONSHIPS, memberSchema, type MemberFormValues } from '@family-finance/core';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { Avatar, Button, Screen, SelectField, Text, TextField } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { toast } from '@/stores/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { MEMBER_COLORS } from '@/theme/tokens';
import { addMember } from '@/features/family/api';
import { useActiveFamily, useInvalidateFamily } from '@/features/family/hooks';
import { RELATIONSHIP_LABELS } from '@/features/family/labels';

export default function AddMember() {
  const theme = useTheme();
  const { family, allMembers } = useActiveFamily();
  const invalidate = useInvalidateFamily();
  const { control, handleSubmit, watch, formState } = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: { displayName: '', relationship: 'spouse', color: MEMBER_COLORS[allMembers.length % MEMBER_COLORS.length]! },
  });

  const add = useMutation({
    mutationFn: (v: MemberFormValues) => addMember({ familyId: family.id, displayName: v.displayName, relationship: v.relationship, color: v.color }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Member added');
      router.back();
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  return (
    <Screen>
      <Text variant="callout" color="textSecondary">
        Add someone without a login — like a child — so you can track what is spent on or by them. You can invite them to sign in later.
      </Text>
      <View style={{ alignItems: 'center' }}>
        <Avatar name={watch('displayName') || '?'} color={watch('color')} size={64} />
      </View>
      <Controller
        control={control}
        name="displayName"
        render={({ field }) => <TextField label="Name" value={field.value} onChangeText={field.onChange} error={formState.errors.displayName?.message} autoFocus />}
      />
      <Controller
        control={control}
        name="relationship"
        render={({ field }) => (
          <SelectField
            label="Relationship"
            value={field.value}
            onChange={(v) => field.onChange(v ?? 'other')}
            options={MEMBER_RELATIONSHIPS.filter((r) => r !== 'self').map((r) => ({ value: r, label: RELATIONSHIP_LABELS[r] }))}
          />
        )}
      />
      <Controller
        control={control}
        name="color"
        render={({ field }) => (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {MEMBER_COLORS.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityState={{ checked: c === field.value }}
                accessibilityLabel={`Colour ${c}`}
                onPress={() => field.onChange(c)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: c === field.value ? 3 : 0, borderColor: theme.colors.text }}
              />
            ))}
          </View>
        )}
      />
      <Button label="Add member" loading={add.isPending} onPress={handleSubmit((v) => add.mutate(v))} />
    </Screen>
  );
}
