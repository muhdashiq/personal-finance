-- =============================================================================
-- Family Finance — foundation
-- Extensions, private helper schema, shared enums and trigger functions.
--
-- Conventions used across all migrations:
--   * UUID primary keys (gen_random_uuid()).
--   * Money is numeric(14,2); never float.
--   * Every family-owned row carries family_id, and references to other
--     family-owned rows use composite foreign keys (family_id, id) so a row can
--     never point at another family's data, even through a bug in the app.
--   * RLS is enabled on every table in the public schema.
--   * Helper functions live in the "private" schema, which PostgREST does not
--     expose.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated, service_role;
-- Functions in "private" are not executable unless explicitly granted.
alter default privileges in schema private revoke execute on functions from public;
-- RPCs in "public" are granted explicitly per function.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.family_role as enum ('admin', 'member', 'viewer');
create type public.member_status as enum ('active', 'removed');
create type public.member_relationship as enum ('self', 'spouse', 'partner', 'child', 'parent', 'sibling', 'other');
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'revoked');
create type public.visibility as enum ('shared', 'private');

create type public.transaction_type as enum ('expense', 'income', 'transfer', 'refund');
create type public.transaction_source as enum ('manual', 'statement_import', 'recurring');
create type public.review_status as enum ('confirmed', 'needs_review');
create type public.payment_method as enum (
  'cash', 'upi', 'debit_card', 'credit_card', 'net_banking', 'bank_transfer', 'cheque', 'wallet', 'auto_debit', 'other'
);
create type public.category_kind as enum ('expense', 'income');

create type public.bank_account_type as enum ('savings', 'current', 'salary', 'nre', 'nro', 'wallet', 'cash', 'other');
create type public.account_status as enum ('active', 'dormant', 'closed');
create type public.card_network as enum ('visa', 'mastercard', 'rupay', 'amex', 'diners', 'discover', 'other');

-- ---------------------------------------------------------------------------
-- Generic trigger: maintain updated_at
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generic trigger: family_id and created_by never change after insert.
-- Used on tables where clients have table-level UPDATE privileges.
-- ---------------------------------------------------------------------------
create or replace function private.protect_ownership_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
begin
  if (v_new -> 'family_id') is distinct from (v_old -> 'family_id') then
    raise exception 'family_id cannot be changed' using errcode = '42501';
  end if;
  -- created_by may only become NULL (the creator's account was deleted).
  if v_new ? 'created_by' and (v_new ->> 'created_by') is not null
     and (v_new -> 'created_by') is distinct from (v_old -> 'created_by') then
    raise exception 'created_by cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
