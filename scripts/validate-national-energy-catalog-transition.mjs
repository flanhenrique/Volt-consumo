import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = "data/national-energy-catalog.js";
const today = new Date().toISOString().slice(0, 10);
const temp = mkdtempSync(join(tmpdir(), "volt-tariff-transition-"));

try {
  const previousSource = execFileSync("git", ["show", `HEAD:${CATALOG_PATH}`], {
    cwd: ROOT,
    encoding: "utf8"
  });
  const previousPath = join(temp, "previous-catalog.mjs");
  writeFileSync(previousPath, previousSource, "utf8");

  const previous = await import(`${pathToFileURL(previousPath).href}?v=${Date.now()}`);
  const current = await import(`${pathToFileURL(join(ROOT, CATALOG_PATH)).href}?v=${Date.now()}`);
  const before = Array.isArray(previous.NATIONAL_ENERGY_CATALOG) ? previous.NATIONAL_ENERGY_CATALOG : [];
  const after = Array.isArray(current.NATIONAL_ENERGY_CATALOG) ? current.NATIONAL_ENERGY_CATALOG : [];

  if (!after.length) fail("Catálogo gerado está vazio.");
  validateIds(after);
  validateAmazonasAnchor(after);

  const missingStillValid = before
    .filter((rule) => isCurrent(rule, today))
    .filter((rule) => !hasProvider(after, rule.provider));

  const missingRecentRenewals = before
    .filter((rule) => endedWithinDays(rule, today, 14))
    .filter((rule) => !hasProvider(after, rule.provider));

  if (missingStillValid.length || missingRecentRenewals.length) {
    const details = [
      ...missingStillValid.map((rule) => `${rule.provider}: regra ainda vigente até ${rule.validUntil || "sem fim"}`),
      ...missingRecentRenewals.map((rule) => `${rule.provider}: vigência terminou em ${rule.validUntil} sem substituta resolvida`)
    ];
    fail(`Atualização ANEEL reduziria cobertura automática:\n- ${[...new Set(details)].join("\n- ")}`);
  }

  const sameRules = JSON.stringify(before) === JSON.stringify(after);
  if (sameRules) {
    execFileSync("git", ["checkout", "HEAD", "--", CATALOG_PATH], { cwd: ROOT, stdio: "inherit" });
    console.log("Catálogo sem mudança tarifária material; timestamp regenerado foi descartado.");
  } else {
    console.log(`Transição tarifária validada: ${before.length} → ${after.length} regras.`);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

function validateIds(rules) {
  const ids = new Set();
  for (const rule of rules) {
    if (!rule?.id || !rule?.provider || !Number.isFinite(Number(rule?.ratePerKwh)) || Number(rule.ratePerKwh) <= 0) {
      fail(`Regra tarifária inválida: ${JSON.stringify(rule)}`);
    }
    if (ids.has(rule.id)) fail(`ID tarifário duplicado: ${rule.id}`);
    ids.add(rule.id);
  }
}

function validateAmazonasAnchor(rules) {
  const rule = rules.find((candidate) => normalize(candidate.provider) === normalize("Âmbar Amazonas") && isCurrent(candidate, today));
  if (!rule) fail("Âmbar Amazonas perdeu a tarifa B1 residencial vigente.");
  if (Math.abs(Number(rule.ratePerKwh) - 0.87571) > 0.0000005) {
    fail(`Âmbar Amazonas divergiu do valor homologado esperado: ${rule.ratePerKwh}`);
  }
  if (Math.abs(Number(rule.components?.tusdPerMwh) - 594.6) > 0.000001 || Math.abs(Number(rule.components?.tePerMwh) - 281.11) > 0.000001) {
    fail("Componentes TUSD/TE da Âmbar Amazonas divergiram do marco homologado atual.");
  }
}

function hasProvider(rules, provider) {
  const needle = normalize(provider);
  return rules.some((rule) => {
    const candidates = [rule?.provider, ...(Array.isArray(rule?.providerAliases) ? rule.providerAliases : [])].map(normalize).filter(Boolean);
    return candidates.some((candidate) => candidate === needle || candidate.includes(needle) || needle.includes(candidate));
  });
}

function isCurrent(rule, day) {
  return (!rule?.validFrom || day >= rule.validFrom) && (!rule?.validUntil || day <= rule.validUntil);
}

function endedWithinDays(rule, day, days) {
  if (!rule?.validUntil || rule.validUntil >= day) return false;
  const end = Date.parse(`${rule.validUntil}T00:00:00Z`);
  const now = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(now)) return false;
  const elapsedDays = (now - end) / 86_400_000;
  return elapsedDays >= 0 && elapsedDays <= days;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function fail(message) {
  console.error(`TARIFF TRANSITION GATE: FALHOU\n${message}`);
  process.exitCode = 1;
  throw new Error(message);
}
