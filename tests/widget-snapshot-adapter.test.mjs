import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWidgetSnapshot,
  makeService,
  parseCycleProgress,
  parseLocaleNumber,
  parseNativeRoute,
} from '../src/widget-snapshot-adapter.mjs';

test('builds energy and water snapshot', () => {
  const snapshot = buildWidgetSnapshot({
    energy: { value: 218, goal: 300, dailyAverage: 10, cycleTotalDays: 28 },
    water: { value: 8.4, goal: 12 },
    totalEstimatedCostBRL: 266.22,
  }, new Date('2026-08-15T20:00:00.123Z'));
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.energy.unit, 'kWh');
  assert.equal(snapshot.energy.projectedValue, 280);
  assert.equal(snapshot.water.unit, 'm³');
  assert.equal(snapshot.totalEstimatedCostBRL, 266.22);
});

test('rejects invalid service values', () => {
  assert.equal(makeService('energy', { value: -1 }), null);
  assert.equal(makeService('water', { value: 'x' }), null);
});

test('parses Brazilian locale values', () => {
  assert.equal(parseLocaleNumber('R$ 1.234,56'), 1234.56);
  assert.equal(parseLocaleNumber('218 kWh'), 218);
});

test('parses cycle progress', () => {
  assert.deepEqual(parseCycleProgress('12 de 29 dias'), { elapsed: 12, total: 29 });
});

test('parses reading chooser route', () => {
  assert.deepEqual(parseNativeRoute('reading'), { page: 'reading', service: null, readingStep: 'type' });
});

test('parses direct energy reading route', () => {
  assert.deepEqual(parseNativeRoute('reading/energy'), { page: 'reading', service: 'energy', readingStep: 'review' });
});

test('parses direct water consumption route', () => {
  assert.deepEqual(parseNativeRoute('consumption/water'), { page: 'consumption', service: 'water', readingStep: null });
});
