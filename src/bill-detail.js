const DETAIL_ID = "energy-bill-legal-detail";

export function renderLegalBillDetail(profile, bill = null) {
  if (typeof document === "undefined") return;
  const host = document.querySelector("#page-consumption .analytics-grid");
  if (!host) return;

  const benefits = collectLegalBenefits(profile);
  const normalizedBill = normalizeBill(bill);
  const existing = document.getElementById(DETAIL_ID);
  if (!benefits.length && !normalizedBill) {
    existing?.remove();
    return;
  }

  const card = existing || document.createElement("article");
  card.id = DETAIL_ID;
  card.className = "comparison-card card glass-level-3";
  card.dataset.utility = "energy";
  card.setAttribute("aria-label", "Detalhamento da fatura de energia e descontos por lei");

  const children = [buildHeader(normalizedBill)];
  if (normalizedBill) children.push(buildInvoiceBreakdown(normalizedBill, benefits));
  children.push(...benefits.map((benefit) => buildBenefit(benefit, normalizedBill)));
  card.replaceChildren(...children);

  if (!existing) host.append(card);
  bindUtilityVisibility(card);
}

function collectLegalBenefits(profile) {
  const direct = Array.isArray(profile?.legalBenefits) ? profile.legalBenefits : [];
  const regulatory = Array.isArray(profile?.rules?.benefits)
    ? profile.rules.benefits.filter((item) => item?.legalBenefit === true)
    : [];
  const map = new Map();
  [...direct, ...regulatory]
    .filter((item) => item?.active !== false)
    .forEach((item, index) => map.set(String(item?.code || item?.name || index), item));
  return [...map.values()];
}

function normalizeBill(input) {
  if (!input || typeof input !== "object") return null;
  const items = Array.isArray(input.items) ? input.items.map((item, index) => ({
    category: String(item?.category || "other"),
    code: String(item?.code || `item_${index + 1}`),
    label: String(item?.label || item?.code || `Item ${index + 1}`),
    quantityKwh: finiteOrNull(item?.quantityKwh),
    unitRate: finiteOrNull(item?.unitRate),
    amount: finiteOrNull(item?.amount),
    amountStatus: String(item?.amountStatus || ""),
    forecastable: item?.forecastable !== false,
    extraordinary: Boolean(item?.extraordinary)
  })) : [];
  return {
    cycleStart: input.cycleStart || null,
    cycleEnd: input.cycleEnd || null,
    measuredConsumptionKwh: finiteOrNull(input.measuredConsumptionKwh),
    billedConsumptionKwh: finiteOrNull(input.billedConsumptionKwh),
    billingBasis: String(input.billingBasis || "metered"),
    invoiceTotal: finiteOrNull(input.invoiceTotal),
    items
  };
}

function buildHeader(bill) {
  const header = document.createElement("div");
  header.className = "card-header";
  const copy = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "DETALHAMENTO DA FATURA";
  const title = document.createElement("h2");
  title.textContent = "Composição e descontos";
  copy.append(eyebrow, title);
  const badge = document.createElement("span");
  badge.className = "status-pill";
  badge.dataset.tone = bill ? "success" : "warning";
  badge.textContent = bill ? "Fatura registrada" : "Base legal disponível";
  header.append(copy, badge);
  return header;
}

function buildInvoiceBreakdown(bill, benefits) {
  const section = document.createElement("section");
  section.className = "settings-group";
  section.dataset.invoiceBreakdown = "energy";

  const heading = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = "Itens da fatura";
  const caption = document.createElement("p");
  caption.className = "supporting-copy";
  caption.textContent = "O total oficial da concessionária é separado do subtotal explicado pelo Volt. Créditos legais identificados aparecem mesmo quando o valor monetário ainda precisa ser confirmado.";
  heading.append(title, caption);

  const meta = document.createElement("ul");
  meta.className = "comparison-list compact-list";
  if (bill.measuredConsumptionKwh != null) meta.append(detailRow("Consumo medido", `${formatNumber(bill.measuredConsumptionKwh, 0)} kWh`, "Leitura física acompanhada pelo Volt"));
  if (bill.billedConsumptionKwh != null) meta.append(detailRow("Consumo faturado", `${formatNumber(bill.billedConsumptionKwh, 0)} kWh`, billingBasisLabel(bill.billingBasis)));
  if (bill.measuredConsumptionKwh != null && bill.billedConsumptionKwh != null) {
    const difference = bill.measuredConsumptionKwh - bill.billedConsumptionKwh;
    meta.append(detailRow("Diferença de consumo", `${signedNumber(difference, 0)} kWh`, difference === 0 ? "Leitura e faturamento alinhados" : "Acompanhar reconciliação na próxima fatura"));
  }

  const lines = document.createElement("ul");
  lines.className = "comparison-list";
  for (const item of bill.items) lines.append(invoiceItemRow(item, benefits));

  const knownTotal = roundMoney(bill.items.reduce((total, item) => total + (item.amount == null ? 0 : item.amount), 0));
  const unexplained = bill.invoiceTotal == null ? null : roundMoney(bill.invoiceTotal - knownTotal);
  const totals = document.createElement("ul");
  totals.className = "comparison-list compact-list";
  totals.append(detailRow("Subtotal explicado pelo Volt", currency(knownTotal), "Soma apenas dos itens com valor identificado"));
  if (unexplained != null && Math.abs(unexplained) >= 0.01) {
    totals.append(detailRow("Ajuste ainda não identificado", signedCurrency(unexplained), "Não é atribuído automaticamente ao Bônus Itaipu ou a outro benefício"));
  }
  if (bill.invoiceTotal != null) totals.append(detailRow("Total da fatura", currency(bill.invoiceTotal), "Valor oficial informado pela concessionária"));

  section.append(heading, meta, lines, totals);
  return section;
}

