# VOLT — Fundação de domínio

## Objetivo

Evoluir o VOLT de monitor de consumo para uma plataforma que acompanha, prevê, explica e concilia contas de energia e água sem aumentar a complexidade do cadastro inicial.

A unidade central do domínio é a **unidade consumidora**, e a unidade temporal principal é o **ciclo de faturamento**. Mês civil é apenas uma visão secundária.

## Estado de transição

O frontend principal ainda mantém `beta_*` como caminho operacional compatível para leituras e preferências durante a janela de rollback. Desde a Fase 2, leituras novas e alterações relevantes de metadados são espelhadas automaticamente no modelo canônico por triggers privados.

Faturamento, estimativas congeladas, conciliação, catálogo regulatório, extrações de fatura e PDF executivo já usam o domínio canônico.

Ativos preservados e evoluídos:

- `src/volt-service.js`: autenticação, settings e compatibilidade;
- `src/billing-workflow.js`: ciclo → fatura → conciliação → OCR/PDF;
- `src/cycles.js`: cálculo puro de ciclos;
- `packages/consumption-domain/browser/billing-engine.js`: cálculo financeiro;
- `src/regulatory-engine.js`: resolução do catálogo regulatório SQL;
- `src/invoice-ocr.js`: extração local de imagens de fatura com validação humana;
- `src/executive-pdf.js`: PDF executivo;
- `src/reports.js` e `src/consumption-report-*`: relatórios por ciclo.

## Modelo canônico

```text
auth.users
    ↓
beta_organizations / beta_memberships
    ↓
consumer_units
    ↓
billing_cycles
    ├── unit_meter_readings
    ├── bill_estimates
    └── bills
          ├── bill_components
          ├── bill_extractions
          └── reconciliations

consumer_units
    ├── regulatory_profiles
    └── rule_applications ── regulatory_rules
                              └── bill_components
```

### Unidades, ciclos e leituras

`consumer_units` representa um único serviço: energia em `kWh` ou água em `m3`. Localidade, distribuidora, classe, subclasse, sistema e preferência de ciclo pertencem à unidade, não ao CPF.

`billing_cycles` guarda datas exatas e estado próprio. `bill_arrival_state` registra `not_asked`, `not_arrived` ou `arrived`. Ocorrências automáticas só são criadas quando existe preferência de ciclo explícita; backfill histórico exige datas exatas identificadas.

`unit_meter_readings` é o destino canônico. Durante a janela de rollback, leituras em `beta_meter_readings`/`beta_water_readings` são espelhadas por triggers privados.

### Estimativa e fatura

`bill_estimates` congela a estimativa disponível no fechamento do ciclo, incluindo versão do motor, inputs, output, proveniência e confiança. Comparações históricas usam esse snapshot e não recalculam o passado com regra nova.

Em `bills`, `measured_consumption` e `billed_consumption` são campos diferentes. `estimated_total` e `invoice_total` também são diferentes. Uma revisão de fatura gera nova versão.

`raw_document_retained` é forçado a `false`: a implementação atual não guarda a imagem original da fatura.

### Componentes e extrações

`bill_components` representa energia, água, bandeira, tributos, CIP/COSIP, esgoto, taxas, descontos, subvenções, créditos, compensações e ajustes. Quantidade, unidade, tarifa unitária, percentual e valor são separados. Valor desconhecido permanece `NULL`.

`bill_extractions` persiste somente campos estruturados confirmados, confiança por campo, versão do extrator e estado de validação. A imagem é processada no navegador e descartada.

A automação atual aceita **imagem de fatura** e usa `TextDetector` quando o navegador disponibiliza essa API. Se a API não existir ou a leitura falhar, o fluxo retorna ao total manual. PDF-imagem de fatura não possui OCR automático nesta etapa.

### Catálogo regulatório

`regulatory_rules` é versionado; conteúdo publicado é imutável e mudança legal/tarifária exige nova versão. Resolução considera serviço, jurisdição, país/UF/município, distribuidora, vigência, condições, prioridade e versão.

Carga inicial:

- Tarifa Social: gratuidade da energia consumida até 80 kWh, condicionada a perfil regulatório compatível;
- Bônus Itaipu: mecanismo regulatório identificado, mas `forecastable=false`; valor só entra quando efetivamente identificado na fatura.

`regulatory_profiles` mantém `not_analyzed`, `possible`, `apparent_eligible`, `confirmed_on_bill` ou `not_identified`.

`rule_applications` liga a regra ao `bill_component` identificado, impedindo dupla contagem do mesmo efeito.

### Reconciliação

`reconciliations` persiste referência calculada, valor real, diferença absoluta/percentual, diferença medido−faturado, classificação, versão do motor, política e próxima ação.

Política atual:

- `matching`: diferença absoluta até R$ 1,00;
- `small_difference`: até R$ 5,00 ou até 3%;
- `relevant_difference`: acima desses limites.

Estados: `reconciled`, `partially_reconciled`, `not_reconciled`.

## Proveniência e confiança

`source_type`: `volt_measured`, `user_informed`, `bill_identified`, `volt_calculated`, `rule_predicted`.

`confidence`: `confirmed`, `probable`, `not_identified`.

