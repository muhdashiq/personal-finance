-- =============================================================================
-- Categories, transactions, tags, attachments, categorisation rules and
-- recurring transaction templates.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- transaction_categories: two levels (category -> subcategory), per family.
-- ---------------------------------------------------------------------------
create table public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  parent_id uuid,
  kind public.category_kind not null default 'expense',
  name text not null check (char_length(btrim(name)) between 1 and 60),
  icon text check (icon is null or char_length(icon) <= 60),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  is_system boolean not null default false,
  is_archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_categories_family_id_id_key unique (family_id, id),
  constraint transaction_categories_parent_fk foreign key (family_id, parent_id)
    references public.transaction_categories (family_id, id) on delete cascade,
  constraint transaction_categories_not_own_parent check (parent_id is null or parent_id <> id)
);

create unique index transaction_categories_unique_name
  on public.transaction_categories (family_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(name));
create index transaction_categories_parent_idx on public.transaction_categories (parent_id);

create trigger transaction_categories_updated_at before update on public.transaction_categories
  for each row execute function private.set_updated_at();
create trigger transaction_categories_audit after insert or update or delete on public.transaction_categories
  for each row execute function private.audit_row();

-- Only two levels; a subcategory shares its parent's kind.
create or replace function private.validate_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.transaction_categories;
begin
  if new.parent_id is not null then
    select * into v_parent from public.transaction_categories where id = new.parent_id;
    if v_parent.parent_id is not null then
      raise exception 'Subcategories cannot have their own subcategories' using errcode = '22023';
    end if;
    if v_parent.kind <> new.kind then
      raise exception 'A subcategory must have the same kind as its parent' using errcode = '22023';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.transaction_categories c where c.parent_id = new.id) then
      raise exception 'A category with subcategories cannot become a subcategory' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger transaction_categories_validate before insert or update on public.transaction_categories
  for each row execute function private.validate_category();

