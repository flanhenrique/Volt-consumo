-- Fix first-reading failures when a canonical consumer unit does not yet exist.
-- PostgreSQL resolves `text[] || text` as array concatenation and attempts to
-- parse the scalar (`start`/`end`) as an array literal. array_append keeps the
-- JSON path type explicit and avoids SQLSTATE 22P02.
create or replace function volt_private.ensure_consumer_unit(p_organization_id uuid, p_user_id uuid, p_service text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit_id uuid;
  v_meta jsonb;
  v_measurement text;
  v_label text;
  v_provider_key text;
  v_cycle_path text[];
begin
  if p_service not in ('energy','water') then raise exception 'invalid_service'; end if;
  select cu.id into v_unit_id
  from public.consumer_units cu
  where cu.organization_id = p_organization_id and cu.created_by = p_user_id and cu.service = p_service and cu.status = 'active'
  order by cu.created_at
  limit 1;
  if v_unit_id is not null then return v_unit_id; end if;

  select u.raw_user_meta_data into v_meta from auth.users u where u.id = p_user_id;
  v_measurement := case when p_service = 'water' then 'm3' else 'kWh' end;
  v_label := case when p_service = 'water' then 'Água' else 'Energia' end;
  v_provider_key := case when p_service = 'water' then 'waterProvider' else 'energyProvider' end;
  v_cycle_path := case when p_service = 'water' then array['cycles','water'] else array['cycles','energy'] end;

  insert into public.consumer_units (
    organization_id, created_by, service, measurement_unit, label, country, state, city, distributor, status,
    cycle_start_day, cycle_end_day, cycle_preference_source, cycle_preference_confidence
  ) values (
    p_organization_id, p_user_id, p_service, v_measurement, v_label,
    coalesce(nullif(upper(trim(v_meta #>> '{locality,country}')), ''), 'BR'),
    nullif(upper(trim(v_meta #>> '{locality,state}')), ''),
    nullif(trim(v_meta #>> '{locality,city}'), ''),
    nullif(trim(v_meta #>> array['locality', v_provider_key]), ''),
    'active',
    case
      when jsonb_typeof(v_meta #> v_cycle_path) = 'object'
        and (v_meta #>> array_append(v_cycle_path, 'start')) ~ '^[0-9]+$'
      then (v_meta #>> array_append(v_cycle_path, 'start'))::smallint
      else null
    end,
    case
      when jsonb_typeof(v_meta #> v_cycle_path) = 'object'
        and (v_meta #>> array_append(v_cycle_path, 'end')) ~ '^[0-9]+$'
      then (v_meta #>> array_append(v_cycle_path, 'end'))::smallint
      else null
    end,
    case when jsonb_typeof(v_meta #> v_cycle_path) = 'object' then 'user_informed' else null end,
    case when jsonb_typeof(v_meta #> v_cycle_path) = 'object' then 'confirmed' else 'not_identified' end
  ) returning id into v_unit_id;
  return v_unit_id;
end;
$$;

revoke all on function volt_private.ensure_consumer_unit(uuid, uuid, text) from public, anon, authenticated;

-- Migration-time regression assertion for both service paths.
do $$
declare
  v_meta jsonb := '{"cycles":{"energy":{"start":13,"end":12},"water":{"start":7,"end":6}}}'::jsonb;
begin
  if v_meta #>> array_append(array['cycles','energy']::text[], 'start') <> '13'
    or v_meta #>> array_append(array['cycles','energy']::text[], 'end') <> '12'
    or v_meta #>> array_append(array['cycles','water']::text[], 'start') <> '7'
    or v_meta #>> array_append(array['cycles','water']::text[], 'end') <> '6'
  then
    raise exception 'consumer_unit_cycle_path_regression';
  end if;
end;
$$;
