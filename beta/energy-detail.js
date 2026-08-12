import "./platform-users.js";
import { formatMoney, normalizeRegionalContext } from "./mercosur-region.js";

installUtilityDetailStyles();

async function installUtilityDetailStyles() {
  const href = new URL("./energy-detail.css?v=67", import.meta.url);
  try {
    if ("adoptedStyleSheets" in document && typeof CSSStyleSheet !== "undefined" && "replace" in CSSStyleSheet.prototype) {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error(`Falha ao carregar estilos: ${response.status}`);
      const sheet = new CSSStyleSheet(); await sheet.replace(await response.text());
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; return;
    }
  } catch (error) { console.warn("Volt: fallback de stylesheet do detalhamento", error); }
  const link = document.createElement("link"); link.rel = "stylesheet"; link.href = href.href; link.dataset.voltUtilityDetail = "true"; document.head.append(link);
}

const explanations = {
  energyConsumption: ["Consumo", "Valor estimado da energia consumida no ciclo."], flag: ["Bandeira tarifária", "Adicional brasileiro por kWh. Não é aplicado ao piloto uruguaio."], lighting: ["Taxa de iluminação pública", "Contribuição municipal quando houver regra local validada."],
  contractedPower: ["Potência contratada", "Componente UTE calculado pela potência contratada em kW."], fixedEnergy: ["Cargo fixo", "Cargo mensal fixo previsto na tarifa UTE selecionada."],
  waterConsumption: ["Consumo de água", "Valor estimado da água consumida no ciclo."], sewer: ["Taxa de esgoto", "Componente de saneamento quando modelado."], fixedFee: ["Taxa fixa", "Valor fixo configurado para a conta de água."], taxes: ["Impostos", "O Volt não inventa tributos: quando não há regra modelada, o item fica pendente."], fine: ["Multa", "Só entra no total quando houver valor real identificado."], interest: ["Juros", "Só entram no total quando houver valor real identificado."]
};
const icons = { energyConsumption: "ϟ", flag: "⚑", lighting: "⌁", contractedPower: "kW", fixedEnergy: "+", waterConsumption: "●", sewer: "≈", fixedFee: "+", taxes: "%", fine: "!", interest: "%" };
let detailDialog, detailPopover, detailPopoverTimer, activeMeter = "energy";
queueMicrotask(initializeUtilityDetails);
window.addEventListener("volt:locality-context", refreshUtilityDetail); window.addEventListener("volt:cycle-context", refreshUtilityDetail); window.addEventListener("volt:tariff-resolution", refreshUtilityDetail);

function initializeUtilityDetails() { if (!window.VOLT_BETA_API) return; bindCard("energy", ".utility-card.energy", "Energia. Abrir detalhamento da composição estimada"); bindCard("water", ".utility-card.water", "Água. Abrir detalhamento da composição estimada"); ensureDialog(); }
function bindCard(meter, selector, label) { const card=document.querySelector(selector); if(!card||card.dataset.detailBound==="true")return; card.dataset.detailBound="true"; card.setAttribute("role","button"); card.setAttribute("tabindex","0"); card.setAttribute("aria-haspopup","dialog"); card.setAttribute("aria-label",label); card.addEventListener("click",()=>openUtilityDetail(meter)); card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openUtilityDetail(meter);}}); }
function ensureDialog(){if(detailDialog?.isConnected)return detailDialog; detailDialog=document.createElement("dialog"); detailDialog.className="energy-detail-dialog"; detailDialog.setAttribute("aria-labelledby","utility-detail-title"); detailDialog.innerHTML=`<div class="energy-detail-sheet"><div class="energy-detail-handle" aria-hidden="true"></div><div class="energy-detail-heading"><div class="energy-detail-title"><span id="utility-detail-symbol" aria-hidden="true">ϟ</span><h2 id="utility-detail-title">Detalhamento de energia</h2></div><button class="icon-button" type="button" data-utility-detail-close aria-label="Fechar">×</button></div><p class="energy-detail-cycle" id="utility-detail-cycle">Ciclo atual</p><p class="energy-detail-context" id="utility-detail-context" hidden></p><div class="energy-detail-list" id="utility-detail-list"></div><div class="energy-detail-total"><div><span id="utility-detail-total-label">TOTAL ESTIMADO</span></div><strong id="utility-detail-total">R$ 0,00</strong></div><p class="energy-detail-note" id="utility-detail-note"></p></div>`; document.body.append(detailDialog); const closeButton=detailDialog.querySelector("[data-utility-detail-close]"); const closeNow=e=>{e?.preventDefault?.();try{detailDialog.close();}catch{detailDialog.removeAttribute("open");}}; closeButton.addEventListener("pointerdown",closeNow,{passive:false}); closeButton.addEventListener("click",closeNow); detailDialog.addEventListener("click",e=>{if(e.target===detailDialog)closeNow(e);}); detailDialog.addEventListener("close",clearExplanation); return detailDialog; }
function openUtilityDetail(meter){activeMeter=meter;ensureDialog();window.dispatchEvent(new CustomEvent("volt:cycle-context-request"));renderUtilityDetail();if(!detailDialog.open)detailDialog.showModal();}
function refreshUtilityDetail(){if(detailDialog?.open)renderUtilityDetail();}

