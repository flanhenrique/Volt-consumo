import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWidgetSnapshot, makeService, parseCycleProgress, parseLocaleNumber, parseNativeRoute } from '../src/widget-snapshot-adapter.mjs';

test('parses pt-BR numbers', () => {
  assert.equal(parseLocaleNumber('R$ 1.234,56'), 1234.56);
  assert.equal(parseLocaleNumber('218 kWh'), 218);
  assert.equal(parseLocaleNumber('8,4 m³'), 8.4);
});

test('parses cycle progress', () => {
  assert.deepEqual(parseCycleProgress('24 de 31 dias'), { elapsed: 24, total: 31 });
});

test('calculates projection from daily average', () => {
  const service = makeService('energy', { value: 218, dailyAverage: 9.1, cycleTotalDays: 31 });
  assert.ok(Math.abs(service.projectedValue - 282.1) < 1e-9);
});

test('builds schema v1 with ISO date', () => {
  const now = new Date('2026-08-15T17:00:00Z');
  const snapshot = buildWidgetSnapshot({ energy: { value: 218 }, water: { value: 8.4 } }, now);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.generatedAt, '2026-08-15T17:00:00.000Z');
  assert.equal(snapshot.energy.unit, 'kWh');
  assert.equal(snapshot.water.unit, 'm³');
});

test('parses consumption widget deep links safely', () => {
  assert.deepEqual(parseNativeRoute('consumption/energy'), { page: 'consumption', service: 'energy', readingStep: null });
  assert.deepEqual(parseNativeRoute('/consumption/water/'), { page: 'consumption', service: 'water', readingStep: null });
});

test('parses reading widget routes', () => {
  assert.deepEqual(parseNativeRoute('reading'), { page: 'reading', service: null, readingStep: 'type' });
  assert.deepEqual(parseNativeRoute('reading/energy'), { page: 'reading', service: 'energy', readingStep: 'review' });
  assert.deepEqual(parseNativeRoute('reading/water'), { page: 'reading', service: 'water', readingStep: 'review' });
});

test('unknown deep link returns home', () => {
  assert.deepEqual(parseNativeRoute('unknown/path'), { page: 'home', service: null, readingStep: null });
});
