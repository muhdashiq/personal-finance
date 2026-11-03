-- =============================================================================
-- Identity, families, membership, invitations and the audit log.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles: app-level data for each auth user (the "users" table)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 1024),
  default_family_id uuid,
  theme_preference text not null default 'system' check (theme_preference in ('system', 'light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Create a profile for every new auth user.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Member'
  );
  insert into public.profiles (id, display_name)
  values (new.id, left(v_name, 80))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- families
-- ---------------------------------------------------------------------------
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  base_currency char(3) not null default 'INR' check (base_currency ~ '^[A-Z]{3}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger families_updated_at before update on public.families
  for each row execute function private.set_updated_at();

alter table public.profiles
  add constraint profiles_default_family_fk
  foreign key (default_family_id) references public.families (id) on delete set null;

-- ---------------------------------------------------------------------------
-- family_members
--   A member may or may not have a login (user_id). Members without a login
--   (children, a spouse who has not joined yet) can still be tagged as the
--   person who spent money. An invitation can later "claim" such a member.
-- ---------------------------------------------------------------------------
create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  relationship public.member_relationship not null default 'other',
  role public.family_role not null default 'member',
  status public.member_status not null default 'active',
  color text not null default '#4F5BD5' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_members_family_id_id_key unique (family_id, id),
  constraint family_members_admin_needs_login check (role <> 'admin' or user_id is not null)
);

create unique index family_members_family_user_key
  on public.family_members (family_id, user_id) where user_id is not null;
create index family_members_user_idx on public.family_members (user_id) where status = 'active';

create trigger family_members_updated_at before update on public.family_members
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers. SECURITY DEFINER so they can read family_members without
-- recursing through family_members' own policies.
-- ---------------------------------------------------------------------------
create or replace function private.my_family_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.family_id
  from public.family_members m
  where m.user_id = (select auth.uid()) and m.status = 'active'
$$;

create or replace function private.current_member_id(p_family_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.family_members m
  where m.family_id = p_family_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
$$;

create or replace function private.family_role(p_family_id uuid)
returns public.family_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.family_members m
  where m.family_id = p_family_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
$$;

create or replace function private.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.family_role(p_family_id) is not null
$$;

create or replace function private.is_family_admin(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.family_role(p_family_id) = 'admin', false)
$$;

-- admins and members can write; viewers are read-only.
create or replace function private.can_write(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.family_role(p_family_id) in ('admin', 'member'), false)
$$;

-- Does the member row belong to the calling user?
create or replace function private.is_my_member(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.family_members m
    where m.id = p_member_id and m.user_id = (select auth.uid()) and m.status = 'active'
  )
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- family_invitations
--   Only a SHA-256 hash of the invitation token is stored. The plain token is
--   returned exactly once, to the admin who created it.
-- ---------------------------------------------------------------------------
create table public.family_invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  email extensions.citext check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.family_role not null default 'member',
  member_id uuid,
  token_hash bytea not null unique,
  status public.invitation_status not null default 'pending',
  invited_by uuid references auth.users (id) on delete set null,
  responded_by uuid references auth.users (id) on delete set null,
  responded_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint family_invitations_member_fk foreign key (family_id, member_id)
    references public.family_members (family_id, id) on delete cascade
);

create index family_invitations_family_idx on public.family_invitations (family_id, status);
create index family_invitations_email_idx on public.family_invitations (email) where status = 'pending';
create unique index family_invitations_one_pending_per_email
  on public.family_invitations (family_id, email) where status = 'pending' and email is not null;

-- ---------------------------------------------------------------------------
-- audit_logs (append-only, written by triggers)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  family_id uuid references public.families (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  changes jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_family_idx on public.audit_logs (family_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- Generic row audit trigger. Records changed columns for updates.
create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb;
  v_family uuid;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('old', v_old -> n.key, 'new', n.value))
      into v_changes
    from jsonb_each(v_new) n
    where n.key not in ('updated_at', 'token_hash')
      and (v_old -> n.key) is distinct from n.value;
    if v_changes is null then
      return new; -- nothing meaningful changed
    end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new - 'token_hash';
  else
    v_changes := v_old - 'token_hash';
  end if;

  v_family := case
    when tg_table_name = 'families' then (v_row ->> 'id')::uuid
    else (v_row ->> 'family_id')::uuid
  end;

  -- A family being deleted cascades to its rows; do not try to log into it.
  if tg_op = 'DELETE' and not exists (select 1 from public.families f where f.id = v_family) then
    return old;
  end if;

  insert into public.audit_logs (family_id, actor_id, action, entity_type, entity_id, changes)
  values (v_family, auth.uid(), lower(tg_op), tg_table_name, (v_row ->> 'id')::uuid, v_changes);

  return coalesce(new, old);
end;
$$;

-- Explicit audit events from RPCs (e.g. invitation accepted, categories merged).
create or replace function private.audit_event(
  p_family_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (family_id, actor_id, action, entity_type, entity_id, changes)
  values (p_family_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_details)
$$;

revoke all on function private.audit_row() from public;
revoke all on function private.audit_event(uuid, text, text, uuid, jsonb) from public;

create trigger families_audit after insert or update on public.families
  for each row execute function private.audit_row();
create trigger family_members_audit after insert or update or delete on public.family_members
  for each row execute function private.audit_row();
create trigger family_invitations_audit after insert or update on public.family_invitations
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invitations enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: yourself, plus people who share a family with you.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.family_members m
      where m.user_id = profiles.id
        and m.family_id in (select private.my_family_ids())
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and (default_family_id is null or private.is_family_member(default_family_id))
  );

-- families: members read; admins rename. Creation and deletion go through RPCs.
create policy families_select on public.families for select to authenticated
  using (id in (select private.my_family_ids()));
create policy families_update on public.families for update to authenticated
  using (private.is_family_admin(id))
  with check (private.is_family_admin(id));

-- family_members: members read everyone in their families. Admins may add
-- members without a login (dependants / not-yet-invited spouse). Admins edit
-- anyone's profile fields; members edit their own. Role/status/user_id are
-- not column-granted: they change only through the RPCs below.
create policy family_members_select on public.family_members for select to authenticated
  using (family_id in (select private.my_family_ids()));
create policy family_members_insert on public.family_members for insert to authenticated
  with check (
    private.is_family_admin(family_id)
    and user_id is null
    and role <> 'admin'
    and status = 'active'
  );
create policy family_members_update on public.family_members for update to authenticated
  using (private.is_family_admin(family_id) or user_id = (select auth.uid()))
  with check (private.is_family_admin(family_id) or user_id = (select auth.uid()));

-- invitations: admins see their family's invitations; invitees see pending
-- invitations addressed to their verified email.
create policy family_invitations_select on public.family_invitations for select to authenticated
  using (
    private.is_family_admin(family_id)
    or (
      status = 'pending'
      and email is not null
      and email = ((select auth.jwt()) ->> 'email')::extensions.citext
    )
  );

-- audit log: admins of the family.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (private.is_family_admin(family_id));

-- ---------------------------------------------------------------------------
-- Privileges (least privilege; RLS still applies on top)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.families, public.family_members,
  public.family_invitations, public.audit_logs from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, default_family_id, theme_preference) on public.profiles to authenticated;

grant select on public.families to authenticated;
grant update (name) on public.families to authenticated;

grant select on public.family_members to authenticated;
grant insert (family_id, display_name, relationship, role, color) on public.family_members to authenticated;
grant update (display_name, relationship, color) on public.family_members to authenticated;

grant select (id, family_id, email, role, member_id, status, invited_by, responded_by, responded_at, expires_at, created_at)
  on public.family_invitations to authenticated;

grant select on public.audit_logs to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Create a family; the caller becomes its admin. Default categories are seeded.
create or replace function public.create_family(
  p_name text,
  p_base_currency text default 'INR',
  p_member_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_family_id uuid;
  v_display_name text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(p_member_display_name), ''), p.display_name)
    into v_display_name
  from public.profiles p where p.id = v_uid;

  insert into public.families (name, base_currency, created_by)
  values (btrim(p_name), upper(coalesce(p_base_currency, 'INR')), v_uid)
  returning id into v_family_id;

  insert into public.family_members (family_id, user_id, display_name, relationship, role, joined_at)
  values (v_family_id, v_uid, coalesce(v_display_name, 'Me'), 'self', 'admin', now());

  perform private.seed_default_categories(v_family_id);

  update public.profiles
     set default_family_id = coalesce(default_family_id, v_family_id)
   where id = v_uid;

  return v_family_id;
