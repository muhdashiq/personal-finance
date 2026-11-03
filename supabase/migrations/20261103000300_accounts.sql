-- =============================================================================
-- Bank accounts and credit cards.
-- Only the last four digits of an account/card number are ever stored.
-- =============================================================================

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  owner_member_id uuid not null,
  bank_name text not null check (char_length(btrim(bank_name)) between 1 and 80),
  nickname text not null check (char_length(btrim(nickname)) between 1 and 60),
  account_type public.bank_account_type not null default 'savings',
  last4 char(4) check (last4 is null or last4 ~ '^[0-9]{4}$'),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  opening_balance numeric(14, 2) not null default 0,
  opening_balance_date date not null default current_date,
  status public.account_status not null default 'active',
  visibility public.visibility not null default 'shared',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_accounts_family_id_id_key unique (family_id, id),
  constraint bank_accounts_owner_fk foreign key (family_id, owner_member_id)
    references public.family_members (family_id, id)
);

create index bank_accounts_family_idx on public.bank_accounts (family_id);
create index bank_accounts_owner_idx on public.bank_accounts (owner_member_id);

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  owner_member_id uuid not null,
  issuer text not null check (char_length(btrim(issuer)) between 1 and 80),
  nickname text not null check (char_length(btrim(nickname)) between 1 and 60),
  network public.card_network not null default 'other',
  last4 char(4) check (last4 is null or last4 ~ '^[0-9]{4}$'),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  credit_limit numeric(14, 2) check (credit_limit is null or credit_limit >= 0),
  statement_day smallint check (statement_day between 1 and 31),
  payment_due_day smallint check (payment_due_day between 1 and 31),
  -- Amount owed on the card at opening_balance_date (positive = owed).
  opening_outstanding numeric(14, 2) not null default 0,
  opening_balance_date date not null default current_date,
  status public.account_status not null default 'active',
  visibility public.visibility not null default 'shared',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_cards_family_id_id_key unique (family_id, id),
  constraint credit_cards_owner_fk foreign key (family_id, owner_member_id)
    references public.family_members (family_id, id)
);

create index credit_cards_family_idx on public.credit_cards (family_id);
create index credit_cards_owner_idx on public.credit_cards (owner_member_id);

create trigger bank_accounts_updated_at before update on public.bank_accounts
  for each row execute function private.set_updated_at();
create trigger credit_cards_updated_at before update on public.credit_cards
  for each row execute function private.set_updated_at();
create trigger bank_accounts_audit after insert or update or delete on public.bank_accounts
  for each row execute function private.audit_row();
create trigger credit_cards_audit after insert or update or delete on public.credit_cards
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Visibility: a "private" account is visible only to its owner (and the
-- person who registered it). "shared" accounts are visible to the family.
-- ---------------------------------------------------------------------------
create or replace function private.can_view_owned(
  p_family_id uuid, p_visibility public.visibility, p_owner_member_id uuid, p_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_family_member(p_family_id)
     and (
       p_visibility = 'shared'
       or p_created_by = (select auth.uid())
       or private.is_my_member(p_owner_member_id)
     )
$$;

-- Edit rights on an owned record: writer role, and either admin, owner or creator.
create or replace function private.can_edit_owned(
  p_family_id uuid, p_owner_member_id uuid, p_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_write(p_family_id)
     and (
       private.is_family_admin(p_family_id)
       or p_created_by = (select auth.uid())
       or private.is_my_member(p_owner_member_id)
     )
$$;

grant execute on function private.can_view_owned(uuid, public.visibility, uuid, uuid) to authenticated, service_role;
grant execute on function private.can_edit_owned(uuid, uuid, uuid) to authenticated, service_role;

alter table public.bank_accounts enable row level security;
alter table public.credit_cards enable row level security;

create policy bank_accounts_select on public.bank_accounts for select to authenticated
  using (private.can_view_owned(family_id, visibility, owner_member_id, created_by));
create policy bank_accounts_insert on public.bank_accounts for insert to authenticated
  with check (private.can_write(family_id) and created_by = (select auth.uid()));
create policy bank_accounts_update on public.bank_accounts for update to authenticated
  using (private.can_edit_owned(family_id, owner_member_id, created_by)
         and private.can_view_owned(family_id, visibility, owner_member_id, created_by))
  with check (private.can_edit_owned(family_id, owner_member_id, created_by));
create policy bank_accounts_delete on public.bank_accounts for delete to authenticated
  using (private.can_edit_owned(family_id, owner_member_id, created_by)
         and private.can_view_owned(family_id, visibility, owner_member_id, created_by));

create policy credit_cards_select on public.credit_cards for select to authenticated
  using (private.can_view_owned(family_id, visibility, owner_member_id, created_by));
create policy credit_cards_insert on public.credit_cards for insert to authenticated
  with check (private.can_write(family_id) and created_by = (select auth.uid()));
create policy credit_cards_update on public.credit_cards for update to authenticated
  using (private.can_edit_owned(family_id, owner_member_id, created_by)
         and private.can_view_owned(family_id, visibility, owner_member_id, created_by))
  with check (private.can_edit_owned(family_id, owner_member_id, created_by));
create policy credit_cards_delete on public.credit_cards for delete to authenticated
  using (private.can_edit_owned(family_id, owner_member_id, created_by)
         and private.can_view_owned(family_id, visibility, owner_member_id, created_by));

revoke all on public.bank_accounts, public.credit_cards from anon, authenticated;
grant select, delete on public.bank_accounts, public.credit_cards to authenticated;
grant insert (id, family_id, owner_member_id, bank_name, nickname, account_type, last4, currency,
              opening_balance, opening_balance_date, status, visibility, created_by)
  on public.bank_accounts to authenticated;
grant update (owner_member_id, bank_name, nickname, account_type, last4, currency,
              opening_balance, opening_balance_date, status, visibility)
  on public.bank_accounts to authenticated;
grant insert (id, family_id, owner_member_id, issuer, nickname, network, last4, currency, credit_limit,
              statement_day, payment_due_day, opening_outstanding, opening_balance_date, status, visibility, created_by)
  on public.credit_cards to authenticated;
grant update (owner_member_id, issuer, nickname, network, last4, currency, credit_limit,
              statement_day, payment_due_day, opening_outstanding, opening_balance_date, status, visibility)
  on public.credit_cards to authenticated;