function invoiceItemRow(item, benefits) {
  const legalBenefit = findBenefitForInvoiceItem(item, benefits);
  const itemNode = document.createElement("li");
  const small = document.createElement("small");
  small.textContent = legalBenefit ? "Desconto por Lei · identificado" : categoryLabel(item.category);
  const strong = document.createElement("strong");
  strong.textContent = item.label;
  const value = document.createElement("span");
  value.textContent = item.amount == null
    ? (legalBenefit ? "Identificado · valor a confirmar" : "Valor a confirmar")
    : signedCurrency(item.amount);

  const details = [];
  if (item.quantityKwh != null && item.unitRate != null) details.push(`${formatNumber(item.quantityKwh, 0)} kWh × R$ ${formatRate(item.unitRate, 6)}`);
  if (legalBenefit?.law?.label) details.push(`${legalBenefit.law.label}${legalBenefit.law.article ? ` · ${legalBenefit.law.article}` : ""}`);
  if (item.extraordinary || legalBenefit?.recurring === false) details.push("Crédito extraordinário");
  if (item.amount == null) details.push("Valor monetário ainda não confirmado; não altera o subtotal");

  itemNode.append(small, strong, value);
  if (details.length) {
    const note = document.createElement("span");
    note.textContent = details.join(" · ");
    itemNode.append(note);
  }
  return itemNode;
}

function buildBenefit(benefit, bill) {
  const section = document.createElement("section");
  section.className = "settings-group";
  section.dataset.legalBenefit = String(benefit.code || "legal-benefit");

  const invoiceItem = bill ? bill.items.find((item) => findBenefitForInvoiceItem(item, [benefit])) || null : null;
  const heading = document.createElement("div");
  const name = document.createElement("h3");
  name.textContent = benefit.name || "Benefício legal";
  const law = document.createElement("p");
  law.className = "supporting-copy";
  law.textContent = [benefit.law?.label, benefit.law?.article].filter(Boolean).join(" · ");
  heading.append(name, law);

  const summary = document.createElement("ul");
  summary.className = "comparison-list compact-list";
  const rows = [
    detailRow("Status do benefício", invoiceItem ? "Identificado na fatura" : "Regra aplicável", invoiceItem ? "A concessionária registrou este benefício no documento" : "Regra regulatória disponível para a unidade"),
    detailRow("Valor na fatura", invoiceItem?.amount == null ? "A confirmar" : signedCurrency(invoiceItem.amount), invoiceItem?.amount == null ? "O benefício foi identificado, mas o valor monetário ainda não foi confirmado" : "Valor identificado no detalhamento da concessionária"),
    detailRow("Natureza", benefit.recurring === false ? "Crédito extraordinário" : "Benefício tarifário", benefit.forecastable === false ? "Não entra na previsão recorrente" : "Pode entrar na previsão"),
    detailRow("Cálculo", benefit.formulaLabel || "Conforme ato regulatório", benefit.referencePeriodLabel || "Período de referência definido pela ANEEL")
  ];
  if (Number.isFinite(Number(benefit.officialRate))) rows.push(detailRow("Tarifa-bônus oficial", formatRate(benefit.officialRate, 8), benefit.officialRateUnit || "R$/kWh"));
  if (benefit.annualAct?.label) rows.push(detailRow("Ato anual", benefit.annualAct.label, benefit.creditPeriodLabel || "Aplicação conforme vigência do ato"));
  summary.append(...rows);

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

function findBenefitForInvoiceItem(item, benefits) {
  const haystack = `${item.code} ${item.label}`.toLocaleLowerCase("pt-BR");
  return benefits.find((benefit) => {
    const matchers = Array.isArray(benefit?.invoiceMatchers) ? benefit.invoiceMatchers : [benefit?.name, benefit?.code];
    return matchers.filter(Boolean).some((matcher) => haystack.includes(String(matcher).toLocaleLowerCase("pt-BR")));
  }) || null;
}

function buildSources(benefit) {
  const list = document.createElement("ul");
  list.className = "comparison-list compact-list";
  const entries = [
    benefit.law && { label: benefit.law.label, url: benefit.law.url, note: benefit.law.article },
    benefit.regulation && { label: benefit.regulation.label, url: benefit.regulation.url, note: "Regulamentação" },
    benefit.annualAct && { label: benefit.annualAct.label, url: benefit.annualAct.url, note: "Ato aplicável ao crédito" }
  ].filter((entry) => entry?.url);

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

function categoryLabel(category) {
  const labels = {
    energy: "Energia",
    benefit: "Benefício tarifário",
    credit: "Crédito",
    flag: "Bandeira tarifária",
    fee: "Encargo",
    lighting: "Iluminação pública"
  };
  return labels[category] || "Item da fatura";
}

function billingBasisLabel(value) {
  if (value === "average") return "Faturamento por média da concessionária";
  if (value === "metered") return "Faturamento por leitura do medidor";
  return "Critério informado pela concessionária";
}

function finiteOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function signedCurrency(value) {
  const number = Number(value) || 0;
  return number < 0 ? `− ${currency(Math.abs(number))}` : currency(number);
}

function signedNumber(value, decimals) {
  const number = Number(value) || 0;
  const formatted = formatNumber(Math.abs(number), decimals);
  if (number > 0) return `+${formatted}`;
  if (number < 0) return `−${formatted}`;
  return formatted;
}

function formatNumber(value, decimals) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0);
}

function formatRate(value, decimals = 8) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(number);
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