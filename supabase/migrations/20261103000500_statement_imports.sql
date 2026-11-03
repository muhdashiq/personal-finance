-- =============================================================================
-- Statement imports and reconciliation (Phase 2 tables).
--
-- Provenance model:
--   statement_imports              one uploaded file
--   imported_statement_transactions one extracted row, kept forever (never
--                                  deleted by deduplication)
--   transactions.import_row_id     the row a transaction was created from
--   transaction_matches            candidate duplicate pairs and their
--                                  resolution (the reconciliation audit trail)
-- =============================================================================

create type public.import_status as enum ('uploaded', 'parsing', 'review', 'completed', 'failed', 'cancelled');
create type public.match_classification as enum ('confirmed_duplicate', 'possible_duplicate', 'unique');
create type public.import_row_resolution as enum ('pending', 'imported', 'merged', 'ignored', 'failed');

create table public.statement_imports (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  bank_account_id uuid,
  credit_card_id uuid,
  storage_path text not null check (split_part(storage_path, '/', 1) = family_id::text),
  file_name text not null check (char_length(file_name) between 1 and 200),
  file_format text not null check (file_format in ('pdf', 'csv', 'xlsx')),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  detected_institution text,
  detected_format text,
  period_start date,
  period_end date,
  status public.import_status not null default 'uploaded',
  total_rows integer not null default 0,
  new_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  possible_duplicate_rows integer not null default 0,
  failed_rows integer not null default 0,
  review_rows integer not null default 0,
  -- Credit card statement metadata
  statement_balance numeric(14, 2),
  minimum_due numeric(14, 2),
  total_due numeric(14, 2),
  payment_due_date date,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint statement_imports_family_id_id_key unique (family_id, id),
  constraint statement_imports_one_target check (num_nonnulls(bank_account_id, credit_card_id) = 1),
  constraint statement_imports_bank_fk foreign key (family_id, bank_account_id)
    references public.bank_accounts (family_id, id),
  constraint statement_imports_card_fk foreign key (family_id, credit_card_id)
    references public.credit_cards (family_id, id)
);

-- Idempotency: the same file cannot be imported twice into a family unless
-- the earlier attempt failed or was cancelled.
create unique index statement_imports_idempotent
  on public.statement_imports (family_id, file_sha256)
  where status not in ('failed', 'cancelled');
create index statement_imports_family_idx on public.statement_imports (family_id, created_at desc);

create trigger statement_imports_updated_at before update on public.statement_imports
  for each row execute function private.set_updated_at();
create trigger statement_imports_audit after insert or update on public.statement_imports
  for each row execute function private.audit_row();

create table public.imported_statement_transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  import_id uuid not null,
  row_index integer not null check (row_index >= 0),
  raw jsonb not null,
  occurred_on date,
  description_raw text,
  description_normalized text,
  merchant text,
  debit_amount numeric(14, 2) check (debit_amount is null or debit_amount >= 0),
  credit_amount numeric(14, 2) check (credit_amount is null or credit_amount >= 0),
  balance numeric(14, 2),
  reference text,
  fingerprint text,
  suggested_type public.transaction_type,
  suggested_category_id uuid,
  suggested_subcategory_id uuid,
  category_confidence numeric(4, 3) check (category_confidence between 0 and 1),
  classification public.match_classification,
  resolution public.import_row_resolution not null default 'pending',
  transaction_id uuid,
  parse_error text,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint imported_rows_family_id_id_key unique (family_id, id),
  constraint imported_rows_import_row_key unique (import_id, row_index),
  constraint imported_rows_import_fk foreign key (family_id, import_id)
    references public.statement_imports (family_id, id), -- NO ACTION: rows outlive deduplication
  constraint imported_rows_transaction_fk foreign key (family_id, transaction_id)
    references public.transactions (family_id, id) on delete set null (transaction_id),
  constraint imported_rows_category_fk foreign key (family_id, suggested_category_id)
    references public.transaction_categories (family_id, id) on delete set null (suggested_category_id),
  constraint imported_rows_subcategory_fk foreign key (family_id, suggested_subcategory_id)
    references public.transaction_categories (family_id, id) on delete set null (suggested_subcategory_id)
);
create index imported_rows_fingerprint_idx on public.imported_statement_transactions (family_id, fingerprint);
create index imported_rows_pending_idx on public.imported_statement_transactions (import_id) where resolution = 'pending';

