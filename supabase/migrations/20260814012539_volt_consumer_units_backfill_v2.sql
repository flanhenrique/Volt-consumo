alter table public.consumer_units add column if not exists cycle_start_day smallint check (cycle_start_day between 1 and 31);
alter table public.consumer_units add column if not exists cycle_end_day smallint check (cycle_end_day between 1 and 31);
alter table public.consumer_units add column if not exists cycle_preference_source text check (cycle_preference_source is null or cycle_preference_source in ('volt_measured','user_informed','bill_identified','volt_calculated','rule_predicted'));
alter table public.consumer_units add column if not exists cycle_preference_confidence text not null default 'not_identified' check (cycle_preference_confidence in ('confirmed','probable','not_identified'));
alter table public.consumer_units drop constraint if exists consumer_units_cycle_preference_pair_check;
alter table public.consumer_units add constraint consumer_units_cycle_preference_pair_check check ((cycle_start_day is null and cycle_end_day is null) or (cycle_start_day is not null and cycle_end_day is not null));

insert into public.consumer_units (organization_id, created_by, service, measurement_unit, label, country, state, city, distributor, status)
select c.organization_id, u.id, 'energy', 'kWh', 'Energia', coalesce(nullif(upper(trim(u.raw_user_meta_data #>> '{locality,country}')), ''), 'BR'), nullif(upper(trim(u.raw_user_meta_data #>> '{locality,state}')), ''), nullif(trim(u.raw_user_meta_data #>> '{locality,city}'), ''), nullif(trim(u.raw_user_meta_data #>> '{locality,energyProvider}'), ''), 'active'
from auth.users u
join public.beta_user_context c on c.user_id = u.id
where (exists (select 1 from public.beta_meter_readings r where r.user_id = u.id) or jsonb_typeof(u.raw_user_meta_data->'energy_billing_reference') = 'object')
  and not exists (select 1 from public.consumer_units cu where cu.organization_id = c.organization_id and cu.service = 'energy' and cu.created_by = u.id);

insert into public.consumer_units (organization_id, created_by, service, measurement_unit, label, country, state, city, distributor, status)
select c.organization_id, u.id, 'water', 'm3', 'Água', coalesce(nullif(upper(trim(u.raw_user_meta_data #>> '{locality,country}')), ''), 'BR'), nullif(upper(trim(u.raw_user_meta_data #>> '{locality,state}')), ''), nullif(trim(u.raw_user_meta_data #>> '{locality,city}'), ''), nullif(trim(u.raw_user_meta_data #>> '{locality,waterProvider}'), ''), 'active'
from auth.users u
join public.beta_user_context c on c.user_id = u.id
where exists (select 1 from public.beta_water_readings r where r.user_id = u.id)
  and not exists (select 1 from public.consumer_units cu where cu.organization_id = c.organization_id and cu.service = 'water' and cu.created_by = u.id);

update public.consumer_units cu
set cycle_start_day = (u.raw_user_meta_data #>> '{cycles,energy,start}')::smallint,
    cycle_end_day = (u.raw_user_meta_data #>> '{cycles,energy,end}')::smallint,
    cycle_preference_source = 'user_informed',
    cycle_preference_confidence = 'confirmed',
    updated_at = now()
from auth.users u
where cu.created_by = u.id and cu.service = 'energy'
  and jsonb_typeof(u.raw_user_meta_data #> '{cycles,energy}') = 'object'
  and (u.raw_user_meta_data #>> '{cycles,energy,start}') ~ '^[0-9]+$'
  and (u.raw_user_meta_data #>> '{cycles,energy,end}') ~ '^[0-9]+$';

update public.consumer_units cu
set cycle_start_day = (u.raw_user_meta_data #>> '{cycles,water,start}')::smallint,
    cycle_end_day = (u.raw_user_meta_data #>> '{cycles,water,end}')::smallint,
    cycle_preference_source = 'user_informed',
    cycle_preference_confidence = 'confirmed',
    updated_at = now()
from auth.users u
where cu.created_by = u.id and cu.service = 'water'
  and jsonb_typeof(u.raw_user_meta_data #> '{cycles,water}') = 'object'
  and (u.raw_user_meta_data #>> '{cycles,water,start}') ~ '^[0-9]+$'
  and (u.raw_user_meta_data #>> '{cycles,water,end}') ~ '^[0-9]+$';

insert into public.unit_meter_readings (organization_id, consumer_unit_id, value, measured_at, source_type, confidence, created_by)
select cu.organization_id, cu.id, r.value, r.measured_at, 'volt_measured', 'confirmed', r.user_id
from public.beta_meter_readings r
join public.beta_user_context c on c.user_id = r.user_id
join public.consumer_units cu on cu.organization_id = c.organization_id and cu.created_by = r.user_id and cu.service = 'energy'
on conflict (consumer_unit_id, value, measured_at) do nothing;

insert into public.unit_meter_readings (organization_id, consumer_unit_id, value, measured_at, source_type, confidence, created_by)
select cu.organization_id, cu.id, r.value, r.measured_at, 'volt_measured', 'confirmed', r.user_id
from public.beta_water_readings r
join public.beta_user_context c on c.user_id = r.user_id
join public.consumer_units cu on cu.organization_id = c.organization_id and cu.created_by = r.user_id and cu.service = 'water'
on conflict (consumer_unit_id, value, measured_at) do nothing;

insert into public.billing_cycles (organization_id, consumer_unit_id, cycle_start, cycle_end, status, source_type, confidence)
select cu.organization_id, cu.id,
       substring(u.raw_user_meta_data #>> '{energy_billing_reference,cycleStart}' from 1 for 10)::date,
       substring(u.raw_user_meta_data #>> '{energy_billing_reference,cycleEnd}' from 1 for 10)::date,
       'closed', 'user_informed', 'probable'
from auth.users u
join public.beta_user_context c on c.user_id = u.id
join public.consumer_units cu on cu.organization_id = c.organization_id and cu.created_by = u.id and cu.service = 'energy'
where (u.raw_user_meta_data #>> '{energy_billing_reference,cycleStart}') ~ '^\d{4}-\d{2}-\d{2}'
  and (u.raw_user_meta_data #>> '{energy_billing_reference,cycleEnd}') ~ '^\d{4}-\d{2}-\d{2}'
  and substring(u.raw_user_meta_data #>> '{energy_billing_reference,cycleStart}' from 1 for 10)::date <= substring(u.raw_user_meta_data #>> '{energy_billing_reference,cycleEnd}' from 1 for 10)::date
on conflict (consumer_unit_id, cycle_start, cycle_end) do nothing;

update public.unit_meter_readings r
set billing_cycle_id = bc.id
from public.billing_cycles bc
where r.organization_id = bc.organization_id
  and r.consumer_unit_id = bc.consumer_unit_id
  and r.billing_cycle_id is null
  and r.measured_at::date between bc.cycle_start and bc.cycle_end;