-- Default category tree, copied into each new family so that families can
-- rename, merge and delete categories independently.
create or replace function private.seed_default_categories(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_parent uuid;
  v_child text;
  v_order integer := 0;
begin
  for r in
    select * from (values
      ('expense', 'Household', 'home-outline', '#5B6CF0', array['Rent', 'Electricity', 'Water', 'Internet', 'Mobile & DTH', 'Gas', 'Maintenance', 'Groceries', 'Household supplies', 'Domestic help']),
      ('expense', 'Food', 'silverware-fork-knife', '#E8833A', array['Restaurants', 'Food delivery', 'Coffee', 'Snacks']),
      ('expense', 'Transportation', 'car-outline', '#2D9CDB', array['Fuel', 'Public transport', 'Taxi', 'Car maintenance', 'Parking', 'Tolls']),
      ('expense', 'Family', 'account-group-outline', '#9B51E0', array['Childcare', 'Education', 'Medical', 'Shopping', 'Family activities', 'Gifts']),
      ('expense', 'Financial', 'bank-outline', '#4F4F7A', array['EMI', 'Loan repayment', 'Insurance', 'Investment', 'Credit card fees', 'Bank charges', 'Taxes']),
      ('expense', 'Lifestyle', 'shopping-outline', '#D9547A', array['Entertainment', 'Travel', 'Clothing', 'Electronics', 'Personal care', 'Subscriptions', 'Fitness']),
      ('expense', 'Other', 'dots-horizontal-circle-outline', '#8A8FA3', array['Charity', 'Miscellaneous']),
      ('income', 'Salary', 'briefcase-outline', '#27AE60', array['Salary', 'Bonus']),
      ('income', 'Business', 'storefront-outline', '#219653', array['Business income', 'Freelance']),
      ('income', 'Investments', 'chart-line', '#2F80ED', array['Interest', 'Dividends', 'Capital gains']),
      ('income', 'Rental income', 'home-city-outline', '#6FCF97', array[]::text[]),
      ('income', 'Other income', 'cash-plus', '#56A97A', array['Gifts received', 'Cashback & rewards', 'Tax refund'])
    ) as t(kind, name, icon, color, children)
  loop
    v_order := v_order + 1;
    insert into public.transaction_categories (family_id, kind, name, icon, color, is_system, sort_order)
    values (p_family_id, r.kind::public.category_kind, r.name, r.icon, r.color, true, v_order)
    returning id into v_parent;

    foreach v_child in array r.children loop
      v_order := v_order + 1;
      insert into public.transaction_categories (family_id, parent_id, kind, name, is_system, sort_order)
      values (p_family_id, v_parent, r.kind::public.category_kind, v_child, true, v_order);
    end loop;
  end loop;
end;
$$;
revoke all on function private.seed_default_categories(uuid) from public;

-- ---------------------------------------------------------------------------
-- transactions
--   type = expense | income | refund : money leaving/entering the family.
--   type = transfer : money moving between the family's own accounts and
--     cards (including paying a credit card bill). Transfers are never counted
--     as income or expense, which is what prevents a card purchase from being
--     counted twice (once on the card, once when the bill is paid).
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  type public.transaction_type not null,
  title text not null check (char_length(btrim(title)) between 1 and 140),
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  occurred_on date not null,
  category_id uuid,
  subcategory_id uuid,
  payment_method public.payment_method,
  bank_account_id uuid,
  credit_card_id uuid,
  counterparty_bank_account_id uuid,
  counterparty_credit_card_id uuid,
  spent_by_member_id uuid not null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  merchant text check (merchant is null or char_length(merchant) <= 140),
  notes text check (notes is null or char_length(notes) <= 2000),
  external_reference text check (external_reference is null or char_length(external_reference) <= 120),
  visibility public.visibility not null default 'shared',
  source public.transaction_source not null default 'manual',
  review_status public.review_status not null default 'confirmed',
  fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint transactions_family_id_id_key unique (family_id, id),
  constraint transactions_category_fk foreign key (family_id, category_id)
    references public.transaction_categories (family_id, id) on delete set null (category_id),
  constraint transactions_subcategory_fk foreign key (family_id, subcategory_id)
    references public.transaction_categories (family_id, id) on delete set null (subcategory_id),
  constraint transactions_bank_account_fk foreign key (family_id, bank_account_id)
    references public.bank_accounts (family_id, id),
  constraint transactions_credit_card_fk foreign key (family_id, credit_card_id)
    references public.credit_cards (family_id, id),
  constraint transactions_cp_bank_account_fk foreign key (family_id, counterparty_bank_account_id)
    references public.bank_accounts (family_id, id),
  constraint transactions_cp_credit_card_fk foreign key (family_id, counterparty_credit_card_id)
    references public.credit_cards (family_id, id),
  constraint transactions_spent_by_fk foreign key (family_id, spent_by_member_id)
    references public.family_members (family_id, id),

  constraint transactions_single_source check (num_nonnulls(bank_account_id, credit_card_id) <= 1),
  constraint transactions_single_counterparty check (num_nonnulls(counterparty_bank_account_id, counterparty_credit_card_id) <= 1),
  constraint transactions_transfer_shape check (
    (type = 'transfer'
      and num_nonnulls(bank_account_id, credit_card_id) = 1
      and num_nonnulls(counterparty_bank_account_id, counterparty_credit_card_id) = 1
      and category_id is null and subcategory_id is null)
    or
    (type <> 'transfer'
      and counterparty_bank_account_id is null and counterparty_credit_card_id is null)
  ),
  constraint transactions_transfer_not_self check (
    bank_account_id is distinct from counterparty_bank_account_id or bank_account_id is null
  ),
  constraint transactions_transfer_not_self_card check (
    credit_card_id is distinct from counterparty_credit_card_id or credit_card_id is null
  )
);

