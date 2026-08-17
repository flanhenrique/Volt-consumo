export function renderEnergyInvoiceReport(snapshot) {
  const panel = document.querySelector('[data-report-panel="energy"]');
  if (!panel) return;
  let host = panel.querySelector('[data-energy-invoice-report]');
  if (!host) {
    host = document.createElement('section');
    host.className = 'volt-energy-invoice-report card glass-level-3';
    host.dataset.energyInvoiceReport = 'true';
    (panel.querySelector('.report-detail-grid') || panel.lastElementChild)?.after(host);
  }
  const unitIds = new Set(snapshot.units.filter((u) => u.service === 'energy').map((u) => u.id));
  const cutoff = periodCutoff();
  const rows = snapshot.bills
    .map((bill) => ({ bill, cycle: snapshot.cycles.find((c) => c.id === bill.billing_cycle_id) }))
    .filter(({ bill, cycle }) => cycle && unitIds.has(bill.consumer_unit_id) && (!cutoff || new Date(`${cycle.cycle_end}T12:00:00`) >= cutoff))
    .sort((a, b) => b.cycle.cycle_end.localeCompare(a.cycle.cycle_end));

  host.replaceChildren(reportHeading());
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'supporting-copy';
    empty.textContent = 'Nenhuma fatura de energia registrada no período selecionado.';
    host.append(empty);
    return;
  }
  rows.forEach(({ bill, cycle }) => host.append(buildInvoiceSummary(bill, cycle, componentsForBill(snapshot, bill.id), true)));
}

export function buildInvoiceSummary(bill, cycle, components, compact = false) {
  const root = document.createElement(compact ? 'details' : 'div');
  root.className = compact ? 'volt-energy-invoice-cycle' : 'volt-energy-invoice-breakdown';
  if (compact) root.open = true;
  const heading = document.createElement(compact ? 'summary' : 'div');
  heading.className = 'volt-energy-invoice-heading';
  const title = document.createElement('strong');
  title.textContent = `Fatura · ${fmtDate(cycle.cycle_start)} – ${fmtDate(cycle.cycle_end)}`;
  const total = document.createElement('span');
  total.textContent = money(bill.invoice_total);
  heading.append(title, total);
  root.append(heading);

  const groups = group(components, bill.invoice_total);
  const metrics = document.createElement('div');
  metrics.className = 'volt-energy-invoice-metrics';
  metrics.append(
    metric('Consumo faturado', bill.billed_consumption == null ? 'Não informado' : `${num(bill.billed_consumption, 0)} kWh`, methodLabel(bill.billing_method)),
    metric('Energia / consumo', money(groups.energy.amount), pct(groups.energy.percent)),
    metric('Impostos', money(groups.tax.amount), pct(groups.tax.percent)),
    metric('Iluminação pública', money(groups.lighting.amount), pct(groups.lighting.percent)),
    metric('Bandeira tarifária', money(groups.flag.amount), pct(groups.flag.percent)),
    metric('Descontos e créditos', `− ${money(groups.credits.amount)}`, pct(groups.credits.percent)),
    metric('Total da fatura', money(bill.invoice_total), 'Valor oficial registrado')
  );
  root.append(metrics);

  if (!components.length) {
    const warning = document.createElement('p');
    warning.className = 'volt-bill-detail-warning supporting-copy';
    warning.textContent = 'Esta fatura foi registrada apenas com o valor total. Complete o detalhamento para separar consumo, impostos, iluminação pública, bandeira e descontos.';
    root.append(warning);
    return root;
  }

  const list = document.createElement('ul');
  list.className = 'volt-energy-invoice-lines';
  [...components].sort((a, b) => Number(a.position) - Number(b.position)).forEach((item) => {
    const li = document.createElement('li');
    const left = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = item.label || item.code;
    const note = document.createElement('small');
    const p = finite(item.percentage) ?? percent(item.amount, bill.invoice_total);
    const bits = [];
    if (item.quantity != null) bits.push(`${num(item.quantity, item.quantity_unit === 'kWh' ? 0 : 3)} ${item.quantity_unit || ''}`.trim());
    if (item.unit_rate != null) bits.push(`R$ ${rate(item.unit_rate)}/un.`);
    if (p != null) bits.push(`${num(p, 2)}% da fatura`);
    note.textContent = bits.join(' · ') || 'Componente da fatura';
    left.append(name, note);
    const amount = document.createElement('strong');
    amount.textContent = `${item.direction === 'credit' ? '− ' : ''}${money(item.amount)}`;
    li.append(left, amount);
    list.append(li);
  });
  root.append(list);
  return root;
}

