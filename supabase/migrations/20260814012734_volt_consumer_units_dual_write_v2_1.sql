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
    case when jsonb_typeof(v_meta #> v_cycle_path) = 'object' and (v_meta #>> (v_cycle_path || 'start')) ~ '^[0-9]+$' then (v_meta #>> (v_cycle_path || 'start'))::smallint else null end,
    case when jsonb_typeof(v_meta #> v_cycle_path) = 'object' and (v_meta #>> (v_cycle_path || 'end')) ~ '^[0-9]+$' then (v_meta #>> (v_cycle_path || 'end'))::smallint else null end,
    case when jsonb_typeof(v_meta #> v_cycle_path) = 'object' then 'user_informed' else null end,
    case when jsonb_typeof(v_meta #> v_cycle_path) = 'object' then 'confirmed' else 'not_identified' end
  ) returning id into v_unit_id;
  return v_unit_id;
end;
$$;
revoke all on function volt_private.ensure_consumer_unit(uuid, uuid, text) from public, anon, authenticated;

create or replace function volt_private.sync_beta_reading_to_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service text;
  v_org uuid;
  v_user uuid;
  v_unit uuid;
begin
  v_service := case when tg_table_name = 'beta_water_readings' then 'water' else 'energy' end;
  v_org := coalesce(new.organization_id, old.organization_id);
  v_user := coalesce(new.user_id, old.user_id);

  if tg_op = 'DELETE' then
    select cu.id into v_unit from public.consumer_units cu
    where cu.organization_id = old.organization_id and cu.created_by = old.user_id and cu.service = v_service and cu.status = 'active'
    order by cu.created_at limit 1;
    if v_unit is not null then
      delete from public.unit_meter_readings r
      where r.consumer_unit_id = v_unit and r.value = old.value and r.measured_at = old.measured_at;
    end if;
    return old;
  end if;

  v_unit := volt_private.ensure_consumer_unit(v_org, v_user, v_service);

  if tg_op = 'UPDATE' then
    delete from public.unit_meter_readings r
    where r.consumer_unit_id = v_unit and r.value = old.value and r.measured_at = old.measured_at;
  end if;

  insert into public.unit_meter_readings (organization_id, consumer_unit_id, value, measured_at, source_type, confidence, created_by)
  values (v_org, v_unit, new.value, new.measured_at, 'volt_measured', 'confirmed', new.user_id)
  on conflict (consumer_unit_id, value, measured_at) do update
    set source_type = excluded.source_type, confidence = excluded.confidence, created_by = excluded.created_by;

  return new;
end;
$$;
revoke all on function volt_private.sync_beta_reading_to_unit() from public, anon, authenticated;

drop trigger if exists volt_sync_energy_reading on public.beta_meter_readings;
create trigger volt_sync_energy_reading
after insert or update or delete on public.beta_meter_readings
for each row execute function volt_private.sync_beta_reading_to_unit();

drop trigger if exists volt_sync_water_reading on public.beta_water_readings;
create trigger volt_sync_water_reading
after insert or update or delete on public.beta_water_readings
for each row execute function volt_private.sync_beta_reading_to_unit();

create or replace function volt_private.sync_user_metadata_to_consumer_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := new.raw_user_meta_data;
begin
  update public.consumer_units cu
  set country = coalesce(nullif(upper(trim(v_meta #>> '{locality,country}')), ''), cu.country),
      state = nullif(upper(trim(v_meta #>> '{locality,state}')), ''),
      city = nullif(trim(v_meta #>> '{locality,city}'), ''),
      distributor = nullif(trim(v_meta #>> '{locality,energyProvider}'), ''),
      cycle_start_day = case when jsonb_typeof(v_meta #> '{cycles,energy}') = 'object' and (v_meta #>> '{cycles,energy,start}') ~ '^[0-9]+$' then (v_meta #>> '{cycles,energy,start}')::smallint else null end,
      cycle_end_day = case when jsonb_typeof(v_meta #> '{cycles,energy}') = 'object' and (v_meta #>> '{cycles,energy,end}') ~ '^[0-9]+$' then (v_meta #>> '{cycles,energy,end}')::smallint else null end,
      cycle_preference_source = case when jsonb_typeof(v_meta #> '{cycles,energy}') = 'object' then 'user_informed' else null end,
      cycle_preference_confidence = case when jsonb_typeof(v_meta #> '{cycles,energy}') = 'object' then 'confirmed' else 'not_identified' end,
      updated_at = now()
  where cu.created_by = new.id and cu.service = 'energy' and cu.status = 'active';

  update public.consumer_units cu
  set country = coalesce(nullif(upper(trim(v_meta #>> '{locality,country}')), ''), cu.country),
      state = nullif(upper(trim(v_meta #>> '{locality,state}')), ''),
      city = nullif(trim(v_meta #>> '{locality,city}'), ''),
      distributor = nullif(trim(v_meta #>> '{locality,waterProvider}'), ''),
      cycle_start_day = case when jsonb_typeof(v_meta #> '{cycles,water}') = 'object' and (v_meta #>> '{cycles,water,start}') ~ '^[0-9]+$' then (v_meta #>> '{cycles,water,start}')::smallint else null end,
      cycle_end_day = case when jsonb_typeof(v_meta #> '{cycles,water}') = 'object' and (v_meta #>> '{cycles,water,end}') ~ '^[0-9]+$' then (v_meta #>> '{cycles,water,end}')::smallint else null end,
      cycle_preference_source = case when jsonb_typeof(v_meta #> '{cycles,water}') = 'object' then 'user_informed' else null end,
      cycle_preference_confidence = case when jsonb_typeof(v_meta #> '{cycles,water}') = 'object' then 'confirmed' else 'not_identified' end,
      updated_at = now()
  where cu.created_by = new.id and cu.service = 'water' and cu.status = 'active';
  return new;
end;
$$;
revoke all on function volt_private.sync_user_metadata_to_consumer_units() from public, anon, authenticated;

drop trigger if exists volt_sync_user_metadata on auth.users;
create trigger volt_sync_user_metadata
after update of raw_user_meta_data on auth.users
for each row when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
execute function volt_private.sync_user_metadata_to_consumer_units();
