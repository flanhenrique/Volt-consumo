create index if not exists consumer_units_created_by_idx
  on public.consumer_units (created_by);

create index if not exists billing_cycles_unit_org_idx
  on public.billing_cycles (consumer_unit_id, organization_id);

create index if not exists unit_meter_readings_unit_org_idx
  on public.unit_meter_readings (consumer_unit_id, organization_id);
create index if not exists unit_meter_readings_cycle_org_idx
  on public.unit_meter_readings (billing_cycle_id, organization_id);
create index if not exists unit_meter_readings_created_by_idx
  on public.unit_meter_readings (created_by);

create index if not exists bills_unit_org_idx
  on public.bills (consumer_unit_id, organization_id);
create index if not exists bills_cycle_org_idx
  on public.bills (billing_cycle_id, organization_id);
create index if not exists bills_supersedes_org_idx
  on public.bills (supersedes_bill_id, organization_id);

create index if not exists bill_components_bill_org_idx
  on public.bill_components (bill_id, organization_id);

create index if not exists reconciliations_bill_org_idx
  on public.reconciliations (bill_id, organization_id);

create index if not exists regulatory_rules_supersedes_idx
  on public.regulatory_rules (supersedes_rule_id);

create index if not exists regulatory_profiles_unit_org_idx
  on public.regulatory_profiles (consumer_unit_id, organization_id);
create index if not exists regulatory_profiles_rule_idx
  on public.regulatory_profiles (regulatory_rule_id);
create index if not exists regulatory_profiles_bill_org_idx
  on public.regulatory_profiles (evidence_bill_id, organization_id);

create index if not exists rule_applications_rule_idx
  on public.rule_applications (regulatory_rule_id);
create index if not exists rule_applications_unit_org_idx
  on public.rule_applications (consumer_unit_id, organization_id);
create index if not exists rule_applications_cycle_org_idx
  on public.rule_applications (billing_cycle_id, organization_id);
create index if not exists rule_applications_bill_org_idx
  on public.rule_applications (bill_id, organization_id);
create index if not exists rule_applications_component_org_idx
  on public.rule_applications (bill_component_id, organization_id);
