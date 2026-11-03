-- =============================================================================
-- Budgets (Phase 3) and trips / events (Phase 5).
--
-- Trips and events share one table: an event is a trip whose kind is not
-- 'trip' (wedding, birthday, festival, renovation, ...). The "events" view
-- exposes the non-trip kinds for convenience.
-- =============================================================================

create type public.trip_kind as enum (
  'trip', 'vacation', 'wedding', 'birthday', 'festival', 'renovation', 'function', 'other'
);
create type public.trip_status as enum ('planned', 'active', 'completed', 'cancelled');
create type public.budget_scope as enum ('family', 'member', 'trip');
create type public.budget_period as enum ('monthly', 'yearly', 'custom');

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kind public.trip_kind not null default 'trip',
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 2000),
  location text check (location is null or char_length(location) <= 120),
  start_date date not null,
  end_date date,
  budget numeric(14, 2) check (budget is null or budget >= 0),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  status public.trip_status not null default 'planned',
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_family_id_id_key unique (family_id, id),
  constraint trips_dates check (end_date is null or end_date >= start_date)
);
create index trips_family_idx on public.trips (family_id, start_date desc);

create table public.trip_members (
  family_id uuid not null,
  trip_id uuid not null,
  member_id uuid not null,
  primary key (trip_id, member_id),
  constraint trip_members_trip_fk foreign key (family_id, trip_id)
    references public.trips (family_id, id) on delete cascade,
  constraint trip_members_member_fk foreign key (family_id, member_id)
    references public.family_members (family_id, id) on delete cascade
);

create view public.events with (security_invoker = true) as
  select * from public.trips where kind <> 'trip';

alter table public.transactions
  add column trip_id uuid,
  add constraint transactions_trip_fk foreign key (family_id, trip_id)
    references public.trips (family_id, id) on delete set null (trip_id);
create index transactions_trip_idx on public.transactions (trip_id) where trip_id is not null;
grant insert (trip_id), update (trip_id) on public.transactions to authenticated;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  scope public.budget_scope not null default 'family',
  member_id uuid,
  trip_id uuid,
  period public.budget_period not null default 'monthly',
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  starts_on date not null,
  ends_on date,
  alert_thresholds smallint[] not null default '{75,90,100}',
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_family_id_id_key unique (family_id, id),
  constraint budgets_scope_shape check (
    (scope = 'family' and member_id is null and trip_id is null)
    or (scope = 'member' and member_id is not null and trip_id is null)
    or (scope = 'trip' and trip_id is not null and member_id is null)
  ),
  constraint budgets_custom_has_end check (period <> 'custom' or ends_on is not null),
  constraint budgets_dates check (ends_on is null or ends_on >= starts_on),
  constraint budgets_member_fk foreign key (family_id, member_id)
    references public.family_members (family_id, id) on delete cascade,
  constraint budgets_trip_fk foreign key (family_id, trip_id)
    references public.trips (family_id, id) on delete cascade
);
create index budgets_family_idx on public.budgets (family_id) where is_active;

-- Category allocations inside a budget (e.g. Groceries ₹15,000 of ₹1,00,000).
create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  budget_id uuid not null,
  category_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  constraint budget_categories_budget_category_key unique (budget_id, category_id),
  constraint budget_categories_budget_fk foreign key (family_id, budget_id)
    references public.budgets (family_id, id) on delete cascade,
  constraint budget_categories_category_fk foreign key (family_id, category_id)
    references public.transaction_categories (family_id, id) on delete cascade
);

-- Remember which threshold alerts were already sent for a budget period so
-- alerts are idempotent.
create table public.budget_alerts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  budget_id uuid not null,
  category_id uuid,
  period_start date not null,
  threshold smallint not null,
  created_at timestamptz not null default now(),
  constraint budget_alerts_budget_fk foreign key (family_id, budget_id)
    references public.budgets (family_id, id) on delete cascade
);
create unique index budget_alerts_once
  on public.budget_alerts (budget_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid), period_start, threshold);

create trigger trips_updated_at before update on public.trips
  for each row execute function private.set_updated_at();
create trigger budgets_updated_at before update on public.budgets
  for each row execute function private.set_updated_at();
create trigger trips_protect before update on public.trips
  for each row execute function private.protect_ownership_columns();
create trigger budgets_protect before update on public.budgets
  for each row execute function private.protect_ownership_columns();
create trigger budget_categories_protect before update on public.budget_categories
  for each row execute function private.protect_ownership_columns();
create trigger trips_audit after insert or update or delete on public.trips
  for each row execute function private.audit_row();
create trigger budgets_audit after insert or update or delete on public.budgets
  for each row execute function private.audit_row();

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_categories enable row level security;
alter table public.budget_alerts enable row level security;

create policy trips_select on public.trips for select to authenticated
  using (family_id in (select private.my_family_ids()));
create policy trips_write on public.trips for all to authenticated
  using (private.can_write(family_id)) with check (private.can_write(family_id));

create policy trip_members_select on public.trip_members for select to authenticated
  using (family_id in (select private.my_family_ids()));
create policy trip_members_write on public.trip_members for all to authenticated
  using (private.can_write(family_id)) with check (private.can_write(family_id));

create policy budgets_select on public.budgets for select to authenticated
  using (family_id in (select private.my_family_ids()));
create policy budgets_write on public.budgets for all to authenticated
  using (private.can_write(family_id)) with check (private.can_write(family_id));

create policy budget_categories_select on public.budget_categories for select to authenticated
  using (family_id in (select private.my_family_ids()));
create policy budget_categories_write on public.budget_categories for all to authenticated
  using (private.can_write(family_id)) with check (private.can_write(family_id));

create policy budget_alerts_select on public.budget_alerts for select to authenticated
  using (family_id in (select private.my_family_ids()));

revoke all on public.trips, public.trip_members, public.budgets, public.budget_categories, public.budget_alerts
  from anon, authenticated;
grant select, insert, update, delete on public.trips, public.trip_members, public.budgets, public.budget_categories
  to authenticated;
grant select on public.budget_alerts, public.events to authenticated;
