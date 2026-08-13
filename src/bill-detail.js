const DETAIL_ID = "energy-bill-legal-detail";

export function renderLegalBillDetail(profile) {
  if (typeof document === "undefined") return;
  const host = document.querySelector("#page-consumption .analytics-grid");
  if (!host) return;

  const benefits = Array.isArray(profile?.legalBenefits) ? profile.legalBenefits.filter((item) => item?.active !== false) : [];
  const existing = document.getElementById(DETAIL_ID);
  if (!benefits.length) {
    existing?.remove();
    return;
  }

  const card = existing || document.createElement("article");
  card.id = DETAIL_ID;
  card.className = "comparison-card card glass-level-3";
  card.dataset.utility = "energy";
  card.setAttribute("aria-label", "Detalhamento de descontos por lei da fatura de energia");
  card.replaceChildren(buildHeader(), ...benefits.map(buildBenefit));
  if (!existing) host.append(card);
  bindUtilityVisibility(card);
}

function buildHeader() {
  const header = document.createElement("div");
  header.className = "card-header";
  const copy = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "DETALHAMENTO DA FATURA";
  const title = document.createElement("h2");
  title.textContent = "Desconto por Lei";
  copy.append(eyebrow, title);
  const badge = document.createElement("span");
  badge.className = "status-pill";
  badge.dataset.tone = "success";
  badge.textContent = "Base legal verificada";
  header.append(copy, badge);
  return header;
}

function buildBenefit(benefit) {
  const section = document.createElement("section");
  section.className = "settings-group";
  section.dataset.legalBenefit = String(benefit.code || "legal-benefit");

  const heading = document.createElement("div");
  const name = document.createElement("h3");
  name.textContent = benefit.name || "Benefício legal";
  const law = document.createElement("p");
  law.className = "supporting-copy";
  law.textContent = [benefit.law?.label, benefit.law?.article].filter(Boolean).join(" · ");
  heading.append(name, law);

  const summary = document.createElement("ul");
  summary.className = "comparison-list compact-list";
  summary.append(
    detailRow("Natureza", benefit.recurring === false ? "Crédito extraordinário" : "Benefício tarifário", benefit.forecastable === false ? "Não entra na previsão recorrente" : "Pode entrar na previsão"),
    detailRow("Cálculo", benefit.formulaLabel || "Conforme ato regulatório", benefit.referencePeriodLabel || "Período de referência definido pela ANEEL"),
    detailRow("Tarifa-bônus oficial", formatRate(benefit.officialRate), benefit.officialRateUnit || "R$/kWh"),
    detailRow("Ato anual", benefit.annualAct?.label || "Ato ANEEL", benefit.creditPeriodLabel || "Aplicação conforme vigência do ato")
  );

  const explanation = document.createElement("p");
  explanation.className = "supporting-copy";
  explanation.textContent = benefit.explanation || "O valor só é considerado validado quando o crédito da fatura e o histórico elegível fecham com a regra oficial.";

  const sources = document.createElement("details");
  const sourceSummary = document.createElement("summary");
  sourceSummary.className = "text-button";
  sourceSummary.textContent = "Ver base legal e fontes oficiais";
  sources.append(sourceSummary, buildSources(benefit));

  section.append(heading, summary, explanation, sources);
  return section;
}

function buildSources(benefit) {
  const list = document.createElement("ul");
  list.className = "comparison-list compact-list";
  const entries = [
    benefit.law && { label: benefit.law.label, url: benefit.law.url, note: benefit.law.article },
    benefit.regulation && { label: benefit.regulation.label, url: benefit.regulation.url, note: "Regulamentação" },
    benefit.annualAct && { label: benefit.annualAct.label, url: benefit.annualAct.url, note: "Ato aplicável ao crédito" }
  ].filter(Boolean);

  for (const entry of entries) {
    const item = document.createElement("li");
    const small = document.createElement("small");
    small.textContent = entry.note || "Fonte oficial";
    const link = document.createElement("a");
    link.className = "text-button";
    link.href = entry.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = entry.label;
    const note = document.createElement("span");
    note.textContent = "Abrir fonte oficial ↗";
    item.append(small, link, note);
    list.append(item);
  }
  return list;
}

function detailRow(label, value, note) {
  const item = document.createElement("li");
  const small = document.createElement("small");
  small.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value || "—";
  const description = document.createElement("span");
  description.textContent = note || "";
  item.append(small, strong, description);
  return item;
}

function formatRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 8, maximumFractionDigits: 8 }).format(number);
}

function bindUtilityVisibility(card) {
  const buttons = document.querySelectorAll("[data-consumption-type]");
  if (card.dataset.visibilityBound !== "true") {
    buttons.forEach((button) => button.addEventListener("click", () => {
      card.hidden = button.dataset.consumptionType !== "energy";
    }));
    card.dataset.visibilityBound = "true";
  }
  const active = [...buttons].find((button) => button.getAttribute("aria-pressed") === "true");
  card.hidden = active ? active.dataset.consumptionType !== "energy" : false;
}