function renderUtilityDetail(){
  const snapshot=window.VOLT_BETA_API?.getSnapshot?.(); const values=window.VOLT_CYCLE_VALUES?.[activeMeter]; const cycle=window.VOLT_CYCLE_CONTEXT?.[activeMeter]; if(!snapshot)return;
  const locality=normalizeRegionalContext(readLocalityContext()); const resolution=window.VOLT_TARIFF_RESOLUTION; const list=detailDialog.querySelector("#utility-detail-list"); detailDialog.dataset.meter=activeMeter; detailDialog.dataset.country=locality.country;
  if(locality.country==="UY") renderUruguayDetail(snapshot,values,locality,resolution,list); else renderBrazilDetail(snapshot,values,locality,list);
  renderLocalityContext(locality); setText("#utility-detail-cycle",cycle?.label?`${locality.country==="UY"?"Ciclo actual":"Ciclo atual"} · ${cycle.label}`:`${locality.country==="UY"?"Ciclo no configurado":"Ciclo não configurado"}`);
}

function renderUruguayDetail(snapshot,values,locality,resolution,list){
  if(activeMeter==="water"){
    const consumption=Number(values?.consumption||0); list.replaceChildren(row("waterConsumption","Consumo",`${formatNumber(consumption,3,locality)} m³ · OSE`,"—"),row("sewer","Saneamiento","Regla tarifaria todavía no modelada","—"),row("taxes","Impuestos","Pendiente de modelado oficial","—"));
    setText("#utility-detail-title","Detalle de agua"); setText("#utility-detail-symbol","●"); setText("#utility-detail-total","—"); setText("#utility-detail-total-label","ESTIMACIÓN"); setText("#utility-detail-note","OSE identificada. El Volt todavía no calcula automáticamente la factura de agua uruguaya."); return;
  }
  const estimate=resolution?.internationalEstimate; const rule=resolution?.energy; const consumption=Number(estimate?.consumptionKwh ?? values?.consumption ?? 0); const rows=[];
  if(rule?.id==="uy-ute-trs-2026"&&estimate?.valid){
    rows.push(row("energyConsumption","Energía",`${formatNumber(consumption,0,locality)} kWh · bloques UTE`,formatMoney(estimate.energyCost,locality)));
    rows.push(row("contractedPower","Potencia contratada",`${formatNumber(locality.contractedPowerKw,1,locality)} kW × ${formatMoney(rule.contractedPowerRatePerKw,locality)}/kW`,formatMoney(estimate.powerCost,locality)));
    rows.push(row("fixedEnergy","Cargo fijo","Tarifa Residencial Simple",formatMoney(estimate.fixedCost,locality)));
    rows.push(row("taxes","IVA","No incluido todavía en el cálculo piloto","—"));
  } else {
    rows.push(row("energyConsumption","Energía",`${formatNumber(consumption,0,locality)} kWh · ${rule?.customerClass||"UTE"}`,"—")); rows.push(row("taxes","Impuestos","Cálculo automático pendiente","—"));
  }
  list.replaceChildren(...rows); setText("#utility-detail-title","Detalle de energía"); setText("#utility-detail-symbol","ϟ"); setText("#utility-detail-total-label","SUBTOTAL SIN IVA"); setText("#utility-detail-total",estimate?.valid?formatMoney(estimate.subtotalBeforeTax,locality):"—"); setText("#utility-detail-note",estimate?.valid?"Estimación piloto UTE. El subtotal no incluye IVA ni conceptos aún no modelados.":"La tarifa seleccionada requiere datos que el Volt todavía no calcula automáticamente.");
}

