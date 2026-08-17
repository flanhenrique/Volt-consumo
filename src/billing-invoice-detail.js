import { VOLT_CONFIG } from '../config.js?v=20260813.7';
import { getApplicationStateSnapshot } from './app-state.js?v=20260813.7';
import { startBillingWorkflow, getBillingWorkflowSnapshot } from './billing-workflow.js?v=20260813.7';
import { renderEnergyInvoiceReport, buildInvoiceSummary, componentsForBill, group, classify } from './billing-invoice-report.js?v=20260817.1';

const BUILD = '20260817.1';
const CODES = ['manual_energy_consumption','manual_taxes','manual_public_lighting','manual_tariff_flag','manual_other_charges','manual_discounts','manual_other_credits'];
let queued = false;
let busy = false;

startBillingWorkflow();
loadCss();
new MutationObserver(queue).observe(document.getElementById('dashboard') || document.body, { childList: true, subtree: true });
window.addEventListener('volt:startup-status', (e) => { if (e.detail?.status === 'READY') queue(); });
document.addEventListener('submit', onSubmit, true);
document.addEventListener('click', onClick, true);
document.addEventListener('input', onInput, true);
document.addEventListener('change', onInput, true);
if (document.documentElement.dataset.startupStatus === 'READY') queue();

function queue() {
  if (queued || busy) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; enhance(); });
}

function enhance() {
  const state = getApplicationStateSnapshot();
  if (state?.status !== 'READY') return;
  let snapshot;
  try { snapshot = getBillingWorkflowSnapshot(); } catch { return; }
  if (!snapshot?.cycles) return;

  document.querySelectorAll('form[data-bill-total-form]').forEach((legacy) => {
    const cycle = snapshot.cycles.find((c) => c.id === legacy.dataset.billTotalForm);
    const unit = cycle && snapshot.units.find((u) => u.id === cycle.consumer_unit_id);
    if (unit?.service === 'energy') legacy.replaceWith(buildForm(snapshot, cycle, unit, null));
  });

  document.querySelectorAll(".volt-billing-card[data-service='energy']").forEach((card) => enhanceCard(card, snapshot));
  renderEnergyInvoiceReport(snapshot);
}

function enhanceCard(card, snapshot) {
  const cycle = snapshot.cycles.find((c) => c.id === card.dataset.cycleId);
  const unit = cycle && snapshot.units.find((u) => u.id === cycle.consumer_unit_id);
  if (!cycle || !unit) return;
  const bill = snapshot.bills.filter((b) => b.billing_cycle_id === cycle.id).sort((a,b) => Number(b.revision)-Number(a.revision))[0];
  const question = card.querySelector('.volt-billing-question .supporting-copy');
  if (question) question.textContent = 'Quando a fatura chegar, registre o consumo faturado e a composição financeira: energia, tributos, iluminação pública, bandeira, descontos e outros ajustes.';
  if (!bill) return;

  const components = componentsForBill(snapshot, bill.id);
  let summary = card.querySelector('[data-energy-bill-summary]');
  if (!summary) {
    summary = document.createElement('section');
    summary.dataset.energyBillSummary = bill.id;
    summary.className = 'volt-energy-bill-summary';
    (card.querySelector('.volt-invoice-actions') || card.lastElementChild)?.before(summary);
  }
  summary.replaceChildren(buildInvoiceSummary(bill, cycle, components, false));

  let editor = card.querySelector('[data-energy-bill-editor]');
  if (!editor) { editor = document.createElement('div'); editor.dataset.energyBillEditor = bill.id; editor.hidden = true; summary.after(editor); }
  const actions = card.querySelector('.volt-invoice-actions');
  if (actions && !actions.querySelector('[data-open-bill-detail]')) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary-button'; button.dataset.openBillDetail = bill.id; button.dataset.cycleId = cycle.id;
    button.textContent = components.length ? 'Editar detalhamento' : 'Completar detalhamento';
    actions.prepend(button);
  }
  const title = actions?.querySelector('h3'); if (title) title.textContent = 'Conferência da fatura';
}