-- The family itself can still be deleted (account deletion), which must
-- cascade; the NO ACTION import FK above only stops deleting an import
-- directly (it is checked after the family cascade completes).
alter table public.imported_statement_transactions
  add constraint imported_rows_family_fk foreign key (family_id)
    references public.families (id) on delete cascade;

alter table public.transactions
  add column import_row_id uuid,
  add constraint transactions_import_row_fk foreign key (family_id, import_row_id)
    references public.imported_statement_transactions (family_id, id) on delete set null (import_row_id);
create index transactions_import_row_idx on public.transactions (import_row_id) where import_row_id is not null;

alter table public.attachments
  add column statement_import_id uuid,
  add constraint attachments_import_fk foreign key (family_id, statement_import_id)
    references public.statement_imports (family_id, id) on delete cascade;

create table public.transaction_matches (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  imported_row_id uuid,
  transaction_id uuid not null,
  candidate_transaction_id uuid,
  classification public.match_classification not null check (classification <> 'unique'),
  score numeric(5, 4) not null check (score between 0 and 1),
  reasons jsonb not null default '[]'::jsonb,
  resolution text not null default 'pending'
    check (resolution in ('pending', 'merged', 'not_duplicate', 'ignored', 'linked_transfer')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint transaction_matches_one_side check (num_nonnulls(imported_row_id, candidate_transaction_id) = 1),
  constraint transaction_matches_row_fk foreign key (family_id, imported_row_id)
    references public.imported_statement_transactions (family_id, id) on delete cascade,
  constraint transaction_matches_txn_fk foreign key (family_id, transaction_id)
    references public.transactions (family_id, id) on delete cascade,
  constraint transaction_matches_candidate_fk foreign key (family_id, candidate_transaction_id)
    references public.transactions (family_id, id) on delete cascade
);
create index transaction_matches_pending_idx on public.transaction_matches (family_id) where resolution = 'pending';
create index transaction_matches_row_idx on public.transaction_matches (imported_row_id);
create index transaction_matches_txn_idx on public.transaction_matches (transaction_id);

create trigger transaction_matches_audit after insert or update on public.transaction_matches
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- RLS: an import is visible to whoever can see its target account/card.
-- Writes are performed by the import Edge Function (service role) and the
-- reconciliation RPCs; clients only read and resolve.
-- ---------------------------------------------------------------------------
create or replace function private.can_view_import(p_import_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.statement_imports i
    left join public.bank_accounts b on b.id = i.bank_account_id
    left join public.credit_cards c on c.id = i.credit_card_id
    where i.id = p_import_id
      and (
        (b.id is not null and private.can_view_owned(b.family_id, b.visibility, b.owner_member_id, b.created_by))
        or (c.id is not null and private.can_view_owned(c.family_id, c.visibility, c.owner_member_id, c.created_by))
      )
  )
$$;
grant execute on function private.can_view_import(uuid) to authenticated, service_role;

alter table public.statement_imports enable row level security;
alter table public.imported_statement_transactions enable row level security;
alter table public.transaction_matches enable row level security;

create policy statement_imports_select on public.statement_imports for select to authenticated
  using (private.can_view_import(id));
create policy statement_imports_insert on public.statement_imports for insert to authenticated
  with check (private.can_write(family_id) and uploaded_by = (select auth.uid()) and status = 'uploaded');
create policy statement_imports_cancel on public.statement_imports for update to authenticated
  using (private.can_write(family_id) and private.can_view_import(id) and status in ('uploaded', 'review'))
  with check (private.can_write(family_id) and status = 'cancelled');

create policy imported_rows_select on public.imported_statement_transactions for select to authenticated
  using (private.can_view_import(import_id));

create policy transaction_matches_select on public.transaction_matches for select to authenticated
  using (exists (select 1 from public.transactions t where t.id = transaction_id));

revoke all on public.statement_imports, public.imported_statement_transactions, public.transaction_matches
  from anon, authenticated;
grant select on public.statement_imports, public.imported_statement_transactions, public.transaction_matches to authenticated;
grant insert (id, family_id, uploaded_by, bank_account_id, credit_card_id, storage_path, file_name, file_format, file_sha256)
  on public.statement_imports to authenticated;
grant update (status) on public.statement_imports to authenticated;
