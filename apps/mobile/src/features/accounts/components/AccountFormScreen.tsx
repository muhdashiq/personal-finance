import { zodResolver } from '@hookform/resolvers/zod';
import {
  BANK_ACCOUNT_TYPES,
  CARD_NETWORKS,
  bankAccountSchema,
  creditCardSchema,
  fromDb,
  todayISO,
  toInputString,
  type BankAccountFormValues,
  type CreditCardFormValues,
} from '@family-finance/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useForm, type Control, type FieldValues, type Path } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';
import { Button, Card, DateField, SegmentedControl, SelectField, Text, TextField, type PickerOption } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { qk } from '@/lib/queryKeys';
import { confirm } from '@/stores/confirm';
import { toast } from '@/stores/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { useUser } from '@/features/auth/AuthProvider';
import { useActiveFamily } from '@/features/family/hooks';
import {
  deleteBankAccount,
  deleteCreditCard,
  saveBankAccount,
  saveCreditCard,
  type BankAccount,
  type CreditCard,
} from '../api';

const ACCOUNT_TYPE_LABELS: Record<(typeof BANK_ACCOUNT_TYPES)[number], string> = {
  savings: 'Savings',
  current: 'Current',
  salary: 'Salary',
  nre: 'NRE',
  nro: 'NRO',
  wallet: 'Wallet',
  cash: 'Cash',
  other: 'Other',
};
const NETWORK_LABELS: Record<(typeof CARD_NETWORKS)[number], string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  rupay: 'RuPay',
  amex: 'American Express',
  diners: 'Diners Club',
  discover: 'Discover',
  other: 'Other',
};
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'dormant', label: 'Dormant' },
  { value: 'closed', label: 'Closed' },
] as const;

type TextInputFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
  error?: string;
  placeholder?: string;
  helper?: string;
  numeric?: boolean;
  maxLength?: number;
};

const Field = <T extends FieldValues>({ control, name, label, error, placeholder, helper, numeric, maxLength }: TextInputFieldProps<T>) => (
  <Controller
    control={control}
    name={name}
    render={({ field }) => (
      <TextField
        label={label}
        value={String(field.value ?? '')}
        onChangeText={field.onChange}
        onBlur={field.onBlur}
        placeholder={placeholder}
        helper={helper}
        error={error}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        maxLength={maxLength}
      />
    )}
  />
);

const VisibilityField = <T extends FieldValues>({ control, name, ownerLabel }: { control: Control<T>; name: Path<T>; ownerLabel: string }) => {
  const theme = useTheme();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="body">Private</Text>
              <Text variant="footnote" color="textSecondary">
                {field.value === 'private'
                  ? `Only ${ownerLabel} and the person who added it can see this and its transactions.`
                  : 'Visible to the whole family.'}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Private"
              value={field.value === 'private'}
              onValueChange={(on) => field.onChange(on ? 'private' : 'shared')}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
            />
          </View>
        </Card>
      )}
    />
  );
};

const useAccountMutations = () => {
  const { family } = useActiveFamily();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.accounts(family.id) }),
      queryClient.invalidateQueries({ queryKey: qk.balances(family.id) }),
      queryClient.invalidateQueries({ queryKey: qk.reports(family.id) }),
    ]);
  return { family, refresh };
};

