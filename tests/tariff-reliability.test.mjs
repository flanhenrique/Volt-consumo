import test from "node:test";
import assert from "node:assert/strict";

import { findNationalEnergyRule } from "../data/national-energy-catalog.js";
import { forecastEnergyBill, analyzeEnergyInvoice } from "../packages/consumption-domain/browser/billing-engine.js";
import { resolveEnergyTariff } from "../src/tariff.js";

const AMAZONAS_BASE_RATE = 0.87571;
const YELLOW_FLAG_RATE = 0.01885;

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

test("Âmbar Amazonas mantém TUSD + TE homologados e não embute bandeira", () => {
  const rule = findNationalEnergyRule({ provider: "Âmbar Amazonas", date: new Date("2026-08-24T12:00:00Z") });
  assert.ok(rule);
  assert.equal(rule.ratePerKwh, AMAZONAS_BASE_RATE);
  assert.equal(rule.components.tusdPerMwh, 594.6);
  assert.equal(rule.components.tePerMwh, 281.11);
  assert.ok(rule.excludes.includes("bandeira tarifária"));
  assert.ok(rule.excludes.includes("CIP/COSIP"));
});

test("alias legado Amazonas Energia continua resolvendo para Âmbar", () => {
  const resolved = resolveEnergyTariff(
    { country: "BR", state: "AM", city: "Manaus", energyProvider: "Amazonas Energia" },
    { rate: 9.99 },
    new Date("2026-08-24T12:00:00Z")
  );
  assert.equal(resolved.resolution.automatic, true);
  assert.equal(resolved.resolution.rule.provider, "Âmbar Amazonas");
  assert.equal(resolved.settings.rate, AMAZONAS_BASE_RATE);
});

test("matriz 80–500 kWh mantém tarifa-base, bandeira e COSIP separadas", () => {
  const consumptions = [80, 81, 100, 200, 400, 407, 500];
  for (const consumption of consumptions) {
    const result = forecastEnergyBill(
      consumption,
      { tariffBands: [], benefits: [], charges: [], flagRates: { yellow: YELLOW_FLAG_RATE } },
      {
        fallbackRate: AMAZONAS_BASE_RATE,
        flagRate: YELLOW_FLAG_RATE,
        flagLabel: "Bandeira amarela",
        lightingFee: 21.33
      }
    );

    const expectedEnergy = roundMoney(consumption * AMAZONAS_BASE_RATE);
    const expectedFlag = roundMoney(consumption * YELLOW_FLAG_RATE);
    assert.equal(result.energySubtotal, expectedEnergy, `${consumption} kWh: energia`);
    assert.equal(result.flagGross, expectedFlag, `${consumption} kWh: bandeira`);
    assert.equal(result.items.find((item) => item.code === "lighting_fee")?.amount, 21.33, `${consumption} kWh: COSIP`);
    assert.equal(result.totalCost, roundMoney(expectedEnergy + expectedFlag + 21.33), `${consumption} kWh: total`);
  }
});

test("bandeira não é inventada sem regra regulatória confirmada", () => {
  const result = forecastEnergyBill(
    400,
    { tariffBands: [], benefits: [], charges: [], flagRates: {} },
    { fallbackRate: AMAZONAS_BASE_RATE, flagRate: YELLOW_FLAG_RATE, lightingFee: 0 }
  );
  assert.equal(result.flagGross, 0);
  assert.equal(result.items.some((item) => item.category === "flag"), false);
});

test("medido 407 kWh e faturado 400 kWh permanecem grandezas distintas", () => {
  const analysis = analyzeEnergyInvoice({
    measuredConsumptionKwh: 407,
    billedConsumptionKwh: 400,
    billingBasis: "average",
    invoiceTotal: 230.73,
    items: []
  });
  assert.equal(analysis.measuredConsumptionKwh, 407);
  assert.equal(analysis.billedConsumptionKwh, 400);
  assert.equal(analysis.meterDifferenceKwh, 7);
  assert.equal(analysis.reconciliationStatus, "pending_underbilled");
});

test("histórico CELESC resolve até a vigência conhecida e falha fechado após expirar", () => {
  const beforeExpiry = findNationalEnergyRule({ provider: "CELESC", date: new Date("2026-08-21T12:00:00Z") });
  const afterExpiry = findNationalEnergyRule({ provider: "CELESC", date: new Date("2026-08-22T12:00:00Z") });
  assert.ok(beforeExpiry);
  assert.equal(beforeExpiry.ratePerKwh, 0.69568);
  assert.equal(afterExpiry, null);
});
