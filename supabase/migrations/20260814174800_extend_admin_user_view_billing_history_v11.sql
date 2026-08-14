create or replace function public.beta_admin_user_view_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  caller uuid := auth.uid();
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  caller_role text;
  target_email text;
  target_name text;
  target_metadata jsonb;
  target_org_id uuid;
  target_org_name text;
  target_role text;
  energy_unit_id uuid;
begin
  if caller is null
     or caller_email <> 'flanhenriquee@icloud.com'
     or coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    return jsonb_build_object('authorized', false);
  end if;

  select m.role
    into caller_role
    from public.beta_memberships m
    join public.beta_user_context c
      on c.user_id = m.user_id
     and c.organization_id = m.organization_id
   where m.user_id = caller
     and m.status = 'active'
   limit 1;

  if caller_role not in ('owner', 'admin') then
    return jsonb_build_object('authorized', false);
  end if;

  select
    u.email,
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      split_part(u.email, '@', 1)
    ),
    coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into target_email, target_name, target_metadata
    from auth.users u
   where u.id = p_user_id
     and u.deleted_at is null;

  if target_email is null then
    return jsonb_build_object('authorized', true, 'found', false);
  end if;

  select c.organization_id, o.name, m.role
    into target_org_id, target_org_name, target_role
    from public.beta_user_context c
    join public.beta_organizations o on o.id = c.organization_id
    left join public.beta_memberships m
      on m.user_id = c.user_id
     and m.organization_id = c.organization_id
   where c.user_id = p_user_id
   limit 1;

  select cu.id
    into energy_unit_id
    from public.consumer_units cu
   where cu.created_by = p_user_id
     and cu.service = 'energy'
     and cu.status = 'active'
   order by cu.created_at desc
   limit 1;

  return jsonb_build_object(
    'authorized', true,
    'found', true,
    'read_only', true,
    'target', jsonb_build_object(
      'id', p_user_id,
      'email', target_email,
      'display_name', target_name,
      'cycles', coalesce(target_metadata -> 'cycles', '{}'::jsonb),
      'locality', coalesce(target_metadata -> 'locality', '{}'::jsonb),
      'energy_billing_reference', target_metadata -> 'energy_billing_reference'
    ),
    'organization', case when target_org_id is null then null else jsonb_build_object(
      'id', target_org_id,
      'name', target_org_name,
      'role', target_role
    ) end,
    'readings', jsonb_build_object(
      'energy', coalesce((
        select jsonb_agg(jsonb_build_object('value', r.value, 'date', r.measured_at) order by r.measured_at)
          from public.beta_meter_readings r
         where r.user_id = p_user_id
      ), '[]'::jsonb),
      'water', coalesce((
        select jsonb_agg(jsonb_build_object('value', r.value, 'date', r.measured_at) order by r.measured_at)
          from public.beta_water_readings r
         where r.user_id = p_user_id
      ), '[]'::jsonb)
    ),
    'settings', jsonb_build_object(
      'energy', (
        select jsonb_build_object('rate', s.rate, 'goal', s.goal, 'flag', s.flag, 'lighting_fee', s.lighting_fee)
          from public.beta_user_settings s
         where s.user_id = p_user_id
         order by s.updated_at desc
         limit 1
      ),
      'water', (
        select jsonb_build_object('rate', s.rate, 'goal', s.goal, 'sewer_percent', s.sewer_percent, 'fixed_fee', s.fixed_fee)
          from public.beta_water_settings s
         where s.user_id = p_user_id
         order by s.updated_at desc
         limit 1
      )
    ),
    'energy_unit', (
      select jsonb_build_object(
        'id', cu.id,
        'organization_id', cu.organization_id,
        'created_by', cu.created_by,
        'service', cu.service,
        'measurement_unit', cu.measurement_unit,
        'label', cu.label,
        'country', cu.country,
        'state', cu.state,
        'city', cu.city,
        'distributor', cu.distributor,
        'class', cu.class,
        'subclass', cu.subclass,
        'system_type', cu.system_type,
        'status', cu.status,
        'cycle_start_day', cu.cycle_start_day,
        'cycle_end_day', cu.cycle_end_day,
        'cycle_preference_source', cu.cycle_preference_source,
        'cycle_preference_confidence', cu.cycle_preference_confidence
      )
        from public.consumer_units cu
       where cu.id = energy_unit_id
    ),
    'billing_cycles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bc.id,
        'cycle_start', bc.cycle_start,
        'cycle_end', bc.cycle_end,
        'status', bc.status,
        'source_type', bc.source_type,
        'confidence', bc.confidence,
        'bill_arrival_state', bc.bill_arrival_state
      ) order by bc.cycle_start)
        from public.billing_cycles bc
       where bc.consumer_unit_id = energy_unit_id
    ), '[]'::jsonb),
    'latest_bill', (
      select jsonb_build_object(
        'id', b.id,
        'billing_cycle_id', b.billing_cycle_id,
        'issued_at', b.issued_at,
        'due_date', b.due_date,
        'billing_method', b.billing_method,
        'measured_consumption', b.measured_consumption,
        'billed_consumption', b.billed_consumption,
        'invoice_total', b.invoice_total,
        'currency', b.currency,
        'source_type', b.source_type,
        'confidence', b.confidence,
        'status', b.status,
        'extraction_metadata', b.extraction_metadata,
        'components', coalesce((
          select jsonb_agg(jsonb_build_object(
            'position', c.position,
            'category', c.category,
            'code', c.code,
            'label', c.label,
            'direction', c.direction,
            'quantity', c.quantity,
            'quantity_unit', c.quantity_unit,
            'unit_rate', c.unit_rate,
            'percentage', c.percentage,
            'amount', c.amount,
            'source_type', c.source_type,
            'confidence', c.confidence,
            'evidence_text', c.evidence_text
          ) order by c.position)
          from public.bill_components c
          where c.bill_id = b.id
        ), '[]'::jsonb)
      )
      from public.bills b
      where b.consumer_unit_id = energy_unit_id
        and b.status in ('received','reconciled')
      order by b.issued_at desc nulls last, b.created_at desc
      limit 1
    ),
    'monthly_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reference_month', h.reference_month,
        'consumption_kwh', h.consumption_kwh,
        'consumption_basis', h.consumption_basis,
        'source_type', h.source_type,
        'confidence', h.confidence
      ) order by h.reference_month)
        from public.monthly_consumption_history h
       where h.consumer_unit_id = energy_unit_id
    ), '[]'::jsonb),
    'regulatory_rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rr.id,
        'code', rr.code,
        'name', rr.name,
        'service', rr.service,
        'jurisdiction', rr.jurisdiction,
        'country', rr.country,
        'state', rr.state,
        'city', rr.city,
        'distributor', rr.distributor,
        'valid_from', rr.valid_from,
        'valid_until', rr.valid_until,
        'legal_basis', rr.legal_basis,
        'source_title', rr.source_title,
        'source_url', rr.source_url,
        'conditions', rr.conditions,
        'effect', rr.effect,
        'priority', rr.priority,
        'status', rr.status,
        'version', rr.version,
        'created_at', rr.created_at
      ) order by rr.priority, rr.created_at)
        from public.regulatory_rules rr
       where rr.status = 'published'
         and rr.service = 'energy'
    ), '[]'::jsonb),
    'regulatory_profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rp.id,
        'organization_id', rp.organization_id,
        'consumer_unit_id', rp.consumer_unit_id,
        'rule_code', rp.rule_code,
        'regulatory_rule_id', rp.regulatory_rule_id,
        'state', rp.state,
        'source_type', rp.source_type,
        'confidence', rp.confidence,
        'evidence_bill_id', rp.evidence_bill_id,
        'details', rp.details,
        'created_at', rp.created_at
      ) order by rp.created_at desc)
        from public.regulatory_profiles rp
       where rp.consumer_unit_id = energy_unit_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.beta_admin_user_view_snapshot(uuid) from public;
grant execute on function public.beta_admin_user_view_snapshot(uuid) to authenticated;

comment on function public.beta_admin_user_view_snapshot(uuid) is
  'Returns a sanitized read-only application snapshot for platform administration, including canonical billing cycles, latest bill components and monthly consumption history. Requires AAL2 platform-admin authorization.';
