with refs as (
  select
    u.id as user_id,
    u.raw_user_meta_data->'energy_billing_reference' as ref,
    cu.id as consumer_unit_id,
    cu.organization_id,
    (u.raw_user_meta_data->'energy_billing_reference'->>'cycleStart')::timestamptz::date as cycle_start,
    (u.raw_user_meta_data->'energy_billing_reference'->>'cycleEnd')::timestamptz::date as cycle_end
  from auth.users u
  join public.consumer_units cu on cu.created_by=u.id and cu.service='energy' and cu.status='active'
  where jsonb_typeof(u.raw_user_meta_data->'energy_billing_reference')='object'
), inserted_cycles as (
  insert into public.billing_cycles (
    organization_id,consumer_unit_id,cycle_start,cycle_end,status,source_type,confidence,bill_arrival_state,bill_arrival_updated_at
  )
  select organization_id,consumer_unit_id,cycle_start,cycle_end,'billed','user_informed','confirmed','arrived',now()
  from refs
  where cycle_start is not null and cycle_end is not null
  on conflict (consumer_unit_id,cycle_start,cycle_end) do update
    set status='billed', bill_arrival_state='arrived', bill_arrival_updated_at=now(), updated_at=now()
  returning id
), bill_source as (
  select r.*,bc.id as billing_cycle_id
  from refs r
  join public.billing_cycles bc
    on bc.consumer_unit_id=r.consumer_unit_id and bc.cycle_start=r.cycle_start and bc.cycle_end=r.cycle_end
)
insert into public.bills (
  organization_id,consumer_unit_id,billing_cycle_id,revision,billing_method,
  measured_consumption,billed_consumption,invoice_total,currency,source_type,confidence,status,
  received_at,input_method,extraction_status,extraction_metadata,raw_document_retained
)
select
  organization_id,consumer_unit_id,billing_cycle_id,1,
  case when coalesce(ref->>'billingBasis','')='average' then 'average' else coalesce(nullif(ref->>'billingBasis',''),'not_identified') end,
  nullif(ref->>'measuredConsumptionKwh','')::numeric,
  nullif(ref->>'billedConsumptionKwh','')::numeric,
  nullif(ref->>'invoiceTotal','')::numeric,
  'BRL','bill_identified','confirmed','received',now(),'imported_reference','partially_validated',
  jsonb_build_object('legacy_reference',true,'migrated_at',now()),false
from bill_source
on conflict (billing_cycle_id,revision) do update
set measured_consumption=excluded.measured_consumption,
    billed_consumption=excluded.billed_consumption,
    invoice_total=excluded.invoice_total,
    billing_method=excluded.billing_method,
    received_at=coalesce(public.bills.received_at,excluded.received_at),
    input_method='imported_reference',
    extraction_status='partially_validated',
    extraction_metadata=public.bills.extraction_metadata || excluded.extraction_metadata,
    updated_at=now();

with bill_refs as (
  select b.id as bill_id,b.organization_id,u.raw_user_meta_data->'energy_billing_reference' as ref
  from auth.users u
  join public.consumer_units cu on cu.created_by=u.id and cu.service='energy' and cu.status='active'
  join public.billing_cycles bc on bc.consumer_unit_id=cu.id
    and bc.cycle_start=(u.raw_user_meta_data->'energy_billing_reference'->>'cycleStart')::timestamptz::date
    and bc.cycle_end=(u.raw_user_meta_data->'energy_billing_reference'->>'cycleEnd')::timestamptz::date
  join public.bills b on b.billing_cycle_id=bc.id and b.revision=1
  where jsonb_typeof(u.raw_user_meta_data->'energy_billing_reference')='object'
), items as (
  select br.bill_id,br.organization_id,e.value as item,e.ordinality::int as position
  from bill_refs br
  cross join lateral jsonb_array_elements(coalesce(br.ref->'items','[]'::jsonb)) with ordinality e(value,ordinality)
)
insert into public.bill_components (
  organization_id,bill_id,position,category,code,label,direction,quantity,quantity_unit,unit_rate,amount,source_type,confidence,evidence_text
)
select
  organization_id,bill_id,position,
  coalesce(nullif(item->>'category',''),'other'),
  coalesce(nullif(item->>'code',''),'item_'||position),
  coalesce(nullif(item->>'label',''),'Item '||position),
  case
    when item->>'category' in ('benefit','credit') then 'credit'
    when nullif(item->>'amount','')::numeric < 0 then 'credit'
    else 'charge'
  end,
  nullif(item->>'quantityKwh','')::numeric,
  case when item ? 'quantityKwh' then 'kWh' else null end,
  nullif(item->>'unitRate','')::numeric,
  abs(nullif(item->>'amount','')::numeric),
  'bill_identified',
  case when item->>'amount' is null or item->>'amount'='' or item->>'amountStatus'='not_confirmed' then 'probable' else 'confirmed' end,
  coalesce(item->>'label',item->>'code')
from items i
where not exists (
  select 1 from public.bill_components bc where bc.bill_id=i.bill_id and bc.code=coalesce(nullif(i.item->>'code',''),'item_'||i.position)
);

