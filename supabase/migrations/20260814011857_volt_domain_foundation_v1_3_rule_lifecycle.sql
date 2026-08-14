create or replace function volt_private.prevent_regulatory_rule_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'regulatory_rules cannot be deleted; create a new version or retire the existing version';
  end if;

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status')
       and (
         (old.status = 'draft' and new.status = 'published')
         or (old.status = 'published' and new.status in ('superseded', 'retired'))
         or (old.status = 'superseded' and new.status = 'retired')
       ) then
      return new;
    end if;

    raise exception 'regulatory rule content is immutable; create a new version instead';
  end if;

  return new;
end;
$$;

revoke all on function volt_private.prevent_regulatory_rule_mutation() from public, anon, authenticated;
