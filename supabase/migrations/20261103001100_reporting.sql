-- =============================================================================
-- Reporting RPCs used by the dashboard and insights screens.
--
-- Rules applied consistently in every function:
--   * expenses = sum(expense) - sum(refund)
--   * transfers (incl. credit card bill payments) are never income/expense
--   * only transactions in the family's base currency are summed; others are
--     counted separately so the UI can say they were excluded
--   * SECURITY INVOKER: RLS applies, so private transactions of other members
--     are not included in a member's view
-- =============================================================================

create or replace function public.get_cashflow_summary(
  p_family_id uuid,
  p_from date,
  p_to date,
  p_member_id uuid default null
)
returns table (
  currency char(3),
  income numeric,
  expenses numeric,
  refunds numeric,
  net numeric,
  transaction_count bigint,
  excluded_other_currency bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with fam as (
    select f.base_currency from public.families f where f.id = p_family_id
  ),
  t as (
    select tx.type, tx.amount, tx.currency
    from public.transactions tx
    where tx.family_id = p_family_id
      and tx.occurred_on between p_from and p_to
      and (p_member_id is null or tx.spent_by_member_id = p_member_id)
  ),
  agg as (
    select
      coalesce(sum(t.amount) filter (where t.type = 'income' and t.currency = fam.base_currency), 0) as income,
      coalesce(sum(t.amount) filter (where t.type = 'expense' and t.currency = fam.base_currency), 0) as gross_expenses,
      coalesce(sum(t.amount) filter (where t.type = 'refund' and t.currency = fam.base_currency), 0) as refunds,
      count(*) filter (where t.type <> 'transfer' and t.currency = fam.base_currency) as cnt,
      count(*) filter (where t.currency <> fam.base_currency) as other_cnt
    from fam left join t on true
    group by fam.base_currency
  )
  select fam.base_currency,
         agg.income,
         agg.gross_expenses - agg.refunds,
         agg.refunds,
         agg.income - (agg.gross_expenses - agg.refunds),
         agg.cnt,
         agg.other_cnt
  from fam cross join agg
$$;

create or replace function public.get_monthly_cashflow(
  p_family_id uuid,
  p_months integer default 6,
  p_end date default current_date,
  p_member_id uuid default null
)
returns table (month date, income numeric, expenses numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with fam as (
    select f.base_currency from public.families f where f.id = p_family_id
  ),
  months as (
    select generate_series(
      date_trunc('month', p_end) - make_interval(months => least(greatest(p_months, 1), 36) - 1),
      date_trunc('month', p_end),
      interval '1 month'
    )::date as month
  )
  select m.month,
         coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
         coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
           - coalesce(sum(t.amount) filter (where t.type = 'refund'), 0)
  from months m
  cross join fam
  left join public.transactions t
    on t.family_id = p_family_id
   and t.occurred_on >= m.month
   and t.occurred_on < (m.month + interval '1 month')::date
   and t.currency = fam.base_currency
   and (p_member_id is null or t.spent_by_member_id = p_member_id)
  where exists (select 1 from fam)
  group by m.month
  order by m.month
$$;

create or replace function public.get_category_spending(
  p_family_id uuid,
  p_from date,
  p_to date,
  p_member_id uuid default null,
  p_kind public.category_kind default 'expense'
)
returns table (
  category_id uuid,
  name text,
  icon text,
  color text,
  amount numeric,
  transaction_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with fam as (
    select f.base_currency from public.families f where f.id = p_family_id
  )
  select c.id,
         coalesce(c.name, 'Uncategorised'),
         coalesce(c.icon, 'help-circle-outline'),
         coalesce(c.color, '#8A8FA3'),
         case when p_kind = 'expense'
              then coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
                   - coalesce(sum(t.amount) filter (where t.type = 'refund'), 0)
              else coalesce(sum(t.amount), 0)
         end as amount,
         count(*)
  from public.transactions t
  cross join fam
  left join public.transaction_categories c on c.id = t.category_id
  where t.family_id = p_family_id
    and t.occurred_on between p_from and p_to
    and t.currency = fam.base_currency
    and (p_member_id is null or t.spent_by_member_id = p_member_id)
    and ((p_kind = 'expense' and t.type in ('expense', 'refund'))
         or (p_kind = 'income' and t.type = 'income'))
  group by c.id, c.name, c.icon, c.color
  order by amount desc
$$;

create or replace function public.get_member_spending(
  p_family_id uuid,
  p_from date,
  p_to date
)
returns table (
  member_id uuid,
  display_name text,
  color text,
  status public.member_status,
  income numeric,
  expenses numeric,
  transaction_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with fam as (
    select f.base_currency from public.families f where f.id = p_family_id
  )
  select m.id,
         m.display_name,
         m.color,
         m.status,
         coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
         coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
           - coalesce(sum(t.amount) filter (where t.type = 'refund'), 0),
         count(t.id)
  from public.family_members m
  cross join fam
  left join public.transactions t
    on t.spent_by_member_id = m.id
   and t.family_id = p_family_id
   and t.occurred_on between p_from and p_to
   and t.currency = fam.base_currency
   and t.type <> 'transfer'
  where m.family_id = p_family_id
  group by m.id, m.display_name, m.color, m.status
  having m.status = 'active' or count(t.id) > 0
  order by 6 desc, m.display_name
$$;

-- Account balances and card outstanding. SECURITY DEFINER because a balance
-- must include every transaction on the account, even ones the caller cannot
-- see individually; the accounts returned are still filtered by visibility.
create or replace function public.get_account_balances(p_family_id uuid)
returns table (
  kind text,
  id uuid,
  nickname text,
  institution text,
  last4 char(4),
  currency char(3),
  owner_member_id uuid,
  status public.account_status,
  visibility public.visibility,
  balance numeric,
  credit_limit numeric,
  transaction_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'bank', a.id, a.nickname, a.bank_name, a.last4, a.currency, a.owner_member_id, a.status, a.visibility,
         a.opening_balance + coalesce(sum(
           case
             when t.bank_account_id = a.id and t.type in ('income', 'refund') then t.amount
             when t.bank_account_id = a.id and t.type in ('expense', 'transfer') then -t.amount
             when t.counterparty_bank_account_id = a.id then t.amount
             else 0
           end), 0),
         null::numeric,
         count(t.id)
  from public.bank_accounts a
  left join public.transactions t
    on (t.bank_account_id = a.id or t.counterparty_bank_account_id = a.id)
   and t.occurred_on >= a.opening_balance_date
   and t.currency = a.currency
  where a.family_id = p_family_id
    and private.can_view_owned(a.family_id, a.visibility, a.owner_member_id, a.created_by)
  group by a.id
  union all
  -- Card outstanding: purchases add to what is owed; refunds, cashback and
  -- bill payments (transfers into the card) reduce it.
  select 'card', c.id, c.nickname, c.issuer, c.last4, c.currency, c.owner_member_id, c.status, c.visibility,
         c.opening_outstanding + coalesce(sum(
           case
             when t.credit_card_id = c.id and t.type in ('expense', 'transfer') then t.amount
             when t.credit_card_id = c.id and t.type in ('income', 'refund') then -t.amount
             when t.counterparty_credit_card_id = c.id then -t.amount
             else 0
           end), 0),
         c.credit_limit,
         count(t.id)
  from public.credit_cards c
  left join public.transactions t
    on (t.credit_card_id = c.id or t.counterparty_credit_card_id = c.id)
   and t.occurred_on >= c.opening_balance_date
   and t.currency = c.currency
  where c.family_id = p_family_id
    and private.can_view_owned(c.family_id, c.visibility, c.owner_member_id, c.created_by)
  group by c.id
$$;

-- Full export of everything the caller can see in a family (data portability).
create or replace function public.export_family_data(p_family_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'family', (select to_jsonb(f) from public.families f where f.id = p_family_id),
    'members', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.family_members m where m.family_id = p_family_id),
    'bank_accounts', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from public.bank_accounts a where a.family_id = p_family_id),
    'credit_cards', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.credit_cards c where c.family_id = p_family_id),
    'categories', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.transaction_categories c where c.family_id = p_family_id),
    'transactions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_on), '[]') from public.transactions t where t.family_id = p_family_id),
    'tags', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.tags t where t.family_id = p_family_id),
    'transaction_tags', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.transaction_tags t where t.family_id = p_family_id),
    'rules', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.transaction_rules r where r.family_id = p_family_id),
    'recurring_transactions', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.recurring_transactions r where r.family_id = p_family_id),
    'loans', (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from public.loans l where l.family_id = p_family_id),
    'budgets', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.budgets b where b.family_id = p_family_id),
    'trips', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.trips t where t.family_id = p_family_id),
    'investments', (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from public.investments i where i.family_id = p_family_id)
  )
  where private.is_family_member(p_family_id)
$$;

revoke all on function public.get_cashflow_summary(uuid, date, date, uuid) from public, anon;
revoke all on function public.get_monthly_cashflow(uuid, integer, date, uuid) from public, anon;
revoke all on function public.get_category_spending(uuid, date, date, uuid, public.category_kind) from public, anon;
revoke all on function public.get_member_spending(uuid, date, date) from public, anon;
revoke all on function public.get_account_balances(uuid) from public, anon;
revoke all on function public.export_family_data(uuid) from public, anon;

grant execute on function public.get_cashflow_summary(uuid, date, date, uuid) to authenticated;
grant execute on function public.get_monthly_cashflow(uuid, integer, date, uuid) to authenticated;
grant execute on function public.get_category_spending(uuid, date, date, uuid, public.category_kind) to authenticated;
grant execute on function public.get_member_spending(uuid, date, date) to authenticated;
grant execute on function public.get_account_balances(uuid) to authenticated;
grant execute on function public.export_family_data(uuid) to authenticated;
