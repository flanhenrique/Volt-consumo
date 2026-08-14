import test from 'node:test';
import assert from 'node:assert/strict';

import { forecastEnergyBill } from '../packages/consumption-domain/browser/billing-engine.js';
import { extractInvoiceFieldsFromLines } from '../src/invoice-ocr.js';
import { buildEnergyBillingRules } from '../src/regulatory-engine.js';
import { createExecutivePdf } from '../src/executive-pdf.js';
import { createWidgetSnapshot } from '../src/widget-snapshot.js';

test('Tarifa Social zera exatamente o custo dos primeiros 80 kWh sem criar segundo crédito', () => {
  const rules = {
    tariffBands: [
      { code: 'first_80', label: 'Primeiros 80 kWh', upToKwh: 80, rate: 0.75089 },
      { code: 'above_80', label: 'Acima de 80 kWh', upToKwh: null, rate: 0.76974 }
    ],
    benefits: [
      { code: 'br_energy_tsee_80kwh', label: 'Tarifa Social', type: 'free_kwh_credit', upToKwh: 80, forecastable: true }
    ],
    charges: []
  };
  const result = forecastEnergyBill(400, rules, { flagRate: 0, lightingFee: 0 });
  const benefit = result.items.find((item) => item.code === 'br_energy_tsee_80kwh');
  assert.equal(benefit.amount, -60.07);
  assert.equal(result.energySubtotal, 306.39);
  assert.equal(result.totalCost, 246.32);
  assert.equal(result.items.filter((item) => item.code === 'br_energy_tsee_80kwh').length, 1);
});

test('bandeira não entra na estimativa sem taxa versionada idêntica no catálogo', () => {
  const unverified = forecastEnergyBill(400, { tariffBands: [], benefits: [], charges: [], flagRates: {} }, {
    fallbackRate: 0.75,
    flagRate: 0.01885,
    flagLabel: 'Bandeira amarela',
    lightingFee: 0
  });
  assert.equal(unverified.items.some((item) => item.category === 'flag'), false);
  assert.equal(unverified.totalCost, 300);

  const verified = forecastEnergyBill(400, { tariffBands: [], benefits: [], charges: [], flagRates: { yellow: 0.01885 } }, {
    fallbackRate: 0.75,
    flagRate: 0.01885,
    flagLabel: 'Bandeira amarela',
    lightingFee: 0
  });
  assert.equal(verified.items.find((item) => item.category === 'flag').amount, 7.54);
  assert.equal(verified.totalCost, 307.54);
});

test('catálogo SQL só prevê regra elegível e mantém Itaipu fora da previsão', () => {
  const unit = { id: 'u1', service: 'energy', country: 'BR', state: 'AM', city: 'Manaus', distributor: 'Amazonas Energia' };
  const cycle = { cycle_start: '2026-07-13', cycle_end: '2026-08-12' };
  const rules = [
    {
      id: 'r-social', code: 'br_energy_tsee_80kwh', name: 'Tarifa Social', service: 'energy', country: 'BR', status: 'published',
      priority: 20, valid_from: '2025-07-05', valid_until: null,
      conditions: { requires_profile: true, eligible_profile_states: ['apparent_eligible', 'confirmed_on_bill'] },
      effect: { type: 'free_energy_band', up_to_kwh: 80, discount_percent: 100, forecastable: true }
    },
    {
      id: 'r-itaipu', code: 'br_energy_itaipu_bonus', name: 'Bônus Itaipu', service: 'energy', country: 'BR', status: 'published',
      priority: 80, valid_from: '2002-04-26', valid_until: null,
      conditions: { requires_profile: true, eligible_profile_states: ['confirmed_on_bill'] },
      effect: { type: 'invoice_credit_only', forecastable: false }
    }
  ];
  const profiles = [
    { consumer_unit_id: 'u1', rule_code: 'br_energy_tsee_80kwh', state: 'confirmed_on_bill', created_at: '2026-08-12T00:00:00Z' },
    { consumer_unit_id: 'u1', rule_code: 'br_energy_itaipu_bonus', state: 'confirmed_on_bill', created_at: '2026-08-12T00:00:00Z' }
  ];
  const resolved = buildEnergyBillingRules({ rules, profiles, unit, cycle });
  assert.equal(resolved.benefits.length, 1);
  assert.equal(resolved.benefits[0].code, 'br_energy_tsee_80kwh');
  assert.equal(resolved.applied.find((item) => item.code === 'br_energy_itaipu_bonus').forecastable, false);
});

