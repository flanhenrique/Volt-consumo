-- Leitura mínima de permissão usada pelo bootstrap determinístico.
-- Não altera tabelas, dados, sessões ou credenciais existentes.
create or replace function public.beta_user_permissions()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', public.beta_current_role(),
    'can_manage_users',
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'flanhenriquee@icloud.com'
      and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      and public.beta_current_role() in ('owner', 'admin')
  )
$$;

revoke all on function public.beta_user_permissions() from public, anon;
grant execute on function public.beta_user_permissions() to authenticated;
