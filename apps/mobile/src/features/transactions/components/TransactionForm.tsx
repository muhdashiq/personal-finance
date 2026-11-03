import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  currencySymbol,
  todayISO,
  transactionFormSchema,
  type CategorySuggestion,
  type TransactionFormValues,
  type TransactionType,
} from '@family-finance/core';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Button, Card, DateField, IconBadge, SegmentedControl, SelectField, Text, TextField, type PickerOption } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useInstruments } from '@/features/accounts/hooks';
import { buildCategoryTree, useCategories, useCategorySuggestion } from '@/features/categories/hooks';
import { useActiveFamily } from '@/features/family/hooks';
import type { LocalFile } from '../api';

export type TransactionFormMeta = { suggestion: CategorySuggestion | null; receipt: LocalFile | null };

type TransactionFormProps = {
  defaultValues?: Partial<TransactionFormValues>;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (values: TransactionFormValues, meta: TransactionFormMeta) => void;
  allowReceipt?: boolean;
};

const TYPE_OPTIONS: readonly { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'refund', label: 'Refund' },
];

export const TransactionForm = ({ defaultValues, submitLabel, submitting, onSubmit, allowReceipt = true }: TransactionFormProps) => {
  const theme = useTheme();
  const { me, members, currency, memberById } = useActiveFamily();
  const { data: categories = [] } = useCategories();
  const instruments = useInstruments();
  const [receipt, setReceipt] = useState<LocalFile | null>(null);
  // Once the user picks a category themselves, suggestions stop overriding it.
  const [categoryTouched, setCategoryTouched] = useState(Boolean(defaultValues?.categoryId));

  const { control, handleSubmit, setValue, formState } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      type: 'expense',
      title: '',
      amount: '',
      occurredOn: todayISO(),
      categoryId: null,
      subcategoryId: null,
      paymentMethod: null,
      instrument: null,
      toInstrument: null,
      spentByMemberId: me.id,
      merchant: '',
      notes: '',
      visibility: 'shared',
      ...defaultValues,
    },
  });
  const { errors } = formState;

  const [type, title, merchant, categoryId, subcategoryId, instrument, spentBy] = useWatch({
    control,
    name: ['type', 'title', 'merchant', 'categoryId', 'subcategoryId', 'instrument', 'spentByMemberId'],
  });
  const isTransfer = type === 'transfer';
  const categoryKind = type === 'income' ? 'income' : 'expense';

  // Live categorisation from family rules, the merchant dictionary and keywords.
  const suggestionInput = useMemo(
    () => (isTransfer ? null : { description: title, merchant, direction: type === 'income' ? ('credit' as const) : ('debit' as const) }),
    [isTransfer, title, merchant, type],
  );
  const suggestion = useCategorySuggestion(suggestionInput);
  const suggestionMatchesKind = suggestion ? categories.find((c) => c.id === suggestion.categoryId)?.kind === categoryKind : false;

  useEffect(() => {
    if (categoryTouched || !suggestion || !suggestionMatchesKind) return;
    setValue('categoryId', suggestion.categoryId);
    setValue('subcategoryId', suggestion.subcategoryId);
  }, [categoryTouched, suggestion, suggestionMatchesKind, setValue]);

  // Switching between expense and income clears a category of the wrong kind.
  const changeType = (next: TransactionType) => {
    setValue('type', next, { shouldDirty: true });
    const nextKind = next === 'income' ? 'income' : 'expense';
    const current = categories.find((c) => c.id === categoryId);
    if (next === 'transfer' || (current && current.kind !== nextKind)) {
      setValue('categoryId', null);
      setValue('subcategoryId', null);
      setCategoryTouched(false);
    }
  };

  // A card purchase defaults the payment method.
  useEffect(() => {
    if (instrument?.startsWith('card:')) setValue('paymentMethod', 'credit_card');
  }, [instrument, setValue]);

  const categoryOptions = useMemo<PickerOption[]>(
    () =>
      buildCategoryTree(
        categories.filter((c) => !c.is_archived),
        categoryKind,
      ).flatMap((parent) => [
        {
          value: parent.id,
          label: parent.name,
          leading: <IconBadge icon={parent.icon ?? 'shape-outline'} color={parent.color ?? theme.colors.textSecondary} size={30} />,
        },
        ...parent.children.filter((c) => !c.is_archived).map((child) => ({ value: child.id, label: child.name, depth: 1 as const })),
      ]),
    [categories, categoryKind, theme.colors.textSecondary],
  );

  const memberOptions = useMemo<PickerOption[]>(
    () => members.map((m) => ({ value: m.id, label: m.id === me.id ? `${m.display_name} (you)` : m.display_name })),
    [members, me.id],
  );

  const instrumentOptions = useMemo<PickerOption[]>(
    () =>
      instruments.map((i) => ({
        value: i.key,
        label: i.label,
        description: i.description,
        leading: <Ionicons name={i.kind === 'card' ? 'card-outline' : 'business-outline'} size={20} color={theme.colors.textSecondary} />,
      })),
    [instruments, theme.colors.textSecondary],
  );

  const paymentOptions = useMemo<PickerOption[]>(() => PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] })), []);

  const pickReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setReceipt({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      fileName: asset.fileName ?? `receipt-${Date.now()}.jpg`,
      size: asset.fileSize ?? 0,
    });
  };

  const spenderName = memberById(spentBy)?.display_name;
  const selectedCategoryValue = subcategoryId ?? categoryId;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={[styles.flex, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl * 2 }}
        keyboardShouldPersistTaps="handled"
      >
        <Controller
          control={control}
          name="type"
          render={({ field }) => <SegmentedControl options={TYPE_OPTIONS} value={field.value} onChange={changeType} accessibilityLabel="Transaction type" />}
        />

        <Card style={{ alignItems: 'center', gap: theme.spacing.xs }}>
          <Text variant="subhead" color="textSecondary">
            Amount
          </Text>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <View style={styles.amountRow}>
                <Text variant="amountXL" color="textTertiary">
                  {currencySymbol(currency).trim()}
                </Text>
                <TextInput
                  accessibilityLabel="Amount"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="0"
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="decimal-pad"
                  autoFocus={!defaultValues?.amount}
                  style={[theme.typography.amountXL, styles.amountInput, { color: theme.colors.text }]}
                />
              </View>
            )}
          />
          {errors.amount ? (
            <Text variant="footnote" color="danger">
              {errors.amount.message}
            </Text>
          ) : null}
        </Card>

        <Controller
          control={control}
          name="title"
          render={({ field }) => (
            <TextField
              label="Title"
              placeholder={isTransfer ? 'e.g. Credit card bill' : 'e.g. Groceries at BigBasket'}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.title?.message}
              maxLength={140}
              returnKeyType="next"
            />
          )}
        />

        {!isTransfer ? (
          <Controller
            control={control}
            name="merchant"
            render={({ field }) => (
              <TextField
                label={type === 'income' ? 'Payer (optional)' : 'Merchant (optional)'}
                placeholder={type === 'income' ? 'e.g. Employer' : 'e.g. Swiggy'}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                autoCapitalize="words"
                maxLength={140}
              />
            )}
          />
        ) : null}

        {!isTransfer ? (
          <View style={{ gap: 6 }}>
            <SelectField
              label="Category"
              value={selectedCategoryValue}
              options={categoryOptions}
              allowClear
              clearLabel="Uncategorised"
              placeholder="Uncategorised"
              onChange={(value) => {
                setCategoryTouched(true);
                const chosen = categories.find((c) => c.id === value);
                setValue('categoryId', chosen ? (chosen.parent_id ?? chosen.id) : null, { shouldDirty: true });
                setValue('subcategoryId', chosen?.parent_id ? chosen.id : null, { shouldDirty: true });
              }}
            />
            {suggestion && suggestionMatchesKind && !categoryTouched && selectedCategoryValue ? (
              <View style={styles.hint}>
                <Ionicons name="sparkles-outline" size={14} color={theme.colors.secondary} />
                <Text variant="footnote" color="textSecondary">
                  Suggested {suggestion.source === 'merchant' && suggestion.merchant ? `for ${suggestion.merchant}` : 'from your rules'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Controller
          control={control}
          name="occurredOn"
          render={({ field }) => <DateField label="Date" value={field.value} onChange={field.onChange} error={errors.occurredOn?.message} />}
        />

        <Controller
          control={control}
          name="spentByMemberId"
          render={({ field }) => (
            <SelectField
              label={type === 'income' ? 'Received by' : isTransfer ? 'Done by' : 'Spent by'}
              value={field.value}
              options={memberOptions}
              onChange={(v) => field.onChange(v ?? me.id)}
              error={errors.spentByMemberId?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="instrument"
          render={({ field }) => (
            <SelectField
              label={isTransfer ? 'From' : type === 'income' ? 'Into account' : 'Paid from'}
              value={field.value}
              options={instrumentOptions}
              allowClear={!isTransfer}
              clearLabel="Cash / not tracked"
              placeholder={isTransfer ? 'Choose account' : 'Cash / not tracked'}
              onChange={field.onChange}
              error={errors.instrument?.message}
              helper={instruments.length === 0 ? 'Add bank accounts and cards in the Accounts tab.' : undefined}
            />
          )}
        />

        {isTransfer ? (
          <Controller
            control={control}
            name="toInstrument"
            render={({ field }) => (
              <SelectField
                label="To"
                value={field.value}
                options={instrumentOptions}
                placeholder="Choose account or card"
                onChange={field.onChange}
                error={errors.toInstrument?.message}
                helper="Paying a credit card bill is a transfer, so the card purchases are not counted twice."
              />
            )}
          />
        ) : (
          <Controller
            control={control}
            name="paymentMethod"
            render={({ field }) => (
              <SelectField
                label="Payment method"
                value={field.value}
                options={paymentOptions}
                allowClear
                clearLabel="Not specified"
                placeholder="Not specified"
                onChange={(v) => field.onChange(v)}
              />
            )}
          />
        )}

        <Controller
          control={control}
          name="notes"
          render={({ field }) => (
            <TextField
              label="Notes (optional)"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              multiline
              maxLength={2000}
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />
          )}
        />

        <Controller
          control={control}
          name="visibility"
          render={({ field }) => (
            <Card>
              <View style={styles.switchRow}>
                <View style={styles.flex}>
                  <Text variant="body">Private</Text>
                  <Text variant="footnote" color="textSecondary">
                    {field.value === 'private'
                      ? `Only you${spenderName && spentBy !== me.id ? ` and ${spenderName}` : ''} can see this.`
                      : 'Visible to everyone in the family.'}
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Private transaction"
                  value={field.value === 'private'}
                  onValueChange={(on) => field.onChange(on ? 'private' : 'shared')}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                />
              </View>
            </Card>
          )}
        />

        {allowReceipt ? (
          <Card>
            {receipt ? (
              <View style={styles.switchRow}>
                <Image source={{ uri: receipt.uri }} style={[styles.thumb, { borderRadius: theme.radii.sm }]} accessibilityIgnoresInvertColors />
                <Text variant="callout" style={styles.flex} numberOfLines={1}>
                  {receipt.fileName}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Remove receipt" onPress={() => setReceipt(null)} hitSlop={10}>
                  <Ionicons name="close-circle" size={22} color={theme.colors.textTertiary} />
                </Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => void pickReceipt()} style={styles.switchRow}>
                <Ionicons name="receipt-outline" size={22} color={theme.colors.primary} />
                <Text variant="body" color="primary" style={styles.flex}>
                  Attach receipt
                </Text>
              </Pressable>
            )}
          </Card>
        ) : null}

        <Button label={submitLabel} loading={submitting} onPress={handleSubmit((values) => onSubmit(values, { suggestion, receipt }))} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  amountInput: { minWidth: 80, textAlign: 'center', paddingVertical: 4 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 44, height: 44 },
});
