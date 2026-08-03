begin;

create table if not exists public.beta_password_recovery_requests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'used', 'revoked')),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists beta_password_recovery_user_created_idx
on public.beta_password_recovery_requests (user_id, created_at desc);
alter table public.beta_password_recovery_requests enable row level security;
alter table public.beta_password_recovery_requests force row level security;
revoke all on public.beta_password_recovery_requests from public, anon, authenticated;

create or replace function public.beta_password_recovery_request(p_email text, p_request_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target_user uuid;
begin
  select u.id into target_user from auth.users u
  where lower(u.email) = lower(trim(p_email)) and u.deleted_at is null
  order by u.created_at limit 1;
  if target_user is null then return false; end if;
  update public.beta_password_recovery_requests set status = 'revoked'
  where user_id = target_user and status in ('pending', 'claimed');
  insert into public.beta_password_recovery_requests (id, user_id, expires_at)
  values (p_request_id, target_user, now() + interval '1 hour');
  return true;
end $$;

create or replace function public.beta_password_recovery_claim(p_request_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
  update public.beta_password_recovery_requests set status = 'claimed', claimed_at = now()
  where id = p_request_id and user_id = p_user_id and status = 'pending' and expires_at > now()
  returning id into claimed;
  return claimed is not null;
end $$;

create or replace function public.beta_password_recovery_release(p_request_id uuid, p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.beta_password_recovery_requests set status = 'pending', claimed_at = null
  where id = p_request_id and user_id = p_user_id and status = 'claimed' and expires_at > now()
$$;

create or replace function public.beta_password_recovery_finalize(p_request_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare finalized uuid;
begin
  update public.beta_password_recovery_requests set status = 'used', used_at = now()
  where id = p_request_id and user_id = p_user_id and status = 'claimed'
  returning id into finalized;
  if finalized is null then return false; end if;
  insert into public.auth_security_events (user_id, event_type, details) values
    (p_user_id, 'password_changed', jsonb_build_object('method', 'recovery', 'request_id', p_request_id)),
    (p_user_id, 'sessions_revoked', jsonb_build_object('reason', 'password_recovery', 'request_id', p_request_id));
  return true;
end $$;

revoke all on function public.beta_password_recovery_request(text, uuid),
  public.beta_password_recovery_claim(uuid, uuid),
  public.beta_password_recovery_release(uuid, uuid),
  public.beta_password_recovery_finalize(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.beta_password_recovery_request(text, uuid),
  public.beta_password_recovery_claim(uuid, uuid),
  public.beta_password_recovery_release(uuid, uuid),
  public.beta_password_recovery_finalize(uuid, uuid)
to service_role;

commit;
