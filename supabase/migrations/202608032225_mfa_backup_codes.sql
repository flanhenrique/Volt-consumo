begin;

create table if not exists public.beta_mfa_backup_codes (
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, code_hash)
);
create table if not exists public.beta_mfa_backup_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed_count smallint not null default 0 check (failed_count between 0 and 5),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.beta_mfa_backup_codes enable row level security;
alter table public.beta_mfa_backup_codes force row level security;
alter table public.beta_mfa_backup_attempts enable row level security;
alter table public.beta_mfa_backup_attempts force row level security;
revoke all on public.beta_mfa_backup_codes, public.beta_mfa_backup_attempts from public, anon, authenticated;

create or replace function public.beta_mfa_backup_replace(p_user_id uuid, p_code_hashes text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null or coalesce(array_length(p_code_hashes, 1), 0) <> 10 then raise exception 'invalid_backup_codes'; end if;
  if exists (select 1 from unnest(p_code_hashes) h where h !~ '^[0-9a-f]{64}$') then raise exception 'invalid_backup_codes'; end if;
  delete from public.beta_mfa_backup_codes where user_id = p_user_id;
  insert into public.beta_mfa_backup_codes (user_id, code_hash) select p_user_id, h from unnest(p_code_hashes) h;
  insert into public.beta_mfa_backup_attempts (user_id, failed_count, blocked_until) values (p_user_id, 0, null)
  on conflict (user_id) do update set failed_count = 0, blocked_until = null, updated_at = now();
  insert into public.auth_security_events (user_id, event_type, details)
  values (p_user_id, 'mfa_changed', jsonb_build_object('action', 'backup_codes_generated', 'count', 10));
end $$;

create or replace function public.beta_mfa_backup_consume(p_user_id uuid, p_code_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare attempt public.beta_mfa_backup_attempts; matched_hash text; failures integer;
begin
  insert into public.beta_mfa_backup_attempts (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into attempt from public.beta_mfa_backup_attempts where user_id = p_user_id for update;
  if attempt.blocked_until is not null and attempt.blocked_until > now() then
    return jsonb_build_object('accepted', false, 'blocked', true, 'retry_after_seconds', greatest(1, ceil(extract(epoch from (attempt.blocked_until - now())))::integer));
  end if;
  select code_hash into matched_hash from public.beta_mfa_backup_codes
  where user_id = p_user_id and code_hash = p_code_hash and used_at is null for update;
  if matched_hash is not null then
    update public.beta_mfa_backup_codes set used_at = now() where user_id = p_user_id and code_hash = matched_hash;
    update public.beta_mfa_backup_attempts set failed_count = 0, blocked_until = null, updated_at = now() where user_id = p_user_id;
    insert into public.auth_security_events (user_id, event_type, details)
    values (p_user_id, 'mfa_changed', jsonb_build_object('action', 'backup_code_used', 'factor_reset_required', true));
    return jsonb_build_object('accepted', true, 'blocked', false, 'remaining_codes', (select count(*) from public.beta_mfa_backup_codes where user_id = p_user_id and used_at is null));
  end if;
  failures := least(5, attempt.failed_count + 1);
  update public.beta_mfa_backup_attempts set failed_count = failures,
    blocked_until = case when failures >= 5 then now() + interval '15 minutes' else null end,
    updated_at = now() where user_id = p_user_id;
  return jsonb_build_object('accepted', false, 'blocked', failures >= 5, 'attempts_remaining', greatest(0, 5 - failures), 'retry_after_seconds', case when failures >= 5 then 900 else 0 end);
end $$;

revoke all on function public.beta_mfa_backup_replace(uuid, text[]), public.beta_mfa_backup_consume(uuid, text) from public, anon, authenticated;
grant execute on function public.beta_mfa_backup_replace(uuid, text[]), public.beta_mfa_backup_consume(uuid, text) to service_role;

commit;