function buildForm(snapshot, cycle, unit, bill) {
  const components = bill ? componentsForBill(snapshot, bill.id) : [];
  const v = initialValues(bill, components);
  const form = document.createElement('form');
  form.className = 'volt-billing-detail-form'; form.dataset.billDetailForm = cycle.id; form.dataset.unitId = unit.id; if (bill) form.dataset.billId = bill.id;
  const header = document.createElement('div'); header.className = 'volt-billing-detail-header';
  const strong = document.createElement('strong'); strong.textContent = bill ? 'Editar fatura detalhada' : 'Detalhar fatura do ciclo';
  const copy = document.createElement('p'); copy.className = 'supporting-copy'; copy.textContent = 'Informe os valores como aparecem na fatura. Campos sem cobrança podem permanecer em zero.';
  header.append(strong, copy); form.append(header);

  const grid = document.createElement('div'); grid.className = 'volt-billing-detail-grid';
  grid.append(
    input('Consumo faturado (kWh)','billedConsumption',v.billedConsumption,true,.001),
    select('Método de faturamento','billingMethod',v.billingMethod),
    input('Energia / consumo (R$)','energyAmount',v.energyAmount),
    input('Impostos / tributos (R$)','taxAmount',v.taxAmount), input('Impostos (%)','taxPercent',v.taxPercent,false,.0001),
    input('Iluminação pública (R$)','lightingAmount',v.lightingAmount), input('Iluminação pública (%)','lightingPercent',v.lightingPercent,false,.0001),
    input('Bandeira tarifária (R$)','flagAmount',v.flagAmount), input('Bandeira tarifária (%)','flagPercent',v.flagPercent,false,.0001),
    input('Outras cobranças (R$)','otherCharges',v.otherCharges),
    input('Descontos (R$)','discountAmount',v.discountAmount), input('Descontos (%)','discountPercent',v.discountPercent,false,.0001),
    input('Outros créditos (R$)','otherCredits',v.otherCredits),
    input('Valor total da fatura (R$)','invoiceTotal',v.invoiceTotal,true,.01)
  );
  form.append(grid);
  const balance = document.createElement('div'); balance.className = 'volt-billing-balance'; balance.dataset.billBalance = cycle.id; form.append(balance);
  const actions = document.createElement('div'); actions.className = 'volt-billing-actions';
  const save = document.createElement('button'); save.type='submit'; save.className='primary-button'; save.textContent=bill?'Salvar detalhamento':'Concluir fatura'; actions.append(save);
  if (bill) { const cancel=document.createElement('button'); cancel.type='button'; cancel.className='secondary-button'; cancel.dataset.closeBillDetail=bill.id; cancel.textContent='Cancelar'; actions.append(cancel); }
  const status=document.createElement('p'); status.className='status-message'; status.dataset.billDetailStatus=cycle.id;
  form.append(actions,status); queueMicrotask(()=>updateBalance(form)); return form;
}

function input(label,name,value,required=false,step=.01) {
  const l=document.createElement('label'),s=document.createElement('span'),i=document.createElement('input'); s.textContent=label; i.name=name;i.type='number';i.inputMode='decimal';i.min='0';i.step=String(step);i.required=required;i.value=value==null||value===''?(required?'':'0'):String(value);l.append(s,i);return l;
}
function select(label,name,value){const l=document.createElement('label'),s=document.createElement('span'),el=document.createElement('select');s.textContent=label;el.name=name;[['metered','Leitura do medidor'],['average','Média'],['estimated','Estimado'],['adjusted','Ajustado'],['not_identified','Não identificado']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;o.selected=v===value;el.append(o)});l.append(s,el);return l}