Fonte e confiança não são sinônimos. OCR pode identificar um campo com confiança provável; confirmação humana pode elevar a confiança sem alterar sua origem.

## RLS e isolamento

Todas as tabelas canônicas expostas têm RLS habilitado e forçado. O isolamento é por `organization_id` e membership ativa. Funções auxiliares/triggers ficam em `volt_private`, com `search_path = ''` e sem `EXECUTE` direto para papéis públicos quando desnecessário.

O catálogo regulatório é leitura global autenticada; escrita não é permitida pelo frontend.

## Fase 2 — migração de leituras

Estratégia **expand/contract**:

1. `beta_*` permanece como compatibilidade/rollback de leituras;
2. unidades foram criadas apenas com evidência real;
3. localidade/distribuidora disponíveis foram copiadas sem inventar valores;
4. preferência de ciclo foi migrada apenas quando válida;
5. histórico de ciclo exigiu datas exatas;
6. leituras foram copiadas preservando valor/timestamp;
7. `EXCEPT` nos dois sentidos confirmou paridade;
8. triggers mantêm dual-write;
9. alterações de localidade/ciclo são refletidas nas unidades.

Checkpoint: 6 unidades (5 energia + 1 água), 39 leituras (36 energia + 3 água), zero faltantes/extras e nenhum dado fictício após testes de rollback.

## Fases 3–5 — chegada, valor real e conciliação

```text
ciclo fecha
→ snapshot em bill_estimates
→ awaiting_bill
→ “Sua fatura chegou?”
   → não: not_arrived; sem insistência
   → sim: arrived
→ usuário informa o total
→ bills.invoice_total
→ comparação com o snapshot
→ matching | small_difference | relevant_difference
→ detalhamento opcional se necessário
→ reconciled | partially_reconciled | not_reconciled
```

A interface mantém consumo medido, consumo faturado, estimativa e fatura real em campos separados.

## Fases 6–7 — catálogo e motor regulatório

`src/regulatory-engine.js` resolve regras por serviço, geografia, vigência e perfil da unidade.

O billing engine suporta `free_kwh_credit`, calculando a gratuidade sobre o custo efetivo dos primeiros N kWh das faixas tarifárias. Créditos anuais sem valor confirmado não entram em previsão.

O antigo `data/energy-billing-profiles.js` ficou apenas como shim de compatibilidade e não é mais fonte de regras regulatórias.

## Fase 8 — análise de fatura por imagem

`src/invoice-ocr.js` extrai, quando presentes:

- prestadora/distribuidora e classe;
- ciclo, leituras e consumo faturado;
- método de faturamento, vencimento e total;
- energia/água por linha, quantidade/unidade e tarifa unitária;
- percentual;
- ICMS, PIS, COFINS;
- CIP/COSIP/iluminação, esgoto, bandeira;
- Tarifa Social/Subvenção Baixa Renda;
- Itaipu, créditos/compensações;
- multas, juros, taxas e encargos.

Todo resultado é sugestão até confirmação humana. Só depois da confirmação os dados estruturados são gravados.

## Fase 9 — PDF executivo

`src/executive-pdf.js` gera PDF real (`%PDF-1.4`) sem biblioteca externa, contendo unidade/ciclo, medido vs faturado, estimativa vs valor real, conciliação, componentes, perfis regulatórios, proveniência e confiança.

O PDF pode ser gerado pelo card da fatura e pela seção Financeiro dos relatórios.

## Relatórios

A ordem funcional é preservada:

1. Consumo;
2. Comparação;
3. Financeiro.

A seção financeira só usa fatura real registrada. Energia e água permanecem separadas; não há soma de `kWh` com `m3`.

## Privacidade

O cadastro principal não ganhou campos regulatórios/sensíveis. A análise começa pela fatura. A imagem original não é retida; o banco força `raw_document_retained=false` e o checkpoint de produção possui zero documentos brutos retidos.

Conteúdo de fatura, identificador sensível e resposta sobre benefício não devem ir para logs ou analytics.

## Gates

- `node --check` para JavaScript;
- `tests/quality_gate.py` para DOM/imports/Service Worker;
- `tests/billing-domain.test.mjs` para regras, OCR e PDF;
- helpers de backend;
- Playwright Chromium + WebKit;
- migrations Supabase ↔ GitHub sincronizadas;
- RLS/GRANT e advisors revisados;
- teste transacional de ciclo → estimativa → fatura → reconciliação → extração com rollback;
- paridade das 39 leituras preservada.

## Status

- **Fase 1 — concluída:** fundação SQL, RLS e proveniência.
- **Fase 2 — concluída:** unidades, backfill, ciclos e dual-write.
- **Fase 3 — implementada:** “Sua fatura chegou?”.
- **Fase 4 — implementada:** valor real e comparação com snapshot.
- **Fase 5 — implementada:** reconciliação progressiva.
- **Fase 6 — implementada:** catálogo regulatório inicial verificável.
- **Fase 7 — implementada:** motor usando catálogo SQL.
- **Fase 8 — implementada para imagens:** OCR local + confirmação humana + fallback manual.
- **Fase 9 — implementada:** PDF executivo.

A remoção definitiva de `beta_*` deve ocorrer somente após janela de estabilidade e cutover explícito de contrato.