with signed as (
  select b.id as bill_id,b.organization_id,b.measured_consumption,b.billed_consumption,b.invoice_total,
    coalesce(sum(case when c.direction='credit' then -coalesce(c.amount,0) when c.direction='charge' then coalesce(c.amount,0) else 0 end),0)::numeric as explained_total,
    count(*) filter (where c.amount is null)::int as missing_amounts
  from public.bills b
  join public.bill_components c on c.bill_id=b.id
  where b.input_method='imported_reference'
  group by b.id,b.organization_id,b.measured_consumption,b.billed_consumption,b.invoice_total
)
insert into public.reconciliations (
  organization_id,bill_id,calculated_total,invoice_total,difference_amount,difference_percent,
  measured_minus_billed,classification,status,engine_version,diagnostics,policy,next_action,source_type,confidence
)
select
  organization_id,bill_id,explained_total,invoice_total,
  round(invoice_total-explained_total,2),
  case when invoice_total=0 then null else round(abs(invoice_total-explained_total)/abs(invoice_total)*100,4) end,
  case when measured_consumption is null or billed_consumption is null then null else measured_consumption-billed_consumption end,
  case
    when abs(invoice_total-explained_total) <= 1 then 'matching'
    when abs(invoice_total-explained_total) <= 5 then 'small_difference'
    else 'relevant_difference'
  end,
  case when missing_amounts=0 and abs(invoice_total-explained_total)<=1 then 'reconciled' else 'partially_reconciled' end,
  'reconciliation-v1',
  jsonb_build_object('missing_component_amounts',missing_amounts,'origin','legacy_billing_reference'),
  jsonb_build_object('matching_amount_brl',1,'small_difference_amount_brl',5,'small_difference_percent',3),
  case when missing_amounts>0 then 'Identificar valores ainda não confirmados na fatura.' else 'Revisar componentes que explicam a diferença.' end,
  'volt_calculated','probable'
from signed
where invoice_total is not null
on conflict (bill_id) do update set
  calculated_total=excluded.calculated_total,
  invoice_total=excluded.invoice_total,
  difference_amount=excluded.difference_amount,
  difference_percent=excluded.difference_percent,
  measured_minus_billed=excluded.measured_minus_billed,
  classification=excluded.classification,
  status=excluded.status,
  engine_version=excluded.engine_version,
  diagnostics=excluded.diagnostics,
  policy=excluded.policy,
  next_action=excluded.next_action,
  updated_at=now();

with matched as (
  select b.id bill_id,b.organization_id,b.consumer_unit_id,
         t.id tsee_rule,i.id itaipu_rule,
         (select bc.id from public.bill_components bc where bc.bill_id=b.id and bc.code='social_subsidy' limit 1) social_component,
         (select bc.id from public.bill_components bc where bc.bill_id=b.id and bc.code like 'itaipu%' limit 1) itaipu_component
  from public.bills b
  join public.regulatory_rules t on t.code='br_energy_tsee_80kwh' and t.version=1
  join public.regulatory_rules i on i.code='br_energy_itaipu_bonus' and i.version=1
  where b.input_method='imported_reference'
)
insert into public.regulatory_profiles (organization_id,consumer_unit_id,rule_code,regulatory_rule_id,state,source_type,confidence,evidence_bill_id,details)
select organization_id,consumer_unit_id,'br_energy_tsee_80kwh',tsee_rule,'confirmed_on_bill','bill_identified','confirmed',bill_id,jsonb_build_object('evidence_component_id',social_component)
from matched where social_component is not null
and not exists (select 1 from public.regulatory_profiles rp where rp.consumer_unit_id=matched.consumer_unit_id and rp.rule_code='br_energy_tsee_80kwh' and rp.evidence_bill_id=matched.bill_id)
union all
select organization_id,consumer_unit_id,'br_energy_itaipu_bonus',itaipu_rule,'confirmed_on_bill','bill_identified','confirmed',bill_id,jsonb_build_object('evidence_component_id',itaipu_component,'amount_confirmed',false)
from matched where itaipu_component is not null
and not exists (select 1 from public.regulatory_profiles rp where rp.consumer_unit_id=matched.consumer_unit_id and rp.rule_code='br_energy_itaipu_bonus' and rp.evidence_bill_id=matched.bill_id);

with matched as (
  select b.id bill_id,b.organization_id,b.consumer_unit_id,b.billing_cycle_id,
         t.id tsee_rule,i.id itaipu_rule,
         (select bc.id from public.bill_components bc where bc.bill_id=b.id and bc.code='social_subsidy' limit 1) social_component,
         (select bc.id from public.bill_components bc where bc.bill_id=b.id and bc.code like 'itaipu%' limit 1) itaipu_component
  from public.bills b
  join public.regulatory_rules t on t.code='br_energy_tsee_80kwh' and t.version=1
  join public.regulatory_rules i on i.code='br_energy_itaipu_bonus' and i.version=1
  where b.input_method='imported_reference'
)
insert into public.rule_applications (organization_id,regulatory_rule_id,consumer_unit_id,billing_cycle_id,bill_id,bill_component_id,engine_stage,outcome,effect_amount,source_type,confidence,explanation)
select organization_id,tsee_rule,consumer_unit_id,billing_cycle_id,bill_id,social_component,'billing','confirmed',
       (select case when bc.direction='credit' then -bc.amount else bc.amount end from public.bill_components bc where bc.id=social_component),
       'bill_identified','confirmed','Benefício reconhecido pela linha da fatura; nenhum segundo desconto é criado pelo motor.'
from matched where social_component is not null
and not exists (select 1 from public.rule_applications ra where ra.bill_id=matched.bill_id and ra.regulatory_rule_id=matched.tsee_rule and ra.bill_component_id=matched.social_component)
union all
select organization_id,itaipu_rule,consumer_unit_id,billing_cycle_id,bill_id,itaipu_component,'billing','possible',null,
       'bill_identified','probable','Crédito aparece na referência da fatura, mas o valor não foi confirmado; não entra em previsão nem subtotal.'
from matched where itaipu_component is not null
and not exists (select 1 from public.rule_applications ra where ra.bill_id=matched.bill_id and ra.regulatory_rule_id=matched.itaipu_rule and ra.bill_component_id=matched.itaipu_component);