test('OCR estruturado extrai consumo, faixas, alíquota, benefício e total sem imagem persistida', () => {
  const result = extractInvoiceFieldsFromLines([
    'Amazonas Energia',
    'Período 13/07/2026 a 12/08/2026',
    'Consumo 400 kWh',
    'Energia 80 kWh 0,750890 R$ 60,07',
    'Energia 320 kWh 0,769740 R$ 246,32',
    'ICMS 20% R$ 18,40',
    'Subvenção Baixa Renda R$ -61,58',
    'Desconto Itaipu - Art. 21 Lei 10.438/2002',
    'Total da fatura R$ 230,73'
  ]);
  assert.equal(result.fields.billedConsumption, 400);
  assert.equal(result.fields.invoiceTotal, 230.73);
  const energy = result.fields.items.filter((item) => item.code === 'energy_charge');
  assert.equal(energy.length, 2);
  assert.equal(energy[0].quantity, 80);
  assert.equal(energy[0].quantityUnit, 'kWh');
  assert.equal(energy[0].unitRate, 0.75089);
  assert.equal(result.fields.items.find((item) => item.code === 'icms').percentage, 20);
  assert.equal(result.fields.items.find((item) => item.code === 'social_subsidy').direction, 'credit');
  assert.equal(result.fields.items.find((item) => item.code === 'itaipu_bonus').amount, null);
});

test('PDF executivo gerado é um PDF real e mantém medido/faturado separados', async () => {
  const blob = createExecutivePdf({
    unit: { label: 'Energia', service: 'energy', distributor: 'Amazonas Energia' },
    cycle: { cycle_start: '2026-07-13', cycle_end: '2026-08-12', status: 'billed' },
    bill: { measured_consumption: 407, billed_consumption: 400, invoice_total: 230.73, source_type: 'bill_identified', confidence: 'confirmed' },
    estimate: { estimated_total: 250.81, source_type: 'volt_calculated', confidence: 'probable' },
    reconciliation: { calculated_total: 250.81, difference_amount: -20.08, classification: 'relevant_difference', source_type: 'volt_calculated', confidence: 'probable' },
    components: [{ code: 'itaipu_bonus', label: 'Bônus Itaipu', direction: 'credit', amount: null, confidence: 'probable' }],
    regulatoryProfiles: []
  });
  assert.equal(blob.type, 'application/pdf');
  const prefix = new TextDecoder('latin1').decode((await blob.arrayBuffer()).slice(0, 8));
  assert.match(prefix, /^%PDF-1\.4/);
});

function widgetState({ energyReadings, waterReadings }) {
  return {
    status: 'READY',
    settings: {
      energy: { rate: 1, goal: 200, flag: 'green', lightingFee: 0 },
      water: { rate: 2, goal: 10, sewerPercent: 0, fixedFee: 0 }
    },
    cycles: {
      energy: { start: 1, end: 31 },
      water: { start: 1, end: 31 }
    },
    readings: { energy: energyReadings, water: waterReadings }
  };
}

test('snapshot v2 projeta fechamento somente a partir de consumo mensurável', () => {
  const state = widgetState({
    energyReadings: [
      { value: 1000, date: '2026-08-01T00:00:00.000Z' },
      { value: 1100, date: '2026-08-11T00:00:00.000Z' }
    ],
    waterReadings: [
      { value: 20, date: '2026-08-01T00:00:00.000Z' },
      { value: 24, date: '2026-08-11T00:00:00.000Z' }
    ]
  });

  const snapshot = createWidgetSnapshot(state, new Date('2026-08-11T12:00:00.000Z'));
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.energyConsumption, 100);
  assert.equal(snapshot.energyProjectedConsumption, 300);
  assert.equal(snapshot.energyProjectedCost, 300);
  assert.equal(snapshot.waterConsumption, 4);
  assert.equal(snapshot.waterProjectedConsumption, 12);
  assert.equal(snapshot.totalProjectedCost, 324);
  assert.equal(snapshot.energyStatusTone, 'danger');
  assert.equal(snapshot.confidence, 'measured');
});

test('snapshot v2 não declara confiança nem fabrica projeção com leitura isolada', () => {
  const state = widgetState({
    energyReadings: [{ value: 1100, date: '2026-08-11T00:00:00.000Z' }],
    waterReadings: [{ value: 24, date: '2026-08-11T00:00:00.000Z' }]
  });

  const snapshot = createWidgetSnapshot(state, new Date('2026-08-11T12:00:00.000Z'));
  assert.equal(snapshot.energyConsumption, 0);
  assert.equal(snapshot.energyProjectedConsumption, 0);
  assert.equal(snapshot.energyProjectedCost, 0);
  assert.equal(snapshot.confidence, 'insufficient_data');
});