function onInput(e){const f=e.target.closest?.('[data-bill-detail-form]');if(f)updateBalance(f)}
function updateBalance(form){const v=values(form),expl=round(v.energyAmount+v.taxAmount+v.lightingAmount+v.flagAmount+v.otherCharges-v.discountAmount-v.otherCredits),diff=round(v.invoiceTotal-expl),host=form.querySelector('[data-bill-balance]');if(!host)return;host.dataset.tone=Math.abs(diff)<=.01?'success':'warning';host.replaceChildren(bm('Subtotal explicado',money(expl)),bm('Total informado',money(v.invoiceTotal)),bm('Diferença',signed(diff)))}
function bm(a,b){const d=document.createElement('div'),s=document.createElement('small'),x=document.createElement('strong');s.textContent=a;x.textContent=b;d.append(s,x);return d}

async function onSubmit(e) {
  const form=e.target.closest?.('[data-bill-detail-form]'); if(!form)return; e.preventDefault();e.stopImmediatePropagation(); if(busy)return;
  const status=form.querySelector('[data-bill-detail-status]'), button=form.querySelector("button[type='submit']"), v=values(form);
  if(!Number.isFinite(v.invoiceTotal)||v.invoiceTotal<0||!Number.isFinite(v.billedConsumption)||v.billedConsumption<0){if(status)status.textContent='Revise o consumo faturado e o valor total.';return}
  busy=true;if(button)button.disabled=true;if(status)status.textContent='Salvando fatura detalhada…';
  try{await save(form,v);if(status)status.textContent='Fatura detalhada salva.';refresh()}catch(err){console.warn('VOLT invoice detail save failed',err);if(status)status.textContent='Não foi possível salvar o detalhamento.'}finally{busy=false;if(button)button.disabled=false;setTimeout(queue,250)}
}

function onClick(e){const open=e.target.closest?.('[data-open-bill-detail]');if(open){e.preventDefault();e.stopImmediatePropagation();const s=getBillingWorkflowSnapshot(),bill=s.bills.find(b=>b.id===open.dataset.openBillDetail),cycle=s.cycles.find(c=>c.id===open.dataset.cycleId),unit=cycle&&s.units.find(u=>u.id===cycle.consumer_unit_id),editor=open.closest('.volt-billing-card')?.querySelector('[data-energy-bill-editor]');if(bill&&cycle&&unit&&editor){editor.replaceChildren(buildForm(s,cycle,unit,bill));editor.hidden=false;editor.scrollIntoView({block:'nearest',behavior:'smooth'})}return}const close=e.target.closest?.('[data-close-bill-detail]');if(close){e.preventDefault();e.stopImmediatePropagation();const editor=close.closest('[data-energy-bill-editor]');if(editor){editor.hidden=true;editor.replaceChildren()}}}

function values(form){const n=(x)=>{const v=Number(form.elements.namedItem(x)?.value);return Number.isFinite(v)?v:0},nn=(x)=>{const raw=form.elements.namedItem(x)?.value;if(raw==null||raw==='')return null;const v=Number(raw);return Number.isFinite(v)?v:null};return{billedConsumption:n('billedConsumption'),billingMethod:form.elements.namedItem('billingMethod')?.value||'not_identified',energyAmount:n('energyAmount'),taxAmount:n('taxAmount'),taxPercent:nn('taxPercent'),lightingAmount:n('lightingAmount'),lightingPercent:nn('lightingPercent'),flagAmount:n('flagAmount'),flagPercent:nn('flagPercent'),otherCharges:n('otherCharges'),discountAmount:n('discountAmount'),discountPercent:nn('discountPercent'),otherCredits:n('otherCredits'),invoiceTotal:n('invoiceTotal')}}

