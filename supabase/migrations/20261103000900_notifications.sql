-- =============================================================================
-- In-app notifications, notification preferences and Expo push tokens.
-- Notifications are created server-side (triggers, Edge Functions).
-- =============================================================================

create type public.notification_kind as enum (
  'emi_due', 'card_due', 'bill_due', 'budget_threshold', 'invitation', 'import_completed',
  'review_required', 'unusual_spending', 'member_joined', 'system'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null check (char_length(title) <= 120),
  body text check (body is null or char_length(body) <= 500),
  data jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

create table public.notification_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.notification_kind not null,
  push_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null unique check (char_length(expo_push_token) <= 200),
  platform text not null check (platform in ('ios', 'android', 'web')),
  device_name text check (device_name is null or char_length(device_name) <= 120),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_tokens enable row level security;

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

create policy notification_prefs_all on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy push_tokens_all on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.notifications, public.notification_preferences, public.push_tokens from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.notification_preferences, public.push_tokens to authenticated;

-- Notify a pending invitee who already has an account.
create or replace function private.notify_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_family text;
begin
  if new.email is null or new.status <> 'pending' then
    return new;
  end if;
  select id into v_user from auth.users where lower(email) = lower(new.email::text);
  if v_user is null then
    return new;
  end if;
  select name into v_family from public.families where id = new.family_id;
  insert into public.notifications (family_id, user_id, kind, title, body, data, dedupe_key)
  values (new.family_id, v_user, 'invitation', 'Family invitation',
          format('You have been invited to join %s.', v_family),
          jsonb_build_object('invitation_id', new.id), 'invitation:' || new.id)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.notify_invitation() from public;

create trigger family_invitations_notify after insert on public.family_invitations
  for each row execute function private.notify_invitation();

-- Tell existing members when someone joins.
create or replace function private.notify_member_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null or new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.user_id is not distinct from new.user_id and old.status = new.status then
    return new;
  end if;
  insert into public.notifications (family_id, user_id, kind, title, body, data, dedupe_key)
  select new.family_id, m.user_id, 'member_joined', 'New family member',
         format('%s joined your family.', new.display_name),
         jsonb_build_object('member_id', new.id), 'member_joined:' || new.id || ':' || m.user_id
  from public.family_members m
  where m.family_id = new.family_id and m.status = 'active' and m.user_id is not null and m.user_id <> new.user_id
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.notify_member_joined() from public;

create trigger family_members_notify after insert or update of user_id, status on public.family_members
  for each row execute function private.notify_member_joined();
