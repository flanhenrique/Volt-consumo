insert into public.regulatory_rules (
  code,name,service,jurisdiction,country,state,city,distributor,valid_from,valid_until,
  legal_basis,source_title,source_url,conditions,effect,priority,status,version
)
values
(
  'br_energy_tsee_80kwh',
  'Tarifa Social de Energia Elétrica — gratuidade até 80 kWh',
  'energy','federal','BR',null,null,null,date '2025-07-05',null,
  'Lei nº 12.212/2010, com redação dada pela Lei nº 15.235/2025; REN ANEEL nº 1.000/2021, arts. 176 a 179 e 200',
  'ANEEL — Tarifa Social',
  'https://www.gov.br/aneel/pt-br/assuntos/tarifas/tarifa-social',
  jsonb_build_object(
    'requires_profile', true,
    'eligible_profile_states', jsonb_build_array('apparent_eligible','confirmed_on_bill'),
    'service','energy',
    'scope','residential_low_income',
    'notes','Benefício vinculado aos critérios legais; o VOLT não confirma elegibilidade apenas por inferência.'
  ),
  jsonb_build_object(
    'type','free_energy_band',
    'up_to_kwh',80,
    'discount_percent',100,
    'forecastable',true,
    'component_code','social_tariff_80'
  ),
  20,'published',1
),
(
  'br_energy_itaipu_bonus',
  'Bônus de Comercialização de Energia de Itaipu',
  'energy','federal','BR',null,null,null,date '2002-04-26',null,
  'Art. 21 da Lei nº 10.438/2002; Decreto nº 11.027/2022; PRORET Submódulo 6.2',
  'ANEEL — PRORET Submódulo 6.2 / Bônus Itaipu',
  'https://www.gov.br/aneel/pt-br/centrais-de-conteudos/procedimentos-regulatorios/proret',
  jsonb_build_object(
    'requires_profile', true,
    'eligible_profile_states', jsonb_build_array('confirmed_on_bill'),
    'service','energy',
    'classes',jsonb_build_array('residential','rural'),
    'legal_consumption_reference_kwh',350,
    'notes','Crédito depende do resultado da Conta de Itaipu e de ato aplicável. Presença em uma fatura pode confirmar o lançamento, mas não autoriza prever valor para ciclos futuros.'
  ),
  jsonb_build_object(
    'type','invoice_credit_only',
    'forecastable',false,
    'component_code','itaipu_bonus'
  ),
  80,'published',1
)
on conflict (code,version) do nothing;