async function save(form,v){const s=getBillingWorkflowSnapshot(),cycle=s.cycles.find(c=>c.id===form.dataset.billDetailForm),unit=s.units.find(u=>u.id===form.dataset.unitId);if(!cycle||unit?.service!=='energy')throw new Error('energy_cycle_not_found');const estimate=s.estimates.filter(x=>x.billing_cycle_id===cycle.id).sort((a,b)=>Number(b.revision||1)-Number(a.revision||1))[0];let bill=form.dataset.billId?s.bills.find(b=>b.id===form.dataset.billId):null;
  if(!bill){const prev=s.bills.filter(b=>b.billing_cycle_id===cycle.id).sort((a,b)=>Number(b.revision)-Number(a.revision))[0],rows=await req('bills',{method:'POST',body:{organization_id:unit.organization_id,consumer_unit_id:unit.id,billing_cycle_id:cycle.id,revision:prev?Number(prev.revision)+1:1,supersedes_bill_id:prev?.id||null,billing_method:v.billingMethod,measured_consumption:estimate?.estimated_consumption??null,billed_consumption:v.billedConsumption,estimated_total:estimate?.estimated_total??null,invoice_total:round(v.invoiceTotal),currency:'BRL',source_type:'user_informed',confidence:'confirmed',status:'validated',received_at:new Date().toISOString(),input_method:'manual_detail',extraction_status:'not_analyzed',extraction_metadata:{manual_detail_version:BUILD},raw_document_retained:false},prefer:'return=representation'});bill=rows[0];if(!bill)throw new Error('bill_not_created')}
  else{const rows=await req('bills',{method:'PATCH',query:{id:`eq.${bill.id}`},body:{billing_method:v.billingMethod,billed_consumption:v.billedConsumption,invoice_total:round(v.invoiceTotal),input_method:'manual_detail',status:'validated',source_type:'user_informed',confidence:'confirmed',extraction_metadata:{...(bill.extraction_metadata||{}),manual_detail_version:BUILD,manual_detail_updated_at:new Date().toISOString()},updated_at:new Date().toISOString()},prefer:'return=representation'});bill=rows[0]||bill}
  await req('bill_components',{method:'DELETE',query:{bill_id:`eq.${bill.id}`,code:`in.(${CODES.join(',')})`},prefer:'return=minimal'});
  const parts=components(bill,v);for(const p of parts)await req('bill_components',{method:'POST',body:p,prefer:'return=representation'});
  await req('billing_cycles',{method:'PATCH',query:{id:`eq.${cycle.id}`},body:{status:'billed',bill_arrival_state:'arrived',bill_arrival_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()},prefer:'return=representation'});
  await reconcile(bill,parts);
}

function components(bill,v){const total=v.invoiceTotal,c=(position,category,code,label,direction,amount,percentage=null,quantity=null,unit=null)=>({organization_id:bill.organization_id,bill_id:bill.id,position,category,code,label,direction,quantity,quantity_unit:unit,unit_rate:quantity&&amount?Math.round(amount/quantity*1e6)/1e6:null,percentage:percentage??pct(amount,total),amount:round(Math.abs(amount||0)),source_type:'user_informed',confidence:'confirmed',evidence_text:'Detalhamento informado pelo usuário a partir da fatura.'});return[c(10,'energy',CODES[0],'Energia / consumo','charge',v.energyAmount,null,v.billedConsumption,'kWh'),c(20,'tax',CODES[1],'Impostos / tributos','charge',v.taxAmount,v.taxPercent),c(30,'lighting',CODES[2],'Iluminação pública','charge',v.lightingAmount,v.lightingPercent),c(40,'flag',CODES[3],'Bandeira tarifária','charge',v.flagAmount,v.flagPercent),c(50,'fee',CODES[4],'Outras cobranças','charge',v.otherCharges),c(60,'benefit',CODES[5],'Descontos','credit',v.discountAmount,v.discountPercent),c(70,'credit',CODES[6],'Outros créditos','credit',v.otherCredits)].filter(x=>x.amount>0||x.code===CODES[0])}

