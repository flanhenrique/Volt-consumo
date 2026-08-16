create table if not exists public.beta_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notifications_enabled boolean not null default true,
  push_enabled boolean not null default false,
  sounds_enabled boolean not null default true,
  reading_sound_enabled boolean not null default true,
  goal_sound_enabled boolean not null default true,
  warning_sound_enabled boolean not null default true,
  cycle_sound_enabled boolean not null default true,
  vibration_enabled boolean not null default true,
  admin_new_user_enabled boolean not null default true,
  admin_critical_enabled boolean not null default true,
  admin_activity_enabled boolean not null default false,
  admin_daily_digest_enabled boolean not null default true,
  daily_digest_hour smallint not null default 20 check (daily_digest_hour between 0 and 23),
  updated_at timestamptz not null default now()
);

create table if not exists public.beta_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  subject_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (length(trim(event_type)) > 0),
  title text not null check (length(trim(title)) > 0),
  body text not null default '',
  priority text not null default 'normal' check (priority in ('normal','high','critical')),
  data jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  push_attempted_at timestamptz,
  push_delivered_at timestamptz,
  push_error text
);

create index if not exists beta_notifications_recipient_created_idx
  on public.beta_notifications (recipient_user_id, created_at desc);
create index if not exists beta_notifications_unread_idx
  on public.beta_notifications (recipient_user_id, created_at desc)
  where read_at is null and dismissed_at is null;

create table if not exists public.beta_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  expiration_time bigint,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists beta_push_subscriptions_user_idx
  on public.beta_push_subscriptions (user_id, updated_at desc);

alter table public.beta_notification_preferences enable row level security;
alter table public.beta_notifications enable row level security;
alter table public.beta_push_subscriptions enable row level security;

revoke all on public.beta_notification_preferences from anon;
revoke all on public.beta_notifications from anon;
revoke all on public.beta_push_subscriptions from anon;
revoke all on public.beta_notification_preferences from authenticated;
revoke all on public.beta_notifications from authenticated;
revoke all on public.beta_push_subscriptions from authenticated;

grant select, insert, update on public.beta_notification_preferences to authenticated;
grant select on public.beta_notifications to authenticated;
grant update (read_at, dismissed_at) on public.beta_notifications to authenticated;
grant select, insert, update, delete on public.beta_push_subscriptions to authenticated;

drop policy if exists beta_notification_preferences_select_own on public.beta_notification_preferences;
create policy beta_notification_preferences_select_own
on public.beta_notification_preferences for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists beta_notification_preferences_insert_own on public.beta_notification_preferences;
create policy beta_notification_preferences_insert_own
on public.beta_notification_preferences for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists beta_notification_preferences_update_own on public.beta_notification_preferences;
create policy beta_notification_preferences_update_own
on public.beta_notification_preferences for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists beta_notifications_select_own on public.beta_notifications;
create policy beta_notifications_select_own
on public.beta_notifications for select to authenticated
using (
  (select auth.uid()) = recipient_user_id
  and (
    event_type not like 'admin.%'
    or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  )
);

drop policy if exists beta_notifications_update_own on public.beta_notifications;
create policy beta_notifications_update_own
on public.beta_notifications for update to authenticated
using (
  (select auth.uid()) = recipient_user_id
  and (
    event_type not like 'admin.%'
    or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  )
)
with check (
  (select auth.uid()) = recipient_user_id
  and (
    event_type not like 'admin.%'
    or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  )
);

drop policy if exists beta_push_subscriptions_select_own on public.beta_push_subscriptions;
create policy beta_push_subscriptions_select_own
on public.beta_push_subscriptions for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists beta_push_subscriptions_insert_own on public.beta_push_subscriptions;
create policy beta_push_subscriptions_insert_own
on public.beta_push_subscriptions for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists beta_push_subscriptions_update_own on public.beta_push_subscriptions;
create policy beta_push_subscriptions_update_own
on public.beta_push_subscriptions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists beta_push_subscriptions_delete_own on public.beta_push_subscriptions;
create policy beta_push_subscriptions_delete_own
on public.beta_push_subscriptions for delete to authenticated
using ((select auth.uid()) = user_id);

insert into public.beta_notification_preferences (user_id)
select u.id from auth.users u where u.deleted_at is null
on conflict (user_id) do nothing;

create or replace function public.beta_provision_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.beta_notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.beta_provision_notification_preferences() from public, anon, authenticated;

drop trigger if exists beta_notification_preferences_user_insert on auth.users;
create trigger beta_notification_preferences_user_insert
after insert on auth.users
for each row execute function public.beta_provision_notification_preferences();

create or replace function public.beta_register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time bigint default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  subscription_id uuid;
begin
  if caller is null then raise exception 'authentication_required'; end if;
  if length(coalesce(p_endpoint, '')) < 16 or length(coalesce(p_endpoint, '')) > 4096 then raise exception 'invalid_endpoint'; end if;
  if length(coalesce(p_p256dh, '')) < 16 or length(coalesce(p_auth, '')) < 8 then raise exception 'invalid_push_keys'; end if;

  insert into public.beta_push_subscriptions (
    user_id, endpoint, p256dh, auth, expiration_time, user_agent, updated_at, last_seen_at
  ) values (
    caller, p_endpoint, p_p256dh, p_auth, p_expiration_time, left(p_user_agent, 500), now(), now()
  )
  on conflict (endpoint) do update
  set user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      expiration_time = excluded.expiration_time,
      user_agent = excluded.user_agent,
      updated_at = now(),
      last_seen_at = now()
  returning id into subscription_id;

  return subscription_id;