export function componentsForBill(snapshot, billId) {
  return snapshot.components.filter((item) => item.bill_id === billId);
}

export function group(components, invoiceTotal) {
  const out = { energy: { amount: 0 }, tax: { amount: 0 }, lighting: { amount: 0 }, flag: { amount: 0 }, credits: { amount: 0 }, other: { amount: 0 } };
  components.forEach((item) => {
    const key = classify(item);
    const amount = Number(item.amount) || 0;
    if (item.direction === 'credit' || key === 'credits') out.credits.amount += amount;
    else (out[key] || out.other).amount += amount;
  });
  Object.values(out).forEach((g) => { g.percent = percent(g.amount, invoiceTotal); });
  return out;
}

export function classify(item) {
  const text = `${item.category || ''} ${item.code || ''} ${item.label || ''}`.toLocaleLowerCase('pt-BR');
  if (item.direction === 'credit' || /desconto|cr[eé]dito|benef[ií]cio|subs[ií]dio|itaipu|social/.test(text)) return 'credits';
  if (/ilumina|cosip|cip/.test(text)) return 'lighting';
  if (/bandeira|flag/.test(text)) return 'flag';
  if (/imposto|tribut|icms|pis|cofins|tax/.test(text)) return 'tax';
  if (/energia|consumo|kwh/.test(text)) return 'energy';
  return 'other';
}

function reportHeading() {
  const header = document.createElement('div');
  header.className = 'volt-financial-heading';
  const copy = document.createElement('div');
  const eye = document.createElement('p'); eye.className = 'eyebrow'; eye.textContent = 'FATURAS DETALHADAS';
  const title = document.createElement('h2'); title.textContent = 'Composição da conta de energia';
  const note = document.createElement('p'); note.className = 'supporting-copy'; note.textContent = 'Valores reais por ciclo: consumo faturado, energia, tributos, iluminação pública, bandeira, descontos, créditos e participação percentual na fatura.';
  copy.append(eye, title, note); header.append(copy); return header;
}

function metric(label, value, note) {
  const div = document.createElement('div');
  const small = document.createElement('small'); small.textContent = label;
  const strong = document.createElement('strong'); strong.textContent = value;
  const span = document.createElement('span'); span.textContent = note || '';
  div.append(small, strong, span); return div;
}

function periodCutoff() {
  const value = document.querySelector('[data-report-period]')?.value || '6m';
  if (value === 'all') return null;
  const now = new Date();
  if (value === 'cycle') return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), now.getMonth() - (value === '3m' ? 2 : 5), 1);
}
function methodLabel(v) { return ({ metered: 'Leitura do medidor', average: 'Faturamento por média', estimated: 'Estimado', adjusted: 'Ajustado' })[v] || 'Critério não identificado'; }
function pct(v) { return v == null ? 'Percentual não identificado' : `${num(v, 2)}% da fatura`; }
function percent(a, t) { a = Number(a); t = Number(t); return Number.isFinite(a) && Number.isFinite(t) && t ? Math.round(Math.abs(a / t) * 1000000) / 10000 : null; }
function finite(v) { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) ? null : n; }
function money(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0); }
function num(v, d = 2) { return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) || 0); }
function rate(v) { return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(Number(v) || 0); }
function fmtDate(v) { if (!v) return '—'; const d = new Date(`${String(v).slice(0, 10)}T12:00:00`); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('pt-BR') : String(v); }