create index transactions_family_date_idx on public.transactions (family_id, occurred_on desc, created_at desc);
create index transactions_member_date_idx on public.transactions (family_id, spent_by_member_id, occurred_on desc);
create index transactions_category_idx on public.transactions (family_id, category_id);
create index transactions_subcategory_idx on public.transactions (subcategory_id) where subcategory_id is not null;
create index transactions_bank_account_idx on public.transactions (bank_account_id) where bank_account_id is not null;
create index transactions_credit_card_idx on public.transactions (credit_card_id) where credit_card_id is not null;
create index transactions_cp_bank_idx on public.transactions (counterparty_bank_account_id) where counterparty_bank_account_id is not null;
create index transactions_cp_card_idx on public.transactions (counterparty_credit_card_id) where counterparty_credit_card_id is not null;
create index transactions_fingerprint_idx on public.transactions (family_id, fingerprint) where fingerprint is not null;
create index transactions_review_idx on public.transactions (family_id) where review_status = 'needs_review';
create index transactions_search_idx on public.transactions
  using gin ((lower(title || ' ' || coalesce(merchant, ''))) extensions.gin_trgm_ops);

create trigger transactions_updated_at before update on public.transactions
  for each row execute function private.set_updated_at();
create trigger transactions_audit after insert or update or delete on public.transactions
  for each row execute function private.audit_row();

-- Normalise and validate a transaction before it is written.
create or replace function private.validate_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat public.transaction_categories;
  v_sub public.transaction_categories;
  v_source_visibility public.visibility;
  v_source_currency char(3);
  v_member_status public.member_status;
begin
  new.title := btrim(new.title);
  new.merchant := nullif(btrim(new.merchant), '');
  new.notes := nullif(btrim(new.notes), '');

  -- Subcategory implies its parent category.
  if new.subcategory_id is not null then
    select * into v_sub from public.transaction_categories where id = new.subcategory_id;
    if v_sub.parent_id is null then
      raise exception 'subcategory_id must reference a subcategory' using errcode = '22023';
    end if;
    if new.category_id is null then
      new.category_id := v_sub.parent_id;
    elsif new.category_id <> v_sub.parent_id then
      raise exception 'Subcategory does not belong to the selected category' using errcode = '22023';
    end if;
  end if;

  if new.category_id is not null then
    select * into v_cat from public.transaction_categories where id = new.category_id;
    if v_cat.parent_id is not null then
      -- A subcategory was passed as the category: normalise.
      new.subcategory_id := v_cat.id;
      new.category_id := v_cat.parent_id;
      select * into v_cat from public.transaction_categories where id = new.category_id;
    end if;
    if (new.type in ('expense', 'refund') and v_cat.kind <> 'expense')
       or (new.type = 'income' and v_cat.kind <> 'income') then
      raise exception 'Category kind does not match the transaction type' using errcode = '22023';
    end if;
  end if;

  -- Card payments default to the credit_card payment method.
  if new.credit_card_id is not null and new.payment_method is null and new.type <> 'transfer' then
    new.payment_method := 'credit_card';
  end if;

  -- Transactions on a private account/card are private.
  if new.bank_account_id is not null then
    select visibility, currency into v_source_visibility, v_source_currency
    from public.bank_accounts where id = new.bank_account_id;
  elsif new.credit_card_id is not null then
    select visibility, currency into v_source_visibility, v_source_currency
    from public.credit_cards where id = new.credit_card_id;
  end if;
  if v_source_visibility = 'private' then
    new.visibility := 'private';
  end if;
  if new.currency is null then
    new.currency := coalesce(v_source_currency, (select base_currency from public.families where id = new.family_id));
  end if;

  if tg_op = 'INSERT' or new.spent_by_member_id is distinct from old.spent_by_member_id then
    select status into v_member_status from public.family_members where id = new.spent_by_member_id;
    if v_member_status = 'removed' then
      raise exception 'Cannot assign a transaction to a removed member' using errcode = '22023';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- Authorship and provenance never change, except that created_by becomes
    -- NULL when the creator's account is deleted (ON DELETE SET NULL).
    if new.created_by is not null then
      new.created_by := old.created_by;
    end if;
    new.source := old.source;
  end if;

  return new;
end;
$$;
revoke all on function private.validate_transaction() from public;

create trigger transactions_validate before insert or update on public.transactions
  for each row execute function private.validate_transaction();