end;
$$;
revoke all on function public.beta_register_push_subscription(text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.beta_register_push_subscription(text,text,text,bigint,text) to authenticated;

create or replace function public.beta_unregister_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  removed_count integer;
begin
  if caller is null then raise exception 'authentication_required'; end if;
  delete from public.beta_push_subscriptions
  where user_id = caller and endpoint = p_endpoint;
  get diagnostics removed_count = row_count;
  return removed_count > 0;
end;
$$;
revoke all on function public.beta_unregister_push_subscription(text) from public, anon, authenticated;
grant execute on function public.beta_unregister_push_subscription(text) to authenticated;

create or replace function public.beta_enqueue_new_user_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_user_id uuid;
  display_name text;
  admin_disabled boolean := false;
begin
  if new.confirmed_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.confirmed_at is not null then return new; end if;

  select u.id into admin_user_id
  from auth.users u
  where lower(u.email) = 'flanhenriquee@icloud.com'
    and u.deleted_at is null
  limit 1;

  if admin_user_id is null or admin_user_id = new.id then return new; end if;

  select (not p.notifications_enabled) or (not p.admin_new_user_enabled)
    into admin_disabled
  from public.beta_notification_preferences p
  where p.user_id = admin_user_id;

  if coalesce(admin_disabled, false) then return new; end if;

  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Novo usuário'
  );

  insert into public.beta_notifications (
    recipient_user_id, subject_user_id, event_type, title, body, priority, data, dedupe_key
  ) values (
    admin_user_id,
    new.id,
    'admin.user_confirmed',
    'Novo usuário confirmado',
    'Uma nova conta concluiu a confirmação de e-mail no VOLT.',
    'normal',
    jsonb_build_object(
      'name', display_name,
      'email', new.email,
      'confirmed_at', new.confirmed_at,
      'created_at', new.created_at
    ),
    'admin.user_confirmed:' || new.id::text
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;
revoke all on function public.beta_enqueue_new_user_notification() from public, anon, authenticated;

drop trigger if exists beta_notifications_user_confirmed on auth.users;
create trigger beta_notifications_user_confirmed
after insert or update of confirmed_at on auth.users
for each row execute function public.beta_enqueue_new_user_notification();

create or replace function public.beta_enqueue_admin_daily_digest()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_user_id uuid;
  local_now timestamp := timezone('America/Manaus', now());
  digest_enabled boolean := true;
  notifications_enabled boolean := true;
  digest_hour integer := 20;
  new_users integer := 0;
  confirmed_users integer := 0;
  active_users integer := 0;
  inserted_count integer := 0;
begin
  select u.id into admin_user_id
  from auth.users u
  where lower(u.email) = 'flanhenriquee@icloud.com'
    and u.deleted_at is null
  limit 1;
  if admin_user_id is null then return false; end if;

  select p.admin_daily_digest_enabled, p.notifications_enabled, p.daily_digest_hour
    into digest_enabled, notifications_enabled, digest_hour
  from public.beta_notification_preferences p
  where p.user_id = admin_user_id;

  if not coalesce(digest_enabled, true) or not coalesce(notifications_enabled, true) then return false; end if;
  if extract(hour from local_now)::integer <> coalesce(digest_hour, 20) then return false; end if;

  select count(*) into new_users
  from auth.users u
  where u.deleted_at is null
    and timezone('America/Manaus', u.created_at)::date = local_now::date;

  select count(*) into confirmed_users
  from auth.users u
  where u.deleted_at is null
    and u.confirmed_at is not null
    and timezone('America/Manaus', u.confirmed_at)::date = local_now::date;

  select count(*) into active_users
  from auth.users u
  where u.deleted_at is null
    and u.last_sign_in_at >= now() - interval '30 days';

  insert into public.beta_notifications (
    recipient_user_id, event_type, title, body, priority, data, dedupe_key
  ) values (
    admin_user_id,
    'admin.digest_daily',
    'Resumo diário do VOLT',
    format('%s novos cadastros · %s contas confirmadas hoje', new_users, confirmed_users),
    'normal',
    jsonb_build_object(
      'date', local_now::date,
      'new_users', new_users,
      'confirmed_users', confirmed_users,
      'active_last_30_days', active_users
    ),
    'admin.digest_daily:' || local_now::date::text
  )
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count > 0;
end;
$$;
revoke all on function public.beta_enqueue_admin_daily_digest() from public, anon, authenticated;

do $cron$
begin
  if not exists (select 1 from cron.job where jobname = 'volt-admin-daily-digest') then
    perform cron.schedule(
      'volt-admin-daily-digest',
      '5 * * * *',
      'select public.beta_enqueue_admin_daily_digest();'
    );
  end if;
end;
$cron$;

do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'beta_notifications'
     ) then
    alter publication supabase_realtime add table public.beta_notifications;
  end if;
end;
$realtime$;
