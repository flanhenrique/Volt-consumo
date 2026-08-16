import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { METER_OCR_MODEL } from '../src/meter-ocr-model.js';
import { METER_OCR_COARSE_MODEL } from '../src/meter-ocr-coarse-model.js';

function int16Length(base64) {
  return Buffer.from(base64, 'base64').byteLength / 2;
}

test('modelos locais do medidor têm dimensões válidas', () => {
  assert.equal(METER_OCR_MODEL.featureCount, 48);
  for (const model of [METER_OCR_MODEL.direct, METER_OCR_MODEL.value, METER_OCR_MODEL.register]) {
    assert.equal(int16Length(model.coefficients), METER_OCR_MODEL.featureCount * 10);
    assert.equal(int16Length(model.intercepts), 10);
  }
  assert.equal(Buffer.from(METER_OCR_MODEL.displayTemplate, 'base64').byteLength, 96 * 32);
  assert.equal(int16Length(METER_OCR_COARSE_MODEL.coefficients), METER_OCR_COARSE_MODEL.featureCount * 10);
  assert.equal(int16Length(METER_OCR_COARSE_MODEL.intercepts), 10);
});

test('leitor do medidor permanece totalmente local', () => {
  const source = [
    fs.readFileSync(new URL('../src/meter-ocr.js', import.meta.url), 'utf8'),
    fs.readFileSync(new URL('../src/meter-ocr-classifier.js', import.meta.url), 'utf8'),
    fs.readFileSync(new URL('../src/meter-ocr-image.js', import.meta.url), 'utf8')
  ].join('\n');
  assert.equal(source.includes('TextDetector'), false);
  assert.equal(source.includes('fetch('), false);
  assert.equal(source.includes('functions.invoke'), false);
  assert.equal(source.includes('OPENAI'), false);
});

test('contrato de calibração preserva acertos e rejeições esperadas', () => {
  const contract = JSON.parse(fs.readFileSync(new URL('./fixtures/meter-local-expected.json', import.meta.url), 'utf8'));
  assert.deepEqual(contract.map(item => item.fixture), ['IMG_1649', 'IMG_1662', 'IMG_1862', 'IMG_1684', 'IMG_1683', 'IMG_1792']);
  assert.deepEqual(contract.slice(0, 3).map(item => item.expected.value), [28425, 28431, 28490]);
  assert.deepEqual(contract.slice(3).map(item => item.expected.reason), ['wrong-register', 'test-screen', 'reflection']);
});

test('harness de validação cega aplica política de zero falso aceite sem upload', () => {
  const harness = fs.readFileSync(new URL('../tools/ocr-blind-validation.html', import.meta.url), 'utf8');
  assert.match(harness, /import \{ analyzeMeterImage \} from "\.\.\/src\/meter-ocr\.js"/);
  assert.match(harness, /zero-false-accept/);
  assert.match(harness, /FALHA CRÍTICA/);
  assert.match(harness, /false-accept-wrong-reading/);
  assert.match(harness, /false-accept-on-rejection-case/);
  assert.equal(harness.includes('fetch('), false);
  assert.equal(harness.includes('XMLHttpRequest'), false);
});
