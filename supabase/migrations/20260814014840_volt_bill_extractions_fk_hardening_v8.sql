alter table public.bill_extractions drop constraint if exists bill_extractions_billing_cycle_id_organization_id_fkey;
alter table public.bill_extractions add constraint bill_extractions_billing_cycle_id_organization_id_fkey
  foreign key (billing_cycle_id, organization_id)
  references public.billing_cycles(id, organization_id)
  on delete restrict;

alter table public.bill_extractions drop constraint if exists bill_extractions_bill_id_organization_id_fkey;
alter table public.bill_extractions add constraint bill_extractions_bill_id_organization_id_fkey
  foreign key (bill_id, organization_id)
  references public.bills(id, organization_id)
  on delete restrict;
