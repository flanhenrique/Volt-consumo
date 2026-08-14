alter table public.billing_cycles add column if not exists bill_arrival_state text not null default 'not_asked';
alter table public.billing_cycles add column if not exists bill_arrival_updated_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'billing_cycles_bill_arrival_state_check') then
    alter table public.billing_cycles add constraint billing_cycles_bill_arrival_state_check
      check (bill_arrival_state in ('not_asked','not_arrived','arrived'));
  end if;
end $$;

alter table public.bills add column if not exists received_at timestamptz;
alter table public.bills add column if not exists input_method text not null default 'user_total';
alter table public.bills add column if not exists extraction_status text not null default 'not_analyzed';
alter table public.bills add column if not exists extraction_metadata jsonb not null default '{}'::jsonb;
alter table public.bills add column if not exists raw_document_retained boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bills_input_method_check') then
    alter table public.bills add constraint bills_input_method_check
      check (input_method in ('user_total','manual_detail','image_ocr','imported_reference'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bills_extraction_status_check') then
    alter table public.bills add constraint bills_extraction_status_check
      check (extraction_status in ('not_analyzed','suggested','validated','partially_validated','rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bills_raw_document_default_check') then
    alter table public.bills add constraint bills_raw_document_default_check check (raw_document_retained = false);
  end if;
end $$;

alter table public.reconciliations add column if not exists policy jsonb not null default '{}'::jsonb;
alter table public.reconciliations add column if not exists next_action text;

create table if not exists public.bill_estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  consumer_unit_id uuid not null,
  billing_cycle_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  estimated_consumption numeric,
  estimated_total numeric,
  currency text not null default 'BRL',
  engine_version text not null,
  inputs jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  source_type text not null default 'volt_calculated',
  confidence text not null default 'probable',
  created_at timestamptz not null default now(),
  unique (billing_cycle_id, revision),
  unique (id, organization_id),
  foreign key (consumer_unit_id, organization_id) references public.consumer_units(id, organization_id) on delete restrict,
  foreign key (billing_cycle_id, organization_id) references public.billing_cycles(id, organization_id) on delete restrict,
  check (estimated_total is null or estimated_total >= 0),
  check (estimated_consumption is null or estimated_consumption >= 0),
  check (source_type in ('volt_measured','user_informed','bill_identified','volt_calculated','rule_predicted')),
  check (confidence in ('confirmed','probable','not_identified'))
);

create index if not exists bill_estimates_unit_org_idx on public.bill_estimates(consumer_unit_id, organization_id);
create index if not exists bill_estimates_cycle_org_idx on public.bill_estimates(billing_cycle_id, organization_id);
create index if not exists bill_estimates_cycle_revision_idx on public.bill_estimates(billing_cycle_id, revision desc);

alter table public.bill_estimates enable row level security;
alter table public.bill_estimates force row level security;
revoke all on public.bill_estimates from public, anon, authenticated;
grant select, insert on public.bill_estimates to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bill_estimates' and policyname='bill_estimates_select_org') then
    create policy bill_estimates_select_org on public.bill_estimates for select to authenticated
      using (volt_private.has_org_access(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bill_estimates' and policyname='bill_estimates_insert_org') then
    create policy bill_estimates_insert_org on public.bill_estimates for insert to authenticated
      with check (volt_private.can_write_org(organization_id));
  end if;
end $$;

create table if not exists public.bill_extractions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  consumer_unit_id uuid not null,
  billing_cycle_id uuid,
  bill_id uuid,
  extractor_version text not null,
  file_kind text not null default 'image',
  extracted_fields jsonb not null default '{}'::jsonb,
  field_confidence jsonb not null default '{}'::jsonb,
  validation_state text not null default 'suggested',
  validated_fields jsonb not null default '{}'::jsonb,
  source_type text not null default 'bill_identified',
  confidence text not null default 'probable',
  processed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (consumer_unit_id, organization_id) references public.consumer_units(id, organization_id) on delete restrict,
  foreign key (billing_cycle_id, organization_id) references public.billing_cycles(id, organization_id) on delete set null,
  foreign key (bill_id, organization_id) references public.bills(id, organization_id) on delete set null,
  check (file_kind in ('image','pdf_text','manual')),
  check (validation_state in ('suggested','partially_validated','validated','rejected')),
  check (source_type in ('bill_identified','user_informed')),
  check (confidence in ('confirmed','probable','not_identified'))
);

create index if not exists bill_extractions_unit_org_idx on public.bill_extractions(consumer_unit_id, organization_id);
create index if not exists bill_extractions_cycle_org_idx on public.bill_extractions(billing_cycle_id, organization_id);
create index if not exists bill_extractions_bill_org_idx on public.bill_extractions(bill_id, organization_id);

alter table public.bill_extractions enable row level security;
alter table public.bill_extractions force row level security;
revoke all on public.bill_extractions from public, anon, authenticated;
grant select, insert, update on public.bill_extractions to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bill_extractions' and policyname='bill_extractions_select_org') then
    create policy bill_extractions_select_org on public.bill_extractions for select to authenticated
      using (volt_private.has_org_access(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bill_extractions' and policyname='bill_extractions_insert_org') then
    create policy bill_extractions_insert_org on public.bill_extractions for insert to authenticated
      with check (volt_private.can_write_org(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bill_extractions' and policyname='bill_extractions_update_org') then
    create policy bill_extractions_update_org on public.bill_extractions for update to authenticated
      using (volt_private.can_write_org(organization_id))
      with check (volt_private.can_write_org(organization_id));
  end if;
end $$;