const Layout = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 64 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export const BankAccountForm = ({ account }: { account?: BankAccount }) => {
  const user = useUser();
  const { members, me, currency, memberById } = useActiveFamily();
  const { family, refresh } = useAccountMutations();
  const memberOptions: PickerOption[] = members.map((m) => ({ value: m.id, label: m.display_name }));

  const { control, handleSubmit, formState, watch } = useForm<BankAccountFormValues>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: account
      ? {
          bankName: account.bank_name,
          nickname: account.nickname,
          accountType: account.account_type,
          last4: account.last4 ?? '',
          currency: account.currency,
          openingBalance: toInputString(fromDb(account.opening_balance)),
          openingBalanceDate: account.opening_balance_date,
          ownerMemberId: account.owner_member_id,
          visibility: account.visibility,
          status: account.status,
        }
      : {
          bankName: '',
          nickname: '',
          accountType: 'savings',
          last4: '',
          currency,
          openingBalance: '',
          openingBalanceDate: todayISO(),
          ownerMemberId: me.id,
          visibility: 'shared',
          status: 'active',
        },
  });
  const errors = formState.errors;

  const save = useMutation({
    mutationFn: (values: BankAccountFormValues) => saveBankAccount(family.id, user.id, values, account?.id),
    onSuccess: async () => {
      await refresh();
      toast.success(account ? 'Account updated' : 'Account added');
      router.back();
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const remove = useMutation({
    mutationFn: () => deleteBankAccount(account!.id),
    onSuccess: async () => {
      await refresh();
      toast.show('Account deleted');
      router.back();
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  return (
    <Layout>
      <Field control={control} name="bankName" label="Bank" placeholder="e.g. HDFC Bank" error={errors.bankName?.message} />
      <Field control={control} name="nickname" label="Nickname" placeholder="e.g. Salary account" error={errors.nickname?.message} />
      <Controller
        control={control}
        name="accountType"
        render={({ field }) => (
          <SelectField label="Account type" value={field.value} onChange={(v) => field.onChange(v ?? 'savings')} options={BANK_ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }))} />
        )}
      />
      <Controller
        control={control}
        name="ownerMemberId"
        render={({ field }) => (
          <SelectField label="Account holder" value={field.value} onChange={(v) => field.onChange(v ?? me.id)} options={memberOptions} error={errors.ownerMemberId?.message} />
        )}
      />
      <Field control={control} name="last4" label="Last 4 digits (optional)" placeholder="1234" numeric maxLength={4} error={errors.last4?.message} helper="Never enter the full account number." />
      <Field control={control} name="openingBalance" label="Opening balance" placeholder="0" numeric error={errors.openingBalance?.message} />
      <Controller
        control={control}
        name="openingBalanceDate"
        render={({ field }) => <DateField label="Balance as of" value={field.value} onChange={field.onChange} />}
      />
      <Controller
        control={control}
        name="status"
        render={({ field }) => <SegmentedControl options={STATUS_OPTIONS} value={field.value} onChange={field.onChange} accessibilityLabel="Status" />}
      />
      <VisibilityField control={control} name="visibility" ownerLabel={memberById(watch('ownerMemberId'))?.display_name ?? 'the holder'} />
      <Button label={account ? 'Save changes' : 'Add account'} loading={save.isPending} onPress={handleSubmit((v) => save.mutate(v))} />
      {account ? (
        <Button
          label="Delete account"
          variant="destructive"
          loading={remove.isPending}
          onPress={async () => {
            if (await confirm({ title: 'Delete this account?', message: 'Accounts with transactions cannot be deleted — mark them as closed instead.', confirmLabel: 'Delete', destructive: true })) {
              remove.mutate();
            }
          }}
        />
      ) : null}
    </Layout>
  );
};

export const CreditCardForm = ({ card }: { card?: CreditCard }) => {
  const user = useUser();
  const { members, me, currency, memberById } = useActiveFamily();
  const { family, refresh } = useAccountMutations();
  const memberOptions: PickerOption[] = members.map((m) => ({ value: m.id, label: m.display_name }));

  const { control, handleSubmit, formState, watch } = useForm<CreditCardFormValues>({
    resolver: zodResolver(creditCardSchema),
    defaultValues: card
      ? {
          issuer: card.issuer,
          nickname: card.nickname,
          network: card.network,
          last4: card.last4 ?? '',
          currency: card.currency,
          creditLimit: card.credit_limit === null ? '' : toInputString(fromDb(card.credit_limit)),
          statementDay: card.statement_day ? String(card.statement_day) : '',
          paymentDueDay: card.payment_due_day ? String(card.payment_due_day) : '',
          openingOutstanding: toInputString(fromDb(card.opening_outstanding)),
          openingBalanceDate: card.opening_balance_date,
          ownerMemberId: card.owner_member_id,
          visibility: card.visibility,
          status: card.status,
        }
      : {
          issuer: '',
          nickname: '',
          network: 'visa',
          last4: '',
          currency,
          creditLimit: '',
          statementDay: '',
          paymentDueDay: '',
          openingOutstanding: '',
          openingBalanceDate: todayISO(),
          ownerMemberId: me.id,
          visibility: 'shared',
          status: 'active',
        },
  });
  const errors = formState.errors;

  const save = useMutation({
    mutationFn: (values: CreditCardFormValues) => saveCreditCard(family.id, user.id, values, card?.id),
    onSuccess: async () => {
      await refresh();
      toast.success(card ? 'Card updated' : 'Card added');
      router.back();
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const remove = useMutation({
    mutationFn: () => deleteCreditCard(card!.id),
    onSuccess: async () => {
      await refresh();
      toast.show('Card deleted');
      router.back();
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  return (
    <Layout>
      <Field control={control} name="issuer" label="Issuing bank" placeholder="e.g. ICICI Bank" error={errors.issuer?.message} />
      <Field control={control} name="nickname" label="Nickname" placeholder="e.g. Amazon Pay card" error={errors.nickname?.message} />
      <Controller
        control={control}
        name="network"
        render={({ field }) => (
          <SelectField label="Network" value={field.value} onChange={(v) => field.onChange(v ?? 'other')} options={CARD_NETWORKS.map((n) => ({ value: n, label: NETWORK_LABELS[n] }))} />
        )}
      />
      <Controller
        control={control}
        name="ownerMemberId"
        render={({ field }) => (
          <SelectField label="Cardholder" value={field.value} onChange={(v) => field.onChange(v ?? me.id)} options={memberOptions} error={errors.ownerMemberId?.message} />
        )}
      />
      <Field control={control} name="last4" label="Last 4 digits (optional)" placeholder="1234" numeric maxLength={4} error={errors.last4?.message} helper="Never enter the full card number, CVV or PIN." />
      <Field control={control} name="creditLimit" label="Credit limit (optional)" numeric error={errors.creditLimit?.message} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field control={control} name="statementDay" label="Statement day" placeholder="e.g. 15" numeric maxLength={2} error={errors.statementDay?.message} />
        </View>
        <View style={{ flex: 1 }}>
          <Field control={control} name="paymentDueDay" label="Due day" placeholder="e.g. 3" numeric maxLength={2} error={errors.paymentDueDay?.message} />
        </View>
      </View>
      <Field control={control} name="openingOutstanding" label="Current outstanding" placeholder="0" numeric error={errors.openingOutstanding?.message} helper="What you owe on the card today. New purchases and payments are added on top." />
      <Controller
        control={control}
        name="openingBalanceDate"
        render={({ field }) => <DateField label="Outstanding as of" value={field.value} onChange={field.onChange} />}
      />
      <Controller
        control={control}
        name="status"
        render={({ field }) => <SegmentedControl options={STATUS_OPTIONS} value={field.value} onChange={field.onChange} accessibilityLabel="Status" />}
      />
      <VisibilityField control={control} name="visibility" ownerLabel={memberById(watch('ownerMemberId'))?.display_name ?? 'the cardholder'} />
      <Button label={card ? 'Save changes' : 'Add card'} loading={save.isPending} onPress={handleSubmit((v) => save.mutate(v))} />
      {card ? (
        <Button
          label="Delete card"
          variant="destructive"
          loading={remove.isPending}
          onPress={async () => {
            if (await confirm({ title: 'Delete this card?', message: 'Cards with transactions cannot be deleted — mark them as closed instead.', confirmLabel: 'Delete', destructive: true })) {
              remove.mutate();
            }
          }}
        />
      ) : null}
    </Layout>
  );
};