create or replace function private.can_view_transaction(
  p_family_id uuid, p_visibility public.visibility, p_created_by uuid, p_spent_by_member_id uuid
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
       or private.is_my_member(p_spent_by_member_id)
     )
$$;

create or replace function private.can_edit_transaction(
  p_family_id uuid, p_visibility public.visibility, p_created_by uuid, p_spent_by_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_write(p_family_id)
     and private.can_view_transaction(p_family_id, p_visibility, p_created_by, p_spent_by_member_id)
     and (
       private.is_family_admin(p_family_id)
       or p_created_by = (select auth.uid())
       or private.is_my_member(p_spent_by_member_id)
     )
$$;

grant execute on function private.can_view_transaction(uuid, public.visibility, uuid, uuid) to authenticated, service_role;
grant execute on function private.can_edit_transaction(uuid, public.visibility, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name extensions.citext not null check (char_length(btrim(name::text)) between 1 and 40),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  constraint tags_family_id_id_key unique (family_id, id),
  constraint tags_family_name_key unique (family_id, name)
);

create table public.transaction_tags (
  family_id uuid not null,
  transaction_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (transaction_id, tag_id),
  constraint transaction_tags_transaction_fk foreign key (family_id, transaction_id)
    references public.transactions (family_id, id) on delete cascade,
  constraint transaction_tags_tag_fk foreign key (family_id, tag_id)
    references public.tags (family_id, id) on delete cascade
);
create index transaction_tags_tag_idx on public.transaction_tags (tag_id);

-- ---------------------------------------------------------------------------
-- attachments (receipts, statements, documents) stored in Supabase Storage.
-- The object path always starts with the family id; storage policies rely on
-- that prefix.
-- ---------------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  transaction_id uuid,
  bucket text not null check (bucket in ('receipts', 'statements', 'documents')),
  storage_path text not null check (split_part(storage_path, '/', 1) = family_id::text),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (char_length(mime_type) <= 100),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint attachments_bucket_path_key unique (bucket, storage_path),
  constraint attachments_transaction_fk foreign key (family_id, transaction_id)
    references public.transactions (family_id, id) on delete cascade
);
create index attachments_transaction_idx on public.attachments (transaction_id) where transaction_id is not null;
create index attachments_family_idx on public.attachments (family_id);

create trigger attachments_audit after insert or delete on public.attachments
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- transaction_rules: user-defined and learned categorisation rules.
-- ---------------------------------------------------------------------------
create table public.transaction_rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  match_field text not null default 'any' check (match_field in ('merchant', 'description', 'any')),
  match_type text not null default 'contains' check (match_type in ('contains', 'equals', 'starts_with', 'regex')),
  pattern text not null check (char_length(btrim(pattern)) between 1 and 120),
  category_id uuid not null,
  subcategory_id uuid,
  set_merchant text check (set_merchant is null or char_length(set_merchant) <= 140),
  priority integer not null default 100,
  origin text not null default 'user' check (origin in ('user', 'learned')),
  is_active boolean not null default true,
  hit_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_rules_category_fk foreign key (family_id, category_id)
    references public.transaction_categories (family_id, id) on delete cascade,
  constraint transaction_rules_subcategory_fk foreign key (family_id, subcategory_id)
    references public.transaction_categories (family_id, id) on delete cascade
);
create index transaction_rules_family_idx on public.transaction_rules (family_id, is_active, priority);
create unique index transaction_rules_unique_pattern
  on public.transaction_rules (family_id, match_field, match_type, lower(pattern));

