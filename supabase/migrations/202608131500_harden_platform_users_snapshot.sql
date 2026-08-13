-- Read-only platform directory for the explicitly authorized Volt administrator.
-- This function exposes no credentials, sessions, tokens or password material.
create or replace function public.beta_platform_users_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  caller_role text;
begin
  if caller is null
     or caller_email <> 'flanhenriquee@icloud.com'
     or coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    return jsonb_build_object('authorized', false);
  end if;

  select m.role
    into caller_role
    from public.beta_memberships m
    join public.beta_user_context c
      on c.user_id = m.user_id
     and c.organization_id = m.organization_id
   where m.user_id = caller
     and m.status = 'active'
   limit 1;

  if caller_role not in ('owner', 'admin') then
    return jsonb_build_object('authorized', false);
  end if;

  return jsonb_build_object(
    'authorized', true,
    'generated_at', clock_timestamp(),
    'total_users', (select count(*) from auth.users where deleted_at is null),
    'confirmed_users', (select count(*) from auth.users where deleted_at is null and confirmed_at is not null),
    'active_last_30_days', (select count(*) from auth.users where deleted_at is null and last_sign_in_at >= now() - interval '30 days'),
    'users', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'name', coalesce(
          nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
          nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
          nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
          split_part(u.email, '@', 1)
        ),
        'email', u.email,
        'created_at', u.created_at,
        'confirmed_at', u.confirmed_at,
        'last_sign_in_at', u.last_sign_in_at,
        'status', case when u.confirmed_at is null then 'pending_confirmation' else 'confirmed' end
      ) order by u.last_sign_in_at desc nulls last, u.created_at desc), '[]'::jsonb)
      from auth.users u
      where u.deleted_at is null
    )
  );
end;
$$;

revoke all on function public.beta_platform_users_snapshot() from public, anon;
grant execute on function public.beta_platform_users_snapshot() to authenticated;