end;
$$;

-- Create an invitation. Returns the plain token once.
create or replace function public.create_invitation(
  p_family_id uuid,
  p_email text default null,
  p_role public.family_role default 'member',
  p_member_id uuid default null,
  p_expires_in_days integer default 7
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_email extensions.citext := nullif(lower(btrim(p_email)), '')::extensions.citext;
  v_expires timestamptz := now() + make_interval(days => least(greatest(coalesce(p_expires_in_days, 7), 1), 30));
  v_id uuid;
begin
  if not private.is_family_admin(p_family_id) then
    raise exception 'Only family admins can invite members' using errcode = '42501';
  end if;

  if p_member_id is not null and not exists (
    select 1 from public.family_members m
    where m.id = p_member_id and m.family_id = p_family_id and m.user_id is null and m.status = 'active'
  ) then
    raise exception 'That member already has a login or does not exist' using errcode = '22023';
  end if;

  if v_email is not null and exists (
    select 1
    from public.family_members m
    join auth.users u on u.id = m.user_id
    where m.family_id = p_family_id and m.status = 'active' and lower(u.email) = lower(v_email::text)
  ) then
    raise exception 'This person is already a member of the family' using errcode = '23505';
  end if;

  -- Re-inviting the same email replaces the earlier pending invitation.
  if v_email is not null then
    update public.family_invitations i
       set status = 'revoked', responded_at = now(), responded_by = auth.uid()
     where i.family_id = p_family_id and i.email = v_email and i.status = 'pending';
  end if;

  insert into public.family_invitations (family_id, email, role, member_id, token_hash, invited_by, expires_at)
  values (p_family_id, v_email, p_role, p_member_id, extensions.digest(v_token, 'sha256'), auth.uid(), v_expires)
  returning id into v_id;

  return query select v_id, v_token, v_expires;
end;
$$;

-- Preview an invitation from a link (before accepting).
create or replace function public.get_invitation_by_token(p_token text)
returns table (
  invitation_id uuid,
  family_name text,
  invited_by_name text,
  role public.family_role,
  email text,
  expires_at timestamptz,
  status public.invitation_status,
  is_expired boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, f.name, p.display_name, i.role, i.email::text, i.expires_at, i.status, i.expires_at < now()
  from public.family_invitations i
  join public.families f on f.id = i.family_id
  left join public.profiles p on p.id = i.invited_by
  where i.token_hash = extensions.digest(p_token, 'sha256')
    and auth.uid() is not null
$$;

-- Shared acceptance logic.
create or replace function private.accept_invitation(p_invitation public.family_invitations)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_name text;
  v_existing public.family_members;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_invitation.status <> 'pending' then
    raise exception 'This invitation is no longer valid' using errcode = '22023';
  end if;
  if p_invitation.expires_at < now() then
    raise exception 'This invitation has expired' using errcode = '22023';
  end if;
  if p_invitation.email is not null and lower(p_invitation.email::text) <> v_email then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  select display_name into v_name from public.profiles where id = v_uid;

  select * into v_existing
  from public.family_members m
  where m.family_id = p_invitation.family_id and m.user_id = v_uid;

  if v_existing.id is not null then
    if v_existing.status = 'removed' then
      update public.family_members
         set status = 'active', role = p_invitation.role, joined_at = now()
       where id = v_existing.id;
    end if;
    -- An active member opening a link again is a no-op.
  elsif p_invitation.member_id is not null then
    update public.family_members
       set user_id = v_uid, role = p_invitation.role, joined_at = now(), status = 'active'
     where id = p_invitation.member_id and user_id is null;
    if not found then
      raise exception 'The member profile for this invitation was already claimed' using errcode = '22023';
    end if;
  else
    insert into public.family_members (family_id, user_id, display_name, role, joined_at)
    values (p_invitation.family_id, v_uid, coalesce(v_name, 'Member'), p_invitation.role, now());
  end if;

  update public.family_invitations
     set status = 'accepted', responded_by = v_uid, responded_at = now()
   where id = p_invitation.id;

  update public.profiles
     set default_family_id = coalesce(default_family_id, p_invitation.family_id)
   where id = v_uid;

  return p_invitation.family_id;
end;
$$;
revoke all on function private.accept_invitation(public.family_invitations) from public;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.family_invitations;
begin
  select * into v_inv
  from public.family_invitations
  where token_hash = extensions.digest(p_token, 'sha256')
  for update;

  if v_inv.id is null then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  return private.accept_invitation(v_inv);
end;
$$;

-- Accept or decline an invitation addressed to the caller's email (in-app list).
create or replace function public.respond_to_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.family_invitations;
begin
  select * into v_inv
  from public.family_invitations
  where id = p_invitation_id
    and email is not null
    and lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
  for update;

  if v_inv.id is null then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;

  if p_accept then
    return private.accept_invitation(v_inv);
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'This invitation is no longer pending' using errcode = '22023';
  end if;
  update public.family_invitations
     set status = 'declined', responded_by = auth.uid(), responded_at = now()
   where id = v_inv.id;
  return v_inv.family_id;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  select family_id into v_family from public.family_invitations where id = p_invitation_id;
  if v_family is null or not private.is_family_admin(v_family) then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  update public.family_invitations
     set status = 'revoked', responded_by = auth.uid(), responded_at = now()
   where id = p_invitation_id and status = 'pending';
end;
$$;

create or replace function public.set_member_role(p_member_id uuid, p_role public.family_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.family_members;
begin
  select * into v_member from public.family_members where id = p_member_id for update;
  if v_member.id is null or not private.is_family_admin(v_member.family_id) then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if p_role = 'admin' and v_member.user_id is null then
    raise exception 'Only members who have joined with a login can be admins' using errcode = '22023';
  end if;
  if v_member.role = 'admin' and p_role <> 'admin' and (
    select count(*) from public.family_members
    where family_id = v_member.family_id and role = 'admin' and status = 'active'
  ) <= 1 then
    raise exception 'A family needs at least one admin' using errcode = '22023';
  end if;
  update public.family_members set role = p_role where id = p_member_id;
end;
$$;

-- Remove a member (admin) or leave the family (self). History is preserved.
create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.family_members;
begin
  select * into v_member from public.family_members where id = p_member_id for update;
  if v_member.id is null
     or not (private.is_family_admin(v_member.family_id) or v_member.user_id = auth.uid()) then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if v_member.status = 'removed' then
    return;
  end if;
  if v_member.role = 'admin' and (
    select count(*) from public.family_members
    where family_id = v_member.family_id and role = 'admin' and status = 'active'
  ) <= 1 then
    raise exception 'Make someone else an admin before removing the last admin' using errcode = '22023';
  end if;

  update public.family_members set status = 'removed' where id = p_member_id;

  if v_member.user_id is not null then
    update public.profiles set default_family_id = null
     where id = v_member.user_id and default_family_id = v_member.family_id;
  end if;
end;
$$;

-- Permanently delete a family and all of its data. Admin only; the caller must
-- type the family name to confirm.
create or replace function public.delete_family(p_family_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not private.is_family_admin(p_family_id) then
    raise exception 'Only family admins can delete a family' using errcode = '42501';
  end if;
  select name into v_name from public.families where id = p_family_id;
  if v_name is distinct from btrim(p_confirm_name) then
    raise exception 'Family name does not match' using errcode = '22023';
  end if;
  delete from public.families where id = p_family_id;
end;
$$;

revoke all on function public.create_family(text, text, text) from public, anon;
revoke all on function public.create_invitation(uuid, text, public.family_role, uuid, integer) from public, anon;
revoke all on function public.get_invitation_by_token(text) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.respond_to_invitation(uuid, boolean) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.set_member_role(uuid, public.family_role) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
revoke all on function public.delete_family(uuid, text) from public, anon;

grant execute on function public.create_family(text, text, text) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.family_role, uuid, integer) to authenticated;
grant execute on function public.get_invitation_by_token(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.respond_to_invitation(uuid, boolean) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.set_member_role(uuid, public.family_role) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.delete_family(uuid, text) to authenticated;
