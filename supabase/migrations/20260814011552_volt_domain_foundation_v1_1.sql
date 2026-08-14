alter table public.consumer_units
  drop constraint consumer_units_created_by_fkey;

alter table public.consumer_units
  alter column created_by drop not null;

alter table public.consumer_units
  add constraint consumer_units_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.unit_meter_readings
  drop constraint unit_meter_readings_cycle_org_fk;

alter table public.unit_meter_readings
  add constraint unit_meter_readings_cycle_org_fk
  foreign key (billing_cycle_id, organization_id)
  references public.billing_cycles(id, organization_id)
  on delete restrict;
