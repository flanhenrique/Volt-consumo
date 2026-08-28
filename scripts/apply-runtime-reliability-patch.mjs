import fs from 'node:fs';
import path from 'node:path';

const RELEASE = '20260824.1';
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(root, p), s, 'utf8');
const replaceRequired = (source, before, after, label) => {
  if (!source.includes(before)) throw new Error(`Patch target not found: ${label}`);
  return source.replace(before, after);
};

// 1) Atomic version synchronization for mutable runtime imports/assets.
for (const dir of ['app.js', 'src', 'packages', 'index.html', 'bootstrap.js', 'sw.js', 'tests', 'styles', 'config.js']) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) continue;
  const files = fs.statSync(full).isDirectory()
    ? walk(full).filter((p) => /\.(?:js|mjs|html|css|py)$/.test(p))
    : [full];
  for (const file of files) {
    let source = fs.readFileSync(file, 'utf8');
    const next = source
      .replaceAll('?v=20260813.7', `?v=${RELEASE}`)
      .replaceAll('?v=20260815.10', `?v=${RELEASE}`)
      .replaceAll('?v=20260817.2', `?v=${RELEASE}`);
    if (next !== source) fs.writeFileSync(file, next, 'utf8');
  }
}

let q = read('tests/quality_gate.py');
q = q.replace('RELEASE_ID = "20260813.7"', `RELEASE_ID = "${RELEASE}"`)
     .replace('BOOTSTRAP_BUILD = "20260815.10"', `BOOTSTRAP_BUILD = "${RELEASE}"`);
write('tests/quality_gate.py', q);

let boot = read('bootstrap.js');
boot = boot.replace('const BOOTSTRAP_BUILD = "20260815.10";', `const BOOTSTRAP_BUILD = "${RELEASE}";`)
           .replace('const ATOMIC_RELEASE = "20260813.7";', `const ATOMIC_RELEASE = "${RELEASE}";`)
           .replace('const UPDATE_BUILD = "20260817.2";', `const UPDATE_BUILD = "${RELEASE}";`);
write('bootstrap.js', boot);

let sw = read('sw.js');
sw = sw.replace('const RELEASE_ID = "20260813.7";', `const RELEASE_ID = "${RELEASE}";`)
       .replace('const CACHE_REVISION = "20260817.2";', `const CACHE_REVISION = "${RELEASE}";`)
       .replace('const BOOTSTRAP_BUILD = "20260815.10";', `const BOOTSTRAP_BUILD = "${RELEASE}";`)
       .replace('const UPDATE_BUILD = "20260817.2";', `const UPDATE_BUILD = "${RELEASE}";`);
if (!sw.includes('releaseAsset("./styles/admin-user-view.css")')) {
  sw = sw.replace('releaseAsset("./styles/billing-workflow.css"),', 'releaseAsset("./styles/billing-workflow.css"),\n  releaseAsset("./styles/admin-user-view.css"),');
}
write('sw.js', sw);

// 2) CSP: remove runtime <style> injection and load owned stylesheet.
let admin = read('src/admin-user-view.js');
const styleStart = admin.indexOf('function ensureStyles() {');
if (styleStart < 0) throw new Error('ensureStyles not found');
const styleEnd = admin.indexOf('\n}', styleStart);
// function contains template braces; find the exact final marker after document.head.append(style)
const marker = '  document.head.append(style);\n}';
const markerPos = admin.indexOf(marker, styleStart);
if (markerPos < 0) throw new Error('ensureStyles end not found');
const oldBlock = admin.slice(styleStart, markerPos + marker.length);
const newBlock = `function ensureStyles() {\n  if (document.querySelector('link[data-admin-user-view-style="true"]')) return;\n  const link = document.createElement("link");\n  link.rel = "stylesheet";\n  link.href = "./styles/admin-user-view.css?v=${RELEASE}";\n  link.dataset.adminUserViewStyle = "true";\n  document.head.append(link);\n}`;
admin = admin.replace(oldBlock, newBlock);
write('src/admin-user-view.js', admin);

// 3) Pure, date-aware tariff resolver with legacy aliases.
let tariff = read('src/tariff.js');
if (!tariff.includes('["ambar", "Âmbar Amazonas"]')) {
  tariff = tariff.replace('["ambar energia", "Âmbar Amazonas"]', '["ambar energia", "Âmbar Amazonas"],\n  ["ambar", "Âmbar Amazonas"],\n  ["ambar amazonas", "Âmbar Amazonas"]');
}
if (!tariff.includes('export function resolveEnergyTariffRule')) {
  const anchor = 'export function resolveEnergyTariff(localityInput, currentSettings, date = new Date()) {';
  const helper = `export function resolveEnergyTariffRule(localityInput, date = new Date()) {\n  const locality = normalizeLocality(localityInput);\n  if (locality.country !== "BR" || !locality.energyProvider) return null;\n  const lookupProvider = canonicalEnergyProvider(locality.energyProvider);\n  const rule = findNationalEnergyRule({ provider: lookupProvider, date });\n  return rule?.automatic && Number.isFinite(rule.ratePerKwh) && rule.ratePerKwh > 0 ? rule : null;\n}\n\n`;
  tariff = replaceRequired(tariff, anchor, helper + anchor, 'tariff helper anchor');
  tariff = replaceRequired(tariff,
    '  const lookupProvider = canonicalEnergyProvider(locality.energyProvider);\n  const rule = findNationalEnergyRule({ provider: lookupProvider, date });',
    '  const rule = resolveEnergyTariffRule(locality, date);',
    'tariff resolver internals');
}
write('src/tariff.js', tariff);

