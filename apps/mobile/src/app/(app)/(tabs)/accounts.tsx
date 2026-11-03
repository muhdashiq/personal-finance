import { Ionicons } from '@expo/vector-icons';
import { formatMoney, fromDb, maskLast4 } from '@family-finance/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Card, EmptyState, ErrorState, IconBadge, ListRow, ProgressBar, Screen, Section, SegmentedControl, SkeletonCard, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useAccounts, useBalances, useBalanceTotals } from '@/features/accounts/hooks';
import { useActiveFamily } from '@/features/family/hooks';

type Tab = 'banks' | 'cards';

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  savings: 'Savings',
  current: 'Current',
  salary: 'Salary',
  nre: 'NRE',
  nro: 'NRO',
  wallet: 'Wallet',
  cash: 'Cash',
  other: 'Account',
};

export default function Accounts() {
  const theme = useTheme();
  const { memberById, currency, canWrite } = useActiveFamily();
  const [tab, setTab] = useState<Tab>('banks');
  const accounts = useAccounts();
  const balances = useBalances();
  const { totals } = useBalanceTotals();

  const balanceById = useMemo(() => new Map((balances.data ?? []).map((b) => [b.id, b])), [balances.data]);

  const loading = accounts.isLoading;
  const banks = accounts.data?.banks ?? [];
  const cards = accounts.data?.cards ?? [];

  return (
    <Screen edgeTop refreshing={accounts.isRefetching} onRefresh={() => void Promise.all([accounts.refetch(), balances.refetch()])} bottomInset={72}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="largeTitle" style={{ flex: 1 }} accessibilityRole="header">
          Accounts
        </Text>
        {canWrite ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tab === 'banks' ? 'Add bank account' : 'Add credit card'}
            onPress={() => router.push(tab === 'banks' ? '/accounts/bank/new' : '/accounts/card/new')}
            hitSlop={10}
          >
            <Ionicons name="add-circle" size={30} color={theme.colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <SegmentedControl
        options={[
          { value: 'banks', label: 'Bank accounts' },
          { value: 'cards', label: 'Credit cards' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading ? (
        <SkeletonCard />
      ) : accounts.error ? (
        <ErrorState message={accounts.error.message} onRetry={() => void accounts.refetch()} />
      ) : tab === 'banks' ? (
        banks.length === 0 ? (
          <Card>
            <EmptyState
              icon="business-outline"
              title="No bank accounts yet"
              message="Add the accounts your family uses. Only the last 4 digits are stored."
              actionLabel={canWrite ? 'Add bank account' : undefined}
              onAction={() => router.push('/accounts/bank/new')}
              compact
            />
          </Card>
        ) : (
          <>
            <Card style={{ gap: 4 }}>
              <Text variant="caption" color="textSecondary">
                TOTAL CALCULATED BALANCE
              </Text>
              <Text variant="amountL">{formatMoney(totals.bankBalance, currency)}</Text>
              <Text variant="footnote" color="textTertiary">
                Opening balance plus the transactions recorded here. Statement imports (coming in Phase 2) will keep it in step with your bank.
              </Text>
            </Card>
            <Section>
              {banks.map((b) => {
                const balance = balanceById.get(b.id);
                return (
                  <ListRow
                    key={b.id}
                    title={`${b.nickname} ${maskLast4(b.last4)}`.trim()}
                    subtitle={[b.bank_name, ACCOUNT_TYPE_LABEL[b.account_type], memberById(b.owner_member_id)?.display_name, b.status !== 'active' ? b.status : null, b.visibility === 'private' ? 'Private' : null]
                      .filter(Boolean)
                      .join(' · ')}
                    leading={<IconBadge icon="business-outline" color={theme.colors.investment} ionicon />}
                    trailing={
                      balance ? (
                        <Text variant="headline" tabular color={fromDb(balance.balance) < 0 ? 'expense' : 'text'}>
                          {formatMoney(fromDb(balance.balance), b.currency, { wholeOnly: true })}
                        </Text>
                      ) : null
                    }
                    onPress={() => router.push(`/accounts/bank/${b.id}`)}
                  />
                );
              })}
            </Section>
          </>
        )
      ) : cards.length === 0 ? (
        <Card>
          <EmptyState
            icon="card-outline"
            title="No credit cards yet"
            message="Add cards for anyone in the family to track dues and utilisation."
            actionLabel={canWrite ? 'Add credit card' : undefined}
            onAction={() => router.push('/accounts/card/new')}
            compact
          />
        </Card>
      ) : (
        <>
          <Card style={{ gap: 6 }}>
            <Text variant="caption" color="textSecondary">
              TOTAL OUTSTANDING
            </Text>
            <Text variant="amountL">{formatMoney(totals.cardOutstanding, currency)}</Text>
            {totals.utilization !== null ? (
              <>
                <ProgressBar value={totals.utilization} color={totals.utilization > 0.3 ? theme.colors.warning : theme.colors.investment} />
                <Text variant="footnote" color="textTertiary">
                  {Math.round(totals.utilization * 100)}% of {formatMoney(totals.creditLimit, currency, { wholeOnly: true })} combined limit
                </Text>
              </>
            ) : null}
          </Card>
          <Section footer="Card purchases count as expenses once. Paying the bill is recorded as a transfer from your bank account.">
            {cards.map((c) => {
              const balance = balanceById.get(c.id);
              const outstanding = balance ? fromDb(balance.balance) : 0;
              const limit = fromDb(c.credit_limit);
              const due = c.payment_due_day ? `Due on day ${c.payment_due_day}` : null;
              return (
                <ListRow
                  key={c.id}
                  title={`${c.nickname} ${maskLast4(c.last4)}`.trim()}
                  subtitle={[c.issuer, memberById(c.owner_member_id)?.display_name, due, limit > 0 ? `${Math.round((Math.max(0, outstanding) / limit) * 100)}% used` : null, c.status !== 'active' ? c.status : null]
                    .filter(Boolean)
                    .join(' · ')}
                  leading={<IconBadge icon="card-outline" color={theme.colors.primary} ionicon />}
                  trailing={
                    <Text variant="headline" tabular>
                      {formatMoney(outstanding, c.currency, { wholeOnly: true })}
                    </Text>
                  }
                  onPress={() => router.push(`/accounts/card/${c.id}`)}
                />
              );
            })}
          </Section>
        </>
      )}

      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="document-text-outline" size={20} color={theme.colors.textTertiary} />
          <Text variant="headline" color="textSecondary" style={{ flex: 1 }}>
            Import statements
          </Text>
          <View style={{ backgroundColor: theme.colors.surfaceSecondary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text variant="caption" color="textTertiary">
              Phase 2
            </Text>
          </View>
        </View>
        <Text variant="footnote" color="textTertiary">
          PDF, CSV and Excel statement import with duplicate detection is the next milestone. The duplicate-detection and
          categorisation engines are already built and tested.
        </Text>
      </Card>
    </Screen>
  );
}