async function reconcile(bill,parts){const calc=round(parts.reduce((t,p)=>t+(p.direction==='credit'?-Number(p.amount):Number(p.amount)),0)),total=round(bill.invoice_total),diff=round(total-calc),per=total?round(Math.abs(diff)/Math.abs(total)*100):null,abs=Math.abs(diff),cls=abs<=1?'matching':abs<=5||(per!=null&&per<=3)?'small_difference':'relevant_difference',status=cls==='matching'?'reconciled':cls==='small_difference'?'partially_reconciled':'not_reconciled',payload={organization_id:bill.organization_id,bill_id:bill.id,calculated_total:Math.max(0,calc),invoice_total:total,difference_amount:diff,difference_percent:per,measured_minus_billed:bill.measured_consumption==null||bill.billed_consumption==null?null:round(Number(bill.measured_consumption)-Number(bill.billed_consumption)),classification:cls,status,engine_version:'reconciliation-manual-detail-v1',diagnostics:{basis:'manual_bill_components',component_count:parts.length},policy:{matching_amount_brl:1,small_difference_amount_brl:5,small_difference_percent:3},next_action:cls==='relevant_difference'?'Revise os itens: o subtotal detalhado ainda não fecha com o total da fatura.':null,source_type:'volt_calculated',confidence:'confirmed'};const old=(await req('reconciliations',{query:{bill_id:`eq.${bill.id}`,select:'*'}}))[0];if(old)await req('reconciliations',{method:'PATCH',query:{id:`eq.${old.id}`},body:{...payload,updated_at:new Date().toISOString()},prefer:'return=representation'});else await req('reconciliations',{method:'POST',body:payload,prefer:'return=representation'})}

function initialValues(bill,parts){const g=group(parts,bill?.invoice_total),first=(k)=>parts.find(x=>classify(x)===k&&x.percentage!=null)?.percentage??null,otherCharges=parts.filter(x=>x.direction!=='credit'&&classify(x)==='other').reduce((t,x)=>t+Number(x.amount||0),0),discount=parts.filter(x=>x.direction==='credit'&&/desconto/i.test(`${x.code} ${x.label}`)).reduce((t,x)=>t+Number(x.amount||0),0),otherCredits=parts.filter(x=>x.direction==='credit'&&!/desconto/i.test(`${x.code} ${x.label}`)).reduce((t,x)=>t+Number(x.amount||0),0);return{billedConsumption:bill?.billed_consumption??'',billingMethod:bill?.billing_method||'not_identified',energyAmount:g.energy.amount||0,taxAmount:g.tax.amount||0,taxPercent:first('tax')??g.tax.percent??0,lightingAmount:g.lighting.amount||0,lightingPercent:first('lighting')??g.lighting.percent??0,flagAmount:g.flag.amount||0,flagPercent:first('flag')??g.flag.percent??0,otherCharges:round(otherCharges),discountAmount:round(discount||Math.max(0,g.credits.amount-otherCredits)),discountPercent:g.credits.percent||0,otherCredits:round(otherCredits),invoiceTotal:bill?.invoice_total??''}}

async function req(table,{method='GET',query={},body,prefer}={}){const token=getApplicationStateSnapshot()?.session?.access_token;if(!token)throw new Error('session_required');const url=new URL(`/rest/v1/${table}`,VOLT_CONFIG.url);Object.entries(query).forEach(([k,v])=>v!=null&&url.searchParams.set(k,String(v)));const headers={apikey:VOLT_CONFIG.publishableKey,Authorization:`Bearer ${token}`,Accept:'application/json'};if(body!==undefined)headers['Content-Type']='application/json';if(prefer)headers.Prefer=prefer;const r=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw new Error(`${table}_${method}_${r.status}:${(await r.text().catch(()=>'' )).slice(0,180)}`);if(r.status===204)return[];const d=await r.json().catch(()=>[]);return Array.isArray(d)?d:d?[d]:[]}
function refresh(){window.dispatchEvent(new CustomEvent('volt:startup-status',{detail:{status:'READY'}}))}
function pct(a,t){a=Number(a);t=Number(t);return Number.isFinite(a)&&Number.isFinite(t)&&t?Math.round(Math.abs(a/t)*1e6)/1e4:null}
function round(v){return Math.round((Number(v)+Number.EPSILON)*100)/100}
function money(v){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0)}
function signed(v){v=Number(v)||0;return v<0?`− ${money(Math.abs(v))}`:v>0?`+ ${money(v)}`:money(0)}
function loadCss(){if(document.querySelector('link[data-volt-invoice-detail-style]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href=`./styles/billing-invoice-detail.css?v=${BUILD}`;l.dataset.voltInvoiceDetailStyle='true';document.head.append(l)}