function renderBrazilDetail(snapshot,values,locality,list){
  setText("#utility-detail-total-label","TOTAL ESTIMADO");
  if(activeMeter==="water"){
    const water=snapshot.water||{},settings=water.settings||{},estimate=values?.estimate||{waterCost:0,sewerCost:0,totalCost:0},consumption=Number(values?.consumption||0),provider=locality.waterProvider||"Concessionária de água não informada";
    list.replaceChildren(row("waterConsumption","Consumo",`${formatNumber(consumption,3,locality)} m³ × ${formatMoney(Number(settings.rate||0),locality)}/m³`,formatMoney(Number(estimate.waterCost||0),locality)),row("sewer","Taxa de esgoto",`${formatNumber(Number(settings.sewerPercent||0),0,locality)}% · ${provider}`,formatMoney(Number(estimate.sewerCost||0),locality)),row("fixedFee","Taxa fixa",locality.waterProvider?`Configuração para ${provider}`:"Valor configurado",formatMoney(Number(settings.fixedFee||0),locality)),row("taxes","Impostos","Não identificado na estimativa atual","—"),row("fine","Multa","Não identificada na estimativa atual","—"),row("interest","Juros","Não identificados na estimativa atual","—")); setText("#utility-detail-title","Detalhamento de água");setText("#utility-detail-symbol","●");setText("#utility-detail-total",formatMoney(Number(estimate.totalCost||0),locality));setText("#utility-detail-note",locality.waterProvider?`Contexto reconhecido: ${provider}.`:"Valores estimados com base nas leituras e configurações atuais.");
  } else {
    const energy=snapshot.energy||{},settings=energy.settings||{},estimate=values?.estimate||{baseCost:0,flagCost:0,totalCost:0},consumption=Number(values?.consumption||0),provider=locality.energyProvider||"Concessionária de energia não informada";
    list.replaceChildren(row("energyConsumption","Consumo",`${formatNumber(consumption,0,locality)} kWh × ${formatMoney(Number(settings.rate||0),locality)}/kWh`,formatMoney(Number(estimate.baseCost||0),locality)),row("flag","Bandeira tarifária",`${flagLabel(settings.flag)}${locality.energyProvider?` · ${provider}`:""}`,formatMoney(Number(estimate.flagCost||0),locality)),row("lighting","Taxa de iluminação pública",locality.city?`Município: ${locality.city}/${locality.state||""}`:"Contribuição configurada",formatMoney(Number(settings.lightingFee||0),locality)),row("taxes","Impostos","Não identificado na estimativa atual","—"),row("fine","Multa","Não identificada na estimativa atual","—"),row("interest","Juros","Não identificados na estimativa atual","—"));setText("#utility-detail-title","Detalhamento de energia");setText("#utility-detail-symbol","ϟ");setText("#utility-detail-total",formatMoney(Number(estimate.totalCost||0),locality));setText("#utility-detail-note",locality.energyProvider?`Contexto reconhecido: ${provider}.`:"Valores estimados com base nas leituras e configurações atuais.");
  }
}

function readLocalityContext(){if(window.VOLT_LOCALITY_CONTEXT&&typeof window.VOLT_LOCALITY_CONTEXT==="object")return window.VOLT_LOCALITY_CONTEXT;try{return JSON.parse(localStorage.getItem("volt:beta:locality-context-v1")||"{}");}catch{return{};}}
function renderLocalityContext(locality){const context=detailDialog.querySelector("#utility-detail-context"),provider=activeMeter==="water"?locality.waterProvider:locality.energyProvider,parts=[[locality.city,locality.state].filter(Boolean).join(" · "),provider,locality.country==="UY"?"Uruguay":null].filter(Boolean);context.hidden=parts.length===0;context.textContent=parts.join(" · ");}
function row(key,title,subtitle,value){const item=document.createElement("div");item.className="energy-detail-row";item.dataset.kind=key;const icon=document.createElement("div");icon.className="energy-detail-icon";icon.setAttribute("aria-hidden","true");icon.textContent=icons[key]||"•";const copy=document.createElement("div");copy.className="energy-detail-copy";const strong=document.createElement("strong");strong.textContent=title;const small=document.createElement("small");small.textContent=subtitle;copy.append(strong,small);const amount=document.createElement("div");amount.className="energy-detail-value";amount.textContent=value;const info=document.createElement("button");info.type="button";info.className="energy-detail-info";info.textContent="i";info.setAttribute("aria-label",`Informação sobre ${title}`);info.addEventListener("click",e=>{e.stopPropagation();showExplanation(key,info);});item.append(icon,copy,amount,info);return item;}
function clearExplanation(){if(detailPopoverTimer)window.clearTimeout(detailPopoverTimer);detailPopoverTimer=null;detailPopover?.remove();detailPopover=null;}
function showExplanation(key,anchor){clearExplanation();const[title,text]=explanations[key]||["Informação","Detalhe indisponível."];detailPopover=document.createElement("div");detailPopover.className="energy-detail-popover";detailPopover.setAttribute("role","status");detailPopover.setAttribute("aria-live","polite");const heading=document.createElement("strong");heading.textContent=title;const paragraph=document.createElement("p");paragraph.textContent=text;detailPopover.append(heading,paragraph);ensureDialog().append(detailPopover);detailPopoverTimer=window.setTimeout(clearExplanation,6500);anchor.focus();}
function flagLabel(flag){return({green:"Bandeira verde",yellow:"Bandeira amarela",red1:"Bandeira vermelha 1",red2:"Bandeira vermelha 2"})[flag]||"Bandeira configurada";}
function setText(selector,value){const element=detailDialog?.querySelector(selector)||document.querySelector(selector);if(element)element.textContent=value;}
function formatNumber(value,digits=0,context={}){return Number(value||0).toLocaleString(context.locale||"pt-BR",{maximumFractionDigits:digits});}
