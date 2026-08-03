begin;

select public.beta_identity_migration_integrity() as before_rollback;

drop trigger beta_auth_user_dual_write on auth.users;

select not exists (
  select 1 from pg_trigger
  where tgname = 'beta_auth_user_dual_write' and not tgisinternal
) as trigger_removed_inside_rehearsal;

rollback;

select exists (
  select 1 from pg_trigger
  where tgname = 'beta_auth_user_dual_write' and not tgisinternal
) as trigger_restored,
public.beta_identity_migration_integrity() as after_rollback;
