import { dateOnly, formatNumber, monthLabel, signedPercent } from "./consumption-report-data.js?v=20260813.7";

export function ensureUtilityConsumptionReport(type) {
  const panel = document.querySelector(`[data-report-panel="${type}"]`);
  if (!panel || document.getElementById(`consumption-${type}-detail`)) return;
  const isWater = type === "water";
  const hero = panel.querySelector(".report-detail-hero");
  if (hero) {
    const eyebrow = hero.querySelector(".eyebrow"), title = hero.querySelector("h2"), copy = hero.querySelector(".supporting-copy");
    if (eyebrow) eyebrow.textContent = `RELATÓRIO DE CONSUMO · ${isWater ? "ÁGUA" : "ENERGIA"}`;
    if (title) title.textContent = isWater ? "Água" : "Energia";
    if (copy) copy.textContent = `Somente informações de ${isWater ? "água" : "energia"}: consumo, médias, projeção, meta e histórico.`;
  }
  const cards = [...(panel.querySelector(".report-detail-metrics")?.children || [])];
  ["Consumo total", "Média diária", "Média mensal equivalente", "Projeção do ciclo"].forEach((label,index)=>{const caption=cards[index]?.querySelector(".metric-caption");if(caption)caption.textContent=label});
  const side = panel.querySelector(".report-detail-grid")?.children?.[1];
  if (side) side.innerHTML = `<div><p class="eyebrow">CICLO ATUAL</p><h2>Meta e ritmo</h2></div><div class="consumption-cycle-metric"><span>Consumido</span><strong id="consumption-${type}-cycle-used">—</strong></div><div class="consumption-cycle-metric"><span>Meta</span><strong id="consumption-${type}-goal">—</strong></div><span class="consumption-progress-track${isWater ? " water" : ""}"><i id="consumption-${type}-progress"></i></span><small id="consumption-${type}-progress-note" class="muted"></small>`;
  const detail = document.createElement("div");
  detail.id = `consumption-${type}-detail`;
  detail.className = "consumption-detail-grid";
  detail.innerHTML = `<article class="card glass-level-3"><div><p class="eyebrow">HISTÓRICO DETALHADO</p><h2>${isWater ? "Água" : "Energia"} por mês</h2></div><div id="consumption-${type}-history" class="consumption-history"></div></article><article class="card glass-level-3"><div><p class="eyebrow">INSIGHTS</p><h2>Leitura do consumo</h2></div><ul id="consumption-${type}-insights" class="consumption-insights"></ul></article>`;
  panel.append(detail);
}

export function renderUtilityConsumptionReport(type, data) {
  const isWater = type === "water", unit = isWater ? "m³" : "kWh";
  const cards = document.querySelectorAll(`[data-report-panel="${type}"] .report-detail-metrics .card`);
  const values = [`${formatNumber(data.consumption,isWater?3:0)} ${unit}`,`${formatNumber(data.daily,isWater?3:2)} ${unit}/dia`,`${formatNumber(data.monthly,isWater?2:0)} ${unit}`,`${formatNumber(data.projection.projected,isWater?2:0)} ${unit}`];
  cards.forEach((card,index)=>{const strong=card.querySelector(".metric-value");if(strong)strong.textContent=values[index]});
  const change=document.getElementById(`report-${type}-change`);if(change)change.textContent=Number.isFinite(data.change)?`${signedPercent(data.change)} vs. período anterior`:"Sem período anterior comparável";
  setText(`consumption-${type}-cycle-used`,`${formatNumber(data.currentConsumption,isWater?3:0)} ${unit}`);
  setText(`consumption-${type}-goal`,`${formatNumber(data.goal,isWater?1:0)} ${unit}`);
  setProgress(`consumption-${type}-progress`,data.projection.ratio);
  const diff=data.projection.projected-data.goal;
  setText(`consumption-${type}-progress-note`,data.goal>0?(diff>0?`Projeção ${formatNumber(diff,isWater?2:0)} ${unit} acima da meta`:`Margem projetada de ${formatNumber(Math.abs(diff),isWater?2:0)} ${unit}`):"Meta não configurada");
  renderHistory(type,data.buckets,unit,isWater?3:0);
  renderInsights(type,buildInsights(data,unit,isWater?3:0));
}

function renderHistory(type,buckets,unit,decimals){const host=document.getElementById(`consumption-${type}-history`);if(!host)return;const rows=buckets.slice(-12);host.innerHTML=rows.length?`<table><thead><tr><th>Período</th><th>Consumo</th></tr></thead><tbody>${rows.map((row)=>`<tr><td>${monthLabel(row.date)}</td><td>${formatNumber(row.value,decimals)} ${unit}</td></tr>`).join("")}</tbody></table>`:`<div class="consumption-empty"><strong>Sem histórico suficiente</strong><small>Registre pelo menos duas leituras para formar um intervalo.</small></div>`}
function buildInsights(data,unit,decimals){const label=data.type==="water"?"Água":"Energia";const list=[];if(!Number.isFinite(data.change))list.push({tone:"neutral",title:`${label}: sem base anterior`,copy:"Ainda não há período anterior suficiente para comparação."});else if(Math.abs(data.change)<.005)list.push({tone:"neutral",title:`${label}: estável`,copy:"Variação inferior a 0,5% em relação ao período anterior."});else list.push({tone:data.change>0?"warning":"success",title:`${label}: ${data.change>0?"aumento":"redução"} de ${signedPercent(Math.abs(data.change))}`,copy:"Comparação com o período anterior equivalente."});list.push({tone:"neutral",title:"Média diária",copy:`${formatNumber(data.daily,data.type==="water"?3:2)} ${unit}/dia no período selecionado.`});const diff=data.projection.projected-data.goal;if(data.goal>0)list.push({tone:diff>0?"warning":"success",title:diff>0?"Projeção acima da meta":"Projeção dentro da meta",copy:`Fechamento projetado em ${formatNumber(data.projection.projected,data.type==="water"?2:0)} ${unit}.`});if(data.peak)list.push({tone:"neutral",title:"Maior intervalo",copy:`${formatNumber(data.peak.value,decimals)} ${unit} no intervalo encerrado em ${dateOnly(data.peak.date)}.`});return list}
function renderInsights(type,items){const host=document.getElementById(`consumption-${type}-insights`);if(!host)return;host.replaceChildren(...items.map((item)=>{const li=document.createElement("li");li.dataset.tone=item.tone;const dot=document.createElement("span");dot.className="consumption-insight-dot";const copy=document.createElement("span");const strong=document.createElement("strong");const small=document.createElement("small");strong.textContent=item.title;small.textContent=item.copy;copy.append(strong,small);li.append(dot,copy);return li}))}
function setProgress(id,ratio){const node=document.getElementById(id);if(node){node.style.setProperty("--consumption-progress",`${Math.min(Math.max((Number(ratio)||0)*100,0),100)}%`);node.dataset.tone=ratio>1?"warning":"success"}}
function setText(id,value){const node=document.getElementById(id);if(node)node.textContent=value}