create trigger transaction_rules_updated_at before update on public.transaction_rules
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- recurring_transactions: templates for rent, subscriptions, bills, SIPs.
-- ---------------------------------------------------------------------------
create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  type public.transaction_type not null check (type <> 'refund'),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  category_id uuid,
  subcategory_id uuid,
  payment_method public.payment_method,
  bank_account_id uuid,
  credit_card_id uuid,
  counterparty_bank_account_id uuid,
  counterparty_credit_card_id uuid,
  spent_by_member_id uuid not null,
  merchant text check (merchant is null or char_length(merchant) <= 140),
  notes text check (notes is null or char_length(notes) <= 2000),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly')),
  interval_count smallint not null default 1 check (interval_count between 1 and 12),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  next_occurrence date not null,
  reminder_days_before smallint not null default 2 check (reminder_days_before between 0 and 30),
  auto_create boolean not null default false,
  is_active boolean not null default true,
  visibility public.visibility not null default 'shared',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_transactions_family_id_id_key unique (family_id, id),
  constraint recurring_category_fk foreign key (family_id, category_id)
    references public.transaction_categories (family_id, id) on delete set null (category_id),
  constraint recurring_subcategory_fk foreign key (family_id, subcategory_id)
    references public.transaction_categories (family_id, id) on delete set null (subcategory_id),
  constraint recurring_bank_account_fk foreign key (family_id, bank_account_id)
    references public.bank_accounts (family_id, id) on delete cascade,
  constraint recurring_credit_card_fk foreign key (family_id, credit_card_id)
    references public.credit_cards (family_id, id) on delete cascade,
  constraint recurring_cp_bank_account_fk foreign key (family_id, counterparty_bank_account_id)
    references public.bank_accounts (family_id, id) on delete cascade,
  constraint recurring_cp_credit_card_fk foreign key (family_id, counterparty_credit_card_id)
    references public.credit_cards (family_id, id) on delete cascade,
  constraint recurring_spent_by_fk foreign key (family_id, spent_by_member_id)
    references public.family_members (family_id, id)
);
create index recurring_transactions_due_idx on public.recurring_transactions (family_id, next_occurrence) where is_active;

create trigger recurring_transactions_updated_at before update on public.recurring_transactions
  for each row execute function private.set_updated_at();
create trigger recurring_transactions_audit after insert or update or delete on public.recurring_transactions
  for each row execute function private.audit_row();

alter table public.transactions
  add column recurring_transaction_id uuid,
  add constraint transactions_recurring_fk foreign key (family_id, recurring_transaction_id)
    references public.recurring_transactions (family_id, id) on delete set null (recurring_transaction_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.transaction_categories enable row level security;
alter table public.transactions enable row level security;
alter table public.tags enable row level security;
alter table public.transaction_tags enable row level security;
alter table public.attachments enable row level security;
alter table public.transaction_rules enable row level security;
alter table public.recurring_transactions enable row level security;

create policy categories_select on public.transaction_categories for select to authenticated
  using (family_id in (select private.my_family_ids()));
create policy categories_insert on public.transaction_categories for insert to authenticated
  with check (private.can_write(family_id) and is_system = false);
create policy categories_update on public.transaction_categories for update to authenticated
  using (private.can_write(family_id)) with check (private.can_write(family_id));
create policy categories_delete on public.transaction_categories for delete to authenticated
  using (private.can_write(family_id));

create policy transactions_select on public.transactions for select to authenticated
  using (private.can_view_transaction(family_id, visibility, created_by, spent_by_member_id));
create policy transactions_insert on public.transactions for insert to authenticated
  with check (
    private.can_write(family_id)
    and created_by = (select auth.uid())
    and source = 'manual'
  );
create policy transactions_update on public.transactions for update to authenticated
  using (private.can_edit_transaction(family_id, visibility, created_by, spent_by_member_id))
  with check (private.can_edit_transaction(family_id, visibility, created_by, spent_by_member_id));
create policy transactions_delete on public.transactions for delete to authenticated
  using (private.can_edit_transaction(family_id, visibility, created_by, spent_by_member_id));

create policy tags_select on public.tags for select to authenticated
  using (family_id in (select private.my_family_ids()));
create policy tags_insert on public.tags for insert to authenticated
  with check (private.can_write(family_id));
create policy tags_update on public.tags for update to authenticated
  using (private.can_write(family_id)) with check (private.can_write(family_id));
create policy tags_delete on public.tags for delete to authenticated
  using (private.can_write(family_id));

-- Tag links follow the transaction's visibility (the subquery is itself
-- filtered by the transactions policies).
create policy transaction_tags_select on public.transaction_tags for select to authenticated
  using (exists (select 1 from public.transactions t where t.id = transaction_id));
