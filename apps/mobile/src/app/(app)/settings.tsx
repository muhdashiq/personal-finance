import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Button, Card, IconBadge, ListRow, PickerSheet, Screen, Section, SegmentedControl, Text, TextField } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { qk } from '@/lib/queryKeys';
import { confirm } from '@/stores/confirm';
import { usePreferences, type ThemePreference } from '@/stores/preferences';
import { toast } from '@/stores/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { useUser } from '@/features/auth/AuthProvider';
import { deleteAccount, signOut } from '@/features/auth/api';
import { deleteFamily, exportFamilyData, renameFamily, updateProfile } from '@/features/family/api';
import { useActiveFamily, useInvalidateFamily, useProfile } from '@/features/family/hooks';
import { ROLE_LABELS } from '@/features/family/labels';

const THEMES: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function Settings() {
  const theme = useTheme();
  const user = useUser();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const { family, families, isAdmin, role } = useActiveFamily();
  const invalidateFamily = useInvalidateFamily();
  const themePref = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);
  const setActiveFamilyId = usePreferences((s) => s.setActiveFamilyId);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [familyName, setFamilyName] = useState<string | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [deleteFamilyName, setDeleteFamilyName] = useState('');

  const saveProfile = useMutation({
    mutationFn: () => updateProfile(user.id, { display_name: (displayName ?? '').trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.profile(user.id) });
      setDisplayName(null);
      toast.success('Profile updated');
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const saveFamily = useMutation({
    mutationFn: () => renameFamily(family.id, (familyName ?? '').trim()),
    onSuccess: async () => {
      await invalidateFamily();
      setFamilyName(null);
      toast.success('Family renamed');
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const exportData = useMutation({
    mutationFn: async () => {
      const data = await exportFamilyData(family.id);
      const json = JSON.stringify(data, null, 2);
      const fileName = `family-finance-export-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const file = new File(Paths.cache, fileName);
      if (file.exists) file.delete();
      file.create();
      file.write(json);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export family data' });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const removeFamily = useMutation({
    mutationFn: () => deleteFamily(family.id, deleteFamilyName),
    onSuccess: async () => {
      setActiveFamilyId(null);
      await queryClient.invalidateQueries();
      toast.show('Family deleted');
      router.replace('/');
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const removeAccount = useMutation({
    mutationFn: deleteAccount,
    onError: (e) => toast.error(toAppError(e).message),
  });

  return (
    <Screen>
      <Section title="Profile" grouped={false}>
        <Card style={{ gap: theme.spacing.md }}>
          <TextField label="Your name" value={displayName ?? profile.data?.display_name ?? ''} onChangeText={setDisplayName} maxLength={80} />
          <Text variant="footnote" color="textSecondary">
            Signed in as {user.email}
          </Text>
          {displayName !== null ? <Button label="Save name" size="md" loading={saveProfile.isPending} disabled={!displayName.trim()} onPress={() => saveProfile.mutate()} /> : null}
        </Card>
      </Section>

      <Section title="Appearance" grouped={false}>
        <SegmentedControl options={THEMES} value={themePref} onChange={setTheme} accessibilityLabel="Theme" />
      </Section>

      <Section title="Family" footer={`You are ${ROLE_LABELS[role].toLowerCase()} of ${family.name}.`}>
        {isAdmin ? (
          <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
            <TextField label="Family name" value={familyName ?? family.name} onChangeText={setFamilyName} maxLength={80} />
            {familyName !== null ? (
              <Button label="Rename family" size="md" loading={saveFamily.isPending} disabled={!familyName.trim()} onPress={() => saveFamily.mutate()} />
            ) : null}
          </View>
        ) : null}
        {families.length > 1 ? (
          <ListRow title="Switch family" value={family.name} leading={<IconBadge icon="swap-horizontal" color={theme.colors.primary} ionicon />} onPress={() => setSwitchOpen(true)} />
        ) : null}
        <ListRow title="Categories" leading={<IconBadge icon="pricetags-outline" color={theme.colors.secondary} ionicon />} onPress={() => router.push('/categories')} />
      </Section>

      <Section title="Your data" footer="The export contains everything you can see in this family as JSON. Account and card numbers are never stored beyond the last four digits.">
        <ListRow
          title={exportData.isPending ? 'Preparing export…' : 'Export family data'}
          leading={<IconBadge icon="download-outline" color={theme.colors.investment} ionicon />}
          onPress={() => exportData.mutate()}
          disabled={exportData.isPending}
        />
        <ListRow
          title="Sign out"
          leading={<IconBadge icon="log-out-outline" color={theme.colors.textSecondary} ionicon />}
          onPress={async () => {
            if (await confirm({ title: 'Sign out?', confirmLabel: 'Sign out' })) {
              try {
                await signOut();
              } catch (e) {
                toast.error(toAppError(e).message);
              }
            }
          }}
        />
      </Section>

      <Section title="Danger zone" grouped={false}>
        {isAdmin ? (
          <Card style={{ gap: theme.spacing.md }}>
            <Text variant="headline">Delete {family.name}</Text>
            <Text variant="footnote" color="textSecondary">
              Permanently deletes the family with all its accounts, transactions and history for every member. Type the family name to confirm.
            </Text>
            <TextField value={deleteFamilyName} onChangeText={setDeleteFamilyName} placeholder={family.name} autoCapitalize="none" />
            <Button
              label="Delete family"
              variant="destructive"
              disabled={deleteFamilyName.trim() !== family.name}
              loading={removeFamily.isPending}
              onPress={async () => {
                if (await confirm({ title: 'Delete the whole family?', message: 'This cannot be undone. Export your data first if you need it.', confirmLabel: 'Delete forever', destructive: true })) {
                  removeFamily.mutate();
                }
              }}
            />
          </Card>
        ) : null}
        <Card style={{ gap: theme.spacing.md }}>
          <Text variant="headline">Delete my account</Text>
          <Text variant="footnote" color="textSecondary">
            Removes your login and profile. Families you share keep the transactions you added. If you are the only admin of a family that has
            other members, make someone else admin first.
          </Text>
          <Button
            label="Delete my account"
            variant="destructive"
            loading={removeAccount.isPending}
            onPress={async () => {
              if (await confirm({ title: 'Delete your account?', message: 'This cannot be undone.', confirmLabel: 'Delete account', destructive: true })) {
                removeAccount.mutate();
              }
            }}
          />
        </Card>
      </Section>

      <View style={{ alignItems: 'center', gap: 4 }}>
        <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.textTertiary} />
        <Text variant="caption" color="textTertiary" align="center">
          Family Finance {Constants.expoConfig?.version ?? ''} · Data protected with row-level security
        </Text>
      </View>

      <PickerSheet
        visible={switchOpen}
        title="Switch family"
        options={families.map((f) => ({ value: f.id, label: f.name, description: f.base_currency }))}
        selected={family.id}
        onSelect={(id) => {
          if (!id || id === family.id) return;
          setActiveFamilyId(id);
          router.replace('/');
        }}
        onClose={() => setSwitchOpen(false)}
        searchable={false}
      />
    </Screen>
  );
}
