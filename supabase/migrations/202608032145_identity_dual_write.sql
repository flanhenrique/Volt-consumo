begin;

insert into public.beta_feature_flags (key, description, enabled, rollout_percentage)
values ('identity.new-auth', 'Novo fluxo de autenticação BFF', false, 0)
on conflict (key) do nothing;

create or replace function public.beta_provision_identity(
  p_user_id uuid,
  p_email text,
  p_display_name text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target_organization uuid;
  safe_email text := lower(trim(coalesce(p_email, '')));
  safe_name text := left(trim(coalesce(p_display_name, '')), 80);
begin
  if p_user_id is null then raise exception 'user_required'; end if;
  if safe_email = '' then safe_email := p_user_id::text || '@pending.volt'; end if;
  if safe_name = '' then safe_name := split_part(safe_email, '@', 1); end if;

  select m.organization_id into target_organization
  from public.beta_memberships m
  where m.user_id = p_user_id and m.status = 'active'
  order by m.created_at, m.id limit 1;

  if target_organization is null then
    insert into public.beta_organizations (name, owner_user_id)
    values ('Minha organização', p_user_id)
    returning id into target_organization;
    insert into public.beta_memberships (organization_id, user_id, email, display_name, role)
    values (target_organization, p_user_id, safe_email, safe_name, 'owner');
  else
    update public.beta_memberships
    set email = safe_email,
        display_name = case when display_name in ('Usuário migrado', '') then safe_name else display_name end,
        updated_at = now()
    where organization_id = target_organization and user_id = p_user_id;
  end if;

  insert into public.beta_user_context (user_id, organization_id)
  values (p_user_id, target_organization)
  on conflict (user_id) do update
  set organization_id = case
    when exists (
      select 1 from public.beta_memberships m
      where m.user_id = p_user_id and m.organization_id = public.beta_user_context.organization_id and m.status = 'active'
    ) then public.beta_user_context.organization_id
    else excluded.organization_id
  end,
  updated_at = now();
  return target_organization;
end $$;

create or replace function public.beta_auth_user_dual_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.beta_provision_identity(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name')
  );
  return new;
end $$;

drop trigger if exists beta_auth_user_dual_write on auth.users;
create trigger beta_auth_user_dual_write
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.beta_auth_user_dual_write();

revoke all on function public.beta_provision_identity(uuid, text, text), public.beta_auth_user_dual_write() from public, anon, authenticated;

do $$
declare legacy_user uuid; legacy_email text; legacy_name text;
begin
  for legacy_user, legacy_email, legacy_name in
    select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'display_name', u.raw_user_meta_data ->> 'name')
    from auth.users u
  loop
    perform public.beta_provision_identity(legacy_user, legacy_email, legacy_name);
  end loop;
end $$;

create or replace function public.beta_identity_migration_integrity()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'auth_users', (select count(*) from auth.users),
    'users_with_active_membership', (select count(distinct user_id) from public.beta_memberships where status = 'active'),
    'users_with_context', (select count(*) from public.beta_user_context),
    'missing_membership', (
      select count(*) from auth.users u where not exists (
        select 1 from public.beta_memberships m where m.user_id = u.id and m.status = 'active'
      )
    ),
    'missing_context', (
      select count(*) from auth.users u where not exists (
        select 1 from public.beta_user_context c where c.user_id = u.id
      )
    ),
    'invalid_context', (
      select count(*) from public.beta_user_context c where not exists (
        select 1 from public.beta_memberships m
        where m.user_id = c.user_id and m.organization_id = c.organization_id and m.status = 'active'
      )
    )
  )
$$;
revoke all on function public.beta_identity_migration_integrity() from public, anon, authenticated;

commit;