create policy transaction_tags_insert on public.transaction_tags for insert to authenticated
  with check (
    private.can_write(family_id)
    and exists (select 1 from public.transactions t where t.id = transaction_id)
  );
create policy transaction_tags_delete on public.transaction_tags for delete to authenticated
  using (
    private.can_write(family_id)
    and exists (select 1 from public.transactions t where t.id = transaction_id)
  );

create policy attachments_select on public.attachments for select to authenticated
  using (
    family_id in (select private.my_family_ids())
    and (transaction_id is null or exists (select 1 from public.transactions t where t.id = transaction_id))
  );
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    private.can_write(family_id)
    and uploaded_by = (select auth.uid())
    and (transaction_id is null or exists (select 1 from public.transactions t where t.id = transaction_id))
  );
create policy attachments_delete on public.attachments for delete to authenticated
  using (
    private.can_write(family_id)
    and (uploaded_by = (select auth.uid()) or private.is_family_admin(family_id))
  );

create policy rules_select on public.transaction_rules for select to authenticated
  using (family_id in (select private.my_family_ids()));
create policy rules_insert on public.transaction_rules for insert to authenticated
  with check (private.can_write(family_id) and created_by = (select auth.uid()));
create policy rules_update on public.transaction_rules for update to authenticated
  using (private.can_write(family_id)) with check (private.can_write(family_id));
create policy rules_delete on public.transaction_rules for delete to authenticated
  using (private.can_write(family_id));

create policy recurring_select on public.recurring_transactions for select to authenticated
  using (private.can_view_transaction(family_id, visibility, created_by, spent_by_member_id));
create policy recurring_insert on public.recurring_transactions for insert to authenticated
  with check (private.can_write(family_id) and created_by = (select auth.uid()));
create policy recurring_update on public.recurring_transactions for update to authenticated
  using (private.can_edit_transaction(family_id, visibility, created_by, spent_by_member_id))
  with check (private.can_edit_transaction(family_id, visibility, created_by, spent_by_member_id));
create policy recurring_delete on public.recurring_transactions for delete to authenticated
  using (private.can_edit_transaction(family_id, visibility, created_by, spent_by_member_id));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.transaction_categories, public.transactions, public.tags, public.transaction_tags,
  public.attachments, public.transaction_rules, public.recurring_transactions from anon, authenticated;

grant select, delete on public.transaction_categories to authenticated;
grant insert (id, family_id, parent_id, kind, name, icon, color, sort_order) on public.transaction_categories to authenticated;
grant update (parent_id, name, icon, color, is_archived, sort_order) on public.transaction_categories to authenticated;

grant select, delete on public.transactions to authenticated;
grant insert (id, family_id, type, title, amount, currency, occurred_on, category_id, subcategory_id, payment_method,
              bank_account_id, credit_card_id, counterparty_bank_account_id, counterparty_credit_card_id,
              spent_by_member_id, created_by, merchant, notes, external_reference, visibility, review_status)
  on public.transactions to authenticated;
grant update (type, title, amount, currency, occurred_on, category_id, subcategory_id, payment_method,
              bank_account_id, credit_card_id, counterparty_bank_account_id, counterparty_credit_card_id,
              spent_by_member_id, merchant, notes, external_reference, visibility, review_status)
  on public.transactions to authenticated;

grant select, insert, delete on public.tags to authenticated;
grant update (name, color) on public.tags to authenticated;
grant select, insert, delete on public.transaction_tags to authenticated;
grant select, insert, delete on public.attachments to authenticated;

grant select, delete on public.transaction_rules to authenticated;
grant insert (id, family_id, match_field, match_type, pattern, category_id, subcategory_id, set_merchant, priority, origin, is_active, created_by)
  on public.transaction_rules to authenticated;
