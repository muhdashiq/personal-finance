-- =============================================================================
-- Loans and EMI schedules (Phase 4 tables).
-- =============================================================================

create type public.loan_type as enum (
  'home', 'car', 'two_wheeler', 'personal', 'education', 'gold', 'consumer_durable', 'credit_card_emi', 'business', 'other'
);
create type public.loan_status as enum ('active', 'closed', 'foreclosed');
create type public.emi_status as enum ('upcoming', 'paid', 'missed', 'skipped');

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  owner_member_id uuid not null,
  loan_type public.loan_type not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  account_last4 char(4) check (account_last4 is null or account_last4 ~ '^[0-9]{4}$'),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  principal_amount numeric(14, 2) not null check (principal_amount > 0),
  outstanding_principal numeric(14, 2) not null check (outstanding_principal >= 0),
  -- Annual nominal rate in percent, e.g. 8.650
  interest_rate numeric(6, 3) check (interest_rate is null or interest_rate between 0 and 100),
  emi_amount numeric(14, 2) not null check (emi_amount > 0),
  payment_frequency text not null default 'monthly' check (payment_frequency in ('monthly', 'quarterly', 'yearly')),
  start_date date not null,
  end_date date,
  tenure_months integer check (tenure_months is null or tenure_months between 1 and 600),
  next_payment_date date,
  bank_account_id uuid,
  credit_card_id uuid,
  status public.loan_status not null default 'active',
  visibility public.visibility not null default 'shared',
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loans_family_id_id_key unique (family_id, id),
  constraint loans_dates check (end_date is null or end_date >= start_date),
  constraint loans_outstanding_le_principal check (outstanding_principal <= principal_amount),
  constraint loans_owner_fk foreign key (family_id, owner_member_id)
    references public.family_members (family_id, id),
  constraint loans_bank_fk foreign key (family_id, bank_account_id)
    references public.bank_accounts (family_id, id) on delete set null (bank_account_id),
  constraint loans_card_fk foreign key (family_id, credit_card_id)
    references public.credit_cards (family_id, id) on delete set null (credit_card_id)
);
create index loans_family_idx on public.loans (family_id, status);

create table public.emi_schedules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  loan_id uuid not null,
  installment_no integer not null check (installment_no > 0),
  due_date date not null,
  emi_amount numeric(14, 2) not null check (emi_amount >= 0),
  principal_component numeric(14, 2) check (principal_component is null or principal_component >= 0),
  interest_component numeric(14, 2) check (interest_component is null or interest_component >= 0),
  opening_principal numeric(14, 2),
  closing_principal numeric(14, 2),
  status public.emi_status not null default 'upcoming',
  paid_on date,
  transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emi_schedules_loan_installment_key unique (loan_id, installment_no),
  constraint emi_schedules_loan_fk foreign key (family_id, loan_id)
    references public.loans (family_id, id) on delete cascade,
  constraint emi_schedules_txn_fk foreign key (family_id, transaction_id)
    references public.transactions (family_id, id) on delete set null (transaction_id)
);
create index emi_schedules_due_idx on public.emi_schedules (family_id, due_date) where status = 'upcoming';

create trigger loans_updated_at before update on public.loans
  for each row execute function private.set_updated_at();
create trigger emi_schedules_updated_at before update on public.emi_schedules
  for each row execute function private.set_updated_at();
create trigger loans_audit after insert or update or delete on public.loans
  for each row execute function private.audit_row();

alter table public.loans enable row level security;
alter table public.emi_schedules enable row level security;

create policy loans_select on public.loans for select to authenticated
  using (private.can_view_owned(family_id, visibility, owner_member_id, created_by));
create policy loans_insert on public.loans for insert to authenticated
  with check (private.can_write(family_id) and created_by = (select auth.uid()));
create policy loans_update on public.loans for update to authenticated
  using (private.can_edit_owned(family_id, owner_member_id, created_by)
         and private.can_view_owned(family_id, visibility, owner_member_id, created_by))
  with check (private.can_edit_owned(family_id, owner_member_id, created_by));
create policy loans_delete on public.loans for delete to authenticated
  using (private.can_edit_owned(family_id, owner_member_id, created_by)
         and private.can_view_owned(family_id, visibility, owner_member_id, created_by));

create policy emi_select on public.emi_schedules for select to authenticated
  using (exists (select 1 from public.loans l where l.id = loan_id));
create policy emi_write on public.emi_schedules for all to authenticated
  using (private.can_write(family_id) and exists (select 1 from public.loans l where l.id = loan_id))
  with check (private.can_write(family_id) and exists (select 1 from public.loans l where l.id = loan_id));

revoke all on public.loans, public.emi_schedules from anon, authenticated;
grant select, insert, update, delete on public.loans, public.emi_schedules to authenticated;
create trigger loans_protect before update on public.loans
  for each row execute function private.protect_ownership_columns();
create trigger emi_schedules_protect before update on public.emi_schedules
  for each row execute function private.protect_ownership_columns();
