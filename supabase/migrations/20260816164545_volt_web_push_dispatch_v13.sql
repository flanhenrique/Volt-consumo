create extension if not exists pg_net with schema extensions;
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

grant all on public.beta_notifications to service_role;
grant all on public.beta_notification_preferences to service_role;
grant all on public.beta_push_subscriptions to service_role;

create or replace function public.beta_verify_push_dispatch_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets s
    where s.name = 'volt_push_dispatch_token'
      and s.decrypted_secret = p_token
  );
$$;
revoke all on function public.beta_verify_push_dispatch_token(text) from public, anon, authenticated;
grant execute on function public.beta_verify_push_dispatch_token(text) to service_role;

create or replace function public.beta_push_dispatch_secrets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'subject', coalesce(max(s.decrypted_secret) filter (where s.name = 'volt_vapid_subject'), 'https://www.voltconsumo.com.br'),
    'public_key', max(s.decrypted_secret) filter (where s.name = 'volt_vapid_public_key'),
    'private_key', max(s.decrypted_secret) filter (where s.name = 'volt_vapid_private_key')
  )
  from vault.decrypted_secrets s
  where s.name in ('volt_vapid_subject', 'volt_vapid_public_key', 'volt_vapid_private_key');
$$;
revoke all on function public.beta_push_dispatch_secrets() from public, anon, authenticated;
grant execute on function public.beta_push_dispatch_secrets() to service_role;

create or replace function public.beta_dispatch_push_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_url text;
  dispatch_token text;
  should_push boolean := false;
begin
  select coalesce(p.notifications_enabled, false) and coalesce(p.push_enabled, false)
    into should_push
  from public.beta_notification_preferences p
  where p.user_id = new.recipient_user_id;

  if not coalesce(should_push, false) then return new; end if;

  select s.decrypted_secret into project_url
  from vault.decrypted_secrets s
  where s.name = 'volt_project_url'
  limit 1;

  select s.decrypted_secret into dispatch_token
  from vault.decrypted_secrets s
  where s.name = 'volt_push_dispatch_token'
  limit 1;

  if project_url is null or dispatch_token is null then return new; end if;

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/volt-web-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-volt-dispatch-token', dispatch_token
    ),
    body := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 3000
  );

  return new;
end;
$$;
revoke all on function public.beta_dispatch_push_notification() from public, anon, authenticated;

drop trigger if exists beta_notifications_push_dispatch on public.beta_notifications;
create trigger beta_notifications_push_dispatch
after insert on public.beta_notifications
for each row execute function public.beta_dispatch_push_notification();
