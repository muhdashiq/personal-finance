-- =============================================================================
-- Investment portfolio (Phase 5 tables).
-- Valuations record their source so the UI can clearly separate manual,
-- estimated and market-verified values.
-- =============================================================================

create type public.investment_type as enum (
  'mutual_fund', 'stock', 'etf', 'fixed_deposit', 'recurring_deposit', 'gold', 'bond',
  'ppf', 'epf', 'nps', 'real_estate', 'crypto', 'other'
);
create type public.valuation_source as enum ('manual', 'estimated', 'market_data');
create type public.investment_txn_kind as enum ('buy', 'sell', 'sip', 'dividend', 'interest', 'redemption', 'fee', 'bonus', 'split');

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  owner_member_id uuid not null,
  investment_type public.investment_type not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  identifier text check (identifier is null or char_length(identifier) <= 40), -- ticker / ISIN / scheme code
  institution text check (institution is null or char_length(institution) <= 80),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  purchase_date date,
  invested_amount numeric(14, 2) not null default 0 check (invested_amount >= 0),
  units numeric(20, 6) check (units is null or units >= 0),
  current_price numeric(18, 4) check (current_price is null or current_price >= 0),
  current_value numeric(14, 2) check (current_value is null or current_value >= 0),
  valuation_source public.valuation_source not null default 'manual',
  valued_at timestamptz,
  interest_rate numeric(6, 3),
  maturity_date date,
  is_active boolean not null default true,
  visibility public.visibility not null default 'shared',
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investments_family_id_id_key unique (family_id, id),
  constraint investments_owner_fk foreign key (family_id, owner_member_id)
    references public.family_members (family_id, id)
);
create index investments_family_idx on public.investments (family_id) where is_active;

create table public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  investment_id uuid not null,
  kind public.investment_txn_kind not null,
  occurred_on date not null,
  units numeric(20, 6),
  price numeric(18, 4),
  amount numeric(14, 2) not null check (amount >= 0),
  transaction_id uuid,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint investment_txns_investment_fk foreign key (family_id, investment_id)
    references public.investments (family_id, id) on delete cascade,
  constraint investment_txns_txn_fk foreign key (family_id, transaction_id)
    references public.transactions (family_id, id) on delete set null (transaction_id)
);
create index investment_txns_investment_idx on public.investment_transactions (investment_id, occurred_on);

create table public.investment_valuations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  investment_id uuid not null,
  valued_on date not null,
  price numeric(18, 4),
  value numeric(14, 2) not null check (value >= 0),
  source public.valuation_source not null default 'manual',
  is_verified boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint investment_valuations_unique unique (investment_id, valued_on, source),
  constraint investment_valuations_verified_needs_market check (not is_verified or source = 'market_data'),
  constraint investment_valuations_investment_fk foreign key (family_id, investment_id)
    references public.investments (family_id, id) on delete cascade
);

create trigger investments_updated_at before update on public.investments
  for each row execute function private.set_updated_at();
create trigger investments_protect before update on public.investments
  for each row execute function private.protect_ownership_columns();
create trigger investment_txns_protect before update on public.investment_transactions
  for each row execute function private.protect_ownership_columns();
create trigger investment_valuations_protect before update on public.investment_valuations
  for each row execute function private.protect_ownership_columns();
create trigger investments_audit after insert or update or delete on public.investments
  for each row execute function private.audit_row();

alter table public.investments enable row level security;
alter table public.investment_transactions enable row level security;
alter table public.investment_valuations enable row level security;

create policy investments_select on public.investments for select to authenticated
  using (private.can_view_owned(family_id, visibility, owner_member_id, created_by));
create policy investments_insert on public.investments for insert to authenticated
  with check (private.can_write(family_id) and created_by = (select auth.uid()));
create policy investments_update on public.investments for update to authenticated
  using (private.can_edit_owned(family_id, owner_member_id, created_by)
         and private.can_view_owned(family_id, visibility, owner_member_id, created_by))
  with check (private.can_edit_owned(family_id, owner_member_id, created_by));
create policy investments_delete on public.investments for delete to authenticated
  using (private.can_edit_owned(family_id, owner_member_id, created_by)
         and private.can_view_owned(family_id, visibility, owner_member_id, created_by));

create policy investment_txns_select on public.investment_transactions for select to authenticated
  using (exists (select 1 from public.investments i where i.id = investment_id));
create policy investment_txns_write on public.investment_transactions for all to authenticated
  using (private.can_write(family_id) and exists (select 1 from public.investments i where i.id = investment_id))
  with check (private.can_write(family_id) and exists (select 1 from public.investments i where i.id = investment_id));

-- Clients may record manual valuations only; market data and verified
-- valuations are written by server-side integrations.
create policy investment_valuations_select on public.investment_valuations for select to authenticated
  using (exists (select 1 from public.investments i where i.id = investment_id));
create policy investment_valuations_write on public.investment_valuations for all to authenticated
  using (private.can_write(family_id) and exists (select 1 from public.investments i where i.id = investment_id))
  with check (
    private.can_write(family_id)
    and source in ('manual', 'estimated')
    and is_verified = false
    and exists (select 1 from public.investments i where i.id = investment_id)
  );

revoke all on public.investments, public.investment_transactions, public.investment_valuations from anon, authenticated;
grant select, insert, update, delete on public.investments, public.investment_transactions, public.investment_valuations
  to authenticated;