// 4) Closed-cycle energy estimates resolve tariff and flag from cycle date, never current tariff fallback.
let billing = read('src/billing-workflow.js');
billing = billing.replace(
  'import { buildEnergyBillingRules, matchRegulatoryRuleForComponent, regulatoryProfileLabel } from "./regulatory-engine.js?v=' + RELEASE + '";',
  'import { buildEnergyBillingRules, matchRegulatoryRuleForComponent, regulatoryProfileLabel } from "./regulatory-engine.js?v=' + RELEASE + '";\nimport { resolveEnergyTariffRule } from "./tariff.js?v=' + RELEASE + '";'
);
const oldCalc = `  const settings = state.settings?.energy;\n  if (!settings) return null;\n  const regulatory = buildEnergyBillingRules({ rules: domain.rules, profiles: domain.profiles, unit, cycle });\n  const flagRate = settings.flag === "green" ? 0 : finiteOrNull(regulatory.flagRates?.[settings.flag]);\n  const result = forecastEnergyBill(measured, regulatory, {\n    fallbackRate: settings.rate,\n    flagRate: flagRate ?? 0,\n    flagLabel: flagLabel(settings.flag),\n    lightingFee: settings.lightingFee\n  });`;
const newCalc = `  const settings = state.settings?.energy;\n  if (!settings) return null;\n  const cycleDate = new Date(\`${'${cycle.cycle_end}'}T12:00:00Z\`);\n  const tariffRule = resolveEnergyTariffRule({\n    country: unit.country || "BR",\n    state: unit.state || "",\n    city: unit.city || "",\n    energyProvider: unit.distributor || ""\n  }, cycleDate);\n  if (!tariffRule) return null;\n  const regulatory = buildEnergyBillingRules({ rules: domain.rules, profiles: domain.profiles, unit, cycle });\n  const flagEntry = Object.entries(regulatory.flagRates || {}).find(([, rate]) => Number.isFinite(Number(rate)) && Number(rate) > 0) || null;\n  const cycleFlag = flagEntry?.[0] || "not_identified";\n  const flagRate = flagEntry ? Number(flagEntry[1]) : 0;\n  const result = forecastEnergyBill(measured, regulatory, {\n    fallbackRate: Number(tariffRule.ratePerKwh),\n    flagRate,\n    flagLabel: flagLabel(cycleFlag),\n    lightingFee: settings.lightingFee\n  });`;
billing = replaceRequired(billing, oldCalc, newCalc, 'billing cycle tariff calculation');
billing = billing.replace(
  '      fallbackRate: settings.rate,\n      flag: settings.flag,\n      flagRate,\n      flagRateSource: flagRate == null ? "not_identified" : "regulatory_rule",',
  '      fallbackRate: Number(tariffRule.ratePerKwh),\n      tariffRule: { id: tariffRule.id, provider: tariffRule.provider, validFrom: tariffRule.validFrom, validUntil: tariffRule.validUntil, source: tariffRule.source },\n      flag: cycleFlag,\n      flagRate,\n      flagRateSource: flagEntry ? "regulatory_rule" : "not_identified",'
);
billing = billing.replace(
  '    output: { ...result, note: flagRate == null ? "Estimativa congelada no fechamento; taxa de bandeira não identificada e não cobrada." : "Estimativa congelada no fechamento; itens não identificados não são inventados." }',
  '    output: { ...result, note: flagEntry ? "Estimativa congelada no fechamento com tarifa e bandeira válidas para a data do ciclo." : "Estimativa congelada no fechamento com tarifa válida para a data do ciclo; bandeira adicional não identificada e não inventada." }'
);
write('src/billing-workflow.js', billing);

// 5) Browser tests must track the synchronized release/cache, not stale constants.
let voltTest = read('tests/e2e/volt.spec.mjs');
voltTest = voltTest.replaceAll('"20260813.7"', `"${RELEASE}"`).replaceAll('"20260815.10"', `"${RELEASE}"`).replaceAll('"20260817.2"', `"${RELEASE}"`);
write('tests/e2e/volt.spec.mjs', voltTest);
let swTest = read('tests/e2e/sw.spec.mjs');
swTest = swTest.replaceAll('volt-app-v4-atomic-20260813.7', `volt-app-v4-atomic-${RELEASE}`).replaceAll('volt-app-v4-atomic-20260817.2', `volt-app-v4-atomic-${RELEASE}`);
write('tests/e2e/sw.spec.mjs', swTest);

console.log(`Applied reliability runtime patch ${RELEASE}`);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.git') return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}
