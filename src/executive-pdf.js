function stripUnsupported(value) {
  return String(value ?? "").replace(/[\u2013\u2014]/g, "-").replace(/\u2022/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function pdfEscape(value) {
  return stripUnsupported(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function latin1Bytes(value) {
  const text = stripUnsupported(value);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff;
  return bytes;
}

function concatBytes(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function wrap(text, width = 82) {
  const words = stripUnsupported(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function money(value) {
  if (value == null || !Number.isFinite(Number(value))) return "não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function number(value, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return "não identificado";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value));
}

function date(value) {
  if (!value) return "não informado";
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("pt-BR") : String(value);
}

function classification(value) {
  const labels = {
    matching: "Batendo",
    small_difference: "Pequena diferença",
    relevant_difference: "Diferença relevante"
  };
  return labels[value] || "Não conciliado";
}

function reportLines(data) {
  const lines = [];
  const push = (text = "") => lines.push(...wrap(text));
  push("VOLT - RELATÓRIO EXECUTIVO");
  push(`Gerado em ${new Date().toLocaleString("pt-BR")}`);
  push();
  push("RESUMO");
  push(`Unidade: ${data.unit?.label || data.unit?.service || "não identificada"}`);
  push(`Serviço: ${data.unit?.service === "water" ? "Água" : "Energia"}`);
  push(`Distribuidora/prestadora: ${data.unit?.distributor || "não informada"}`);
  push(`Ciclo: ${date(data.cycle?.cycle_start)} a ${date(data.cycle?.cycle_end)}`);
  push(`Status do ciclo: ${data.cycle?.status || "não informado"}`);
  push();
  push("CONSUMO");
  const unit = data.unit?.service === "water" ? "m³" : "kWh";
  push(`Consumo medido pelo VOLT: ${number(data.bill?.measured_consumption ?? data.estimate?.estimated_consumption, data.unit?.service === "water" ? 3 : 0)} ${unit}`);
  push(`Consumo faturado pela concessionária: ${number(data.bill?.billed_consumption, data.unit?.service === "water" ? 3 : 0)} ${unit}`);
  push("Esses dois valores são mantidos separadamente pelo VOLT.");
  push();
  push("FINANCEIRO");
  push(`Estimativa registrada no fechamento: ${money(data.estimate?.estimated_total)}`);
  push(`Valor real da fatura: ${money(data.bill?.invoice_total)}`);
  push(`Subtotal explicado por itens identificados: ${money(data.reconciliation?.calculated_total)}`);
  push(`Diferença ainda não explicada: ${money(data.reconciliation?.difference_amount)}`);
  push(`Classificação: ${classification(data.reconciliation?.classification)}`);
  if (data.reconciliation?.next_action) push(`Próxima ação: ${data.reconciliation.next_action}`);
  push();
  push("COMPONENTES DA FATURA");
  const components = Array.isArray(data.components) ? data.components : [];
  if (!components.length) push("Nenhum componente detalhado foi identificado.");
  for (const component of components) {
    const sign = component.direction === "credit" ? "-" : component.direction === "charge" ? "+" : "";
    push(`${component.label || component.code}: ${component.amount == null ? "valor não identificado" : `${sign}${money(component.amount)}`} (${component.confidence || "não identificado"})`);
  }
  push();
  push("REGRAS E BENEFÍCIOS");
  const profiles = Array.isArray(data.regulatoryProfiles) ? data.regulatoryProfiles : [];
  if (!profiles.length) push("Nenhum benefício regulatório confirmado para esta unidade/ciclo.");
  for (const profile of profiles) push(`${profile.rule_code}: ${profile.state} - confiança ${profile.confidence || "não identificada"}`);
  push();
  push("PROVENIÊNCIA");
  push(`Estimativa: ${data.estimate?.source_type || "não identificada"} / ${data.estimate?.confidence || "não identificada"}`);
  push(`Fatura: ${data.bill?.source_type || "não identificada"} / ${data.bill?.confidence || "não identificada"}`);
  push(`Conciliação: ${data.reconciliation?.source_type || "não identificada"} / ${data.reconciliation?.confidence || "não identificada"}`);
  push();
  push("Observação: o relatório distingue medição do VOLT, informação da concessionária, cálculo do motor e previsão regulatória. Valores ausentes não são estimados como se fossem fatos.");
  return lines;
}

function pageContent(lines) {
  const commands = ["BT", "/F1 10 Tf", "50 792 Td", "13 TL"];
  lines.forEach((line, index) => {
    if (index > 0) commands.push("T*");
    commands.push(`(${pdfEscape(line)}) Tj`);
  });
  commands.push("ET");
  return commands.join("\n");
}

function buildPdf(lines) {
  const linesPerPage = 54;
  const pages = [];
  for (let index = 0; index < lines.length; index += linesPerPage) pages.push(lines.slice(index, index + linesPerPage));
  if (!pages.length) pages.push(["VOLT - RELATÓRIO EXECUTIVO"]);

  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  const contentObjectIds = pages.map((_, index) => 5 + index * 2);
  const maxObject = 3 + pages.length * 2;
  const objects = new Map();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  pages.forEach((pageLines, index) => {
    const pageId = pageObjectIds[index];
    const contentId = contentObjectIds[index];
    const stream = pageContent(pageLines);
    const streamLength = latin1Bytes(stream).length;
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);
  });

  const chunks = [latin1Bytes("%PDF-1.4\n%âãÏÓ\n")];
  const offsets = new Array(maxObject + 1).fill(0);
  let offset = chunks[0].length;
  for (let id = 1; id <= maxObject; id += 1) {
    offsets[id] = offset;
    const bytes = latin1Bytes(`${id} 0 obj\n${objects.get(id)}\nendobj\n`);
    chunks.push(bytes);
    offset += bytes.length;
  }
  const xrefOffset = offset;
  const xref = ["xref", `0 ${maxObject + 1}`, "0000000000 65535 f "];
  for (let id = 1; id <= maxObject; id += 1) xref.push(`${String(offsets[id]).padStart(10, "0")} 00000 n `);
  xref.push("trailer", `<< /Size ${maxObject + 1} /Root 1 0 R >>`, "startxref", String(xrefOffset), "%%EOF");
  chunks.push(latin1Bytes(`${xref.join("\n")}\n`));
  return concatBytes(chunks);
}

export function createExecutivePdf(data) {
  return new Blob([buildPdf(reportLines(data))], { type: "application/pdf" });
}

export function downloadExecutivePdf(data, filename = "volt-relatorio-executivo.pdf") {
  const blob = createExecutivePdf(data);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