grant update (match_field, match_type, pattern, category_id, subcategory_id, set_merchant, priority, is_active)
  on public.transaction_rules to authenticated;

grant select, insert, update, delete on public.recurring_transactions to authenticated;
create trigger recurring_transactions_protect before update on public.recurring_transactions
  for each row execute function private.protect_ownership_columns();

-- ---------------------------------------------------------------------------
-- RPC: merge one category into another. Transactions, rules, recurring
-- templates and budgets are moved to the target; the source is deleted.
-- ---------------------------------------------------------------------------
create or replace function public.merge_categories(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.transaction_categories;
  v_dst public.transaction_categories;
  v_child public.transaction_categories;
  v_existing uuid;
begin
  select * into v_src from public.transaction_categories where id = p_source_id for update;
  select * into v_dst from public.transaction_categories where id = p_target_id for update;

  if v_src.id is null or v_dst.id is null or v_src.family_id <> v_dst.family_id
     or not private.can_write(v_src.family_id) then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;
  if v_src.id = v_dst.id then
    raise exception 'Choose a different category to merge into' using errcode = '22023';
  end if;
  if v_src.kind <> v_dst.kind then
    raise exception 'Only categories of the same kind can be merged' using errcode = '22023';
  end if;
  if v_src.parent_id is null and v_dst.parent_id is not null then
    raise exception 'A top-level category can only be merged into another top-level category' using errcode = '22023';
  end if;

  if v_src.parent_id is null then
    -- Move or merge each subcategory under the target.
    for v_child in select * from public.transaction_categories where parent_id = v_src.id loop
      select id into v_existing from public.transaction_categories
       where parent_id = v_dst.id and lower(name) = lower(v_child.name);
      if v_existing is null then
        update public.transaction_categories set parent_id = v_dst.id where id = v_child.id;
        update public.transactions set category_id = v_dst.id where subcategory_id = v_child.id;
        update public.recurring_transactions set category_id = v_dst.id where subcategory_id = v_child.id;
        update public.transaction_rules set category_id = v_dst.id where subcategory_id = v_child.id;
      else
        perform public.merge_categories(v_child.id, v_existing);
      end if;
    end loop;

    update public.transactions set category_id = v_dst.id where category_id = v_src.id;
    update public.recurring_transactions set category_id = v_dst.id where category_id = v_src.id;
    update public.transaction_rules set category_id = v_dst.id where category_id = v_src.id;
  else
    -- Subcategory into a subcategory or into a top-level category.
    update public.transactions
       set category_id = coalesce(v_dst.parent_id, v_dst.id),
           subcategory_id = case when v_dst.parent_id is null then null else v_dst.id end
     where subcategory_id = v_src.id;
    update public.recurring_transactions
       set category_id = coalesce(v_dst.parent_id, v_dst.id),
           subcategory_id = case when v_dst.parent_id is null then null else v_dst.id end
     where subcategory_id = v_src.id;
    update public.transaction_rules
       set category_id = coalesce(v_dst.parent_id, v_dst.id),
           subcategory_id = case when v_dst.parent_id is null then null else v_dst.id end
     where subcategory_id = v_src.id;
  end if;

  -- Budgets (created in a later migration) follow the category.
  if to_regclass('public.budget_categories') is not null then
    execute $q$
      delete from public.budget_categories s
       using public.budget_categories d
       where s.category_id = $1 and d.category_id = $2 and d.budget_id = s.budget_id
    $q$ using v_src.id, v_dst.id;
    execute 'update public.budget_categories set category_id = $2 where category_id = $1'
      using v_src.id, v_dst.id;
  end if;

  delete from public.transaction_categories where id = v_src.id;

  perform private.audit_event(v_src.family_id, 'category.merged', 'transaction_categories', v_dst.id,
    jsonb_build_object('source_id', v_src.id, 'source_name', v_src.name, 'target_name', v_dst.name));
end;
$$;

revoke all on function public.merge_categories(uuid, uuid) from public, anon;
grant execute on function public.merge_categories(uuid, uuid) to authenticated;
