# Arquitetura do Volt

## Princípio central

Existe uma aplicação oficial em `/`, uma entrada JavaScript (`app.js`), uma store, um cliente Supabase, uma autoridade de lifecycle e um Service Worker. `/beta` apenas redireciona para a raiz.

A unidade de domínio é a **unidade consumidora** e a unidade temporal principal é o **ciclo de faturamento**. Energia e água são serviços separados e nunca compartilham unidade de medida.

## Startup

```text
index.html
  -> app.js / bootstrap()
     -> Supabase runtime
     -> único client + único onAuthStateChange
     -> getSession()
        -> SIGNED_OUT
        -> ou LOADING_ACCOUNT
           -> MFA
           -> LOADING_DATA
           -> identidade + organização + leituras + settings + regras SQL best-effort
           -> READY
              -> renderer principal
              -> evento volt:startup-status
              -> billing-workflow canônico
```

`READY` só vem da store. `src/app-state.js` publica o snapshot atual, atualiza `data-startup-status` e emite `volt:startup-status`. O workflow financeiro é carregado dinamicamente e isolado: uma falha nele não derruba login, leituras ou consumo.

## Estados

`BOOTING`, `SIGNED_OUT`, `RESTORING_SESSION`, `MFA_REQUIRED`, `LOADING_ACCOUNT`, `LOADING_DATA`, `READY`, `ERROR`.

## Ownership

| Responsabilidade | Dono | Regra |
|---|---|---|
| lifecycle/auth | `app.js` | serializa mudanças de sessão e publica `READY` |
| estado | `src/app-state.js` | snapshot em memória; DOM não é banco de dados |
| auth/settings/compatibilidade | `src/volt-service.js` | um cliente Supabase; fallback seguro para catálogo SQL |
| render principal | `src/renderer.js` | Home, Leituras, Configurações, Usuários e navegação |
| faturamento canônico | `src/billing-workflow.js` | ciclo → estimate → fatura → reconciliação → OCR/PDF |
| ciclos | `src/cycles.js` | cálculo puro; ocorrência persistida só com evidência/preferência |
| consumo | `packages/consumption-domain/browser/index.js` | funções puras |
| faturamento | `packages/consumption-domain/browser/billing-engine.js` | faixas, bandeira, cobranças, benefícios e separação medido/faturado |
| regras | `src/regulatory-engine.js` + `regulatory_rules` | resolução por vigência/geografia/perfil |
| OCR de fatura | `src/invoice-ocr.js` | processamento local de imagem + validação humana |
| PDF executivo | `src/executive-pdf.js` | PDF real sem dependência externa |
| relatórios | `src/reports.js` + `src/consumption-report-*` | Consumo → Comparação → Financeiro |
| offline | `sw.js` | coorte atômica `RELEASE_ID=20260813.7` |
| compatibilidade antiga | `beta/index.html` + `beta/redirect.js` | redirecionamento apenas |

## Fluxo de dados

```text
Supabase / funções puras
        ↓
store + domínio canônico
        ↓
renderer / billing-workflow
        ↓
DOM
```

Leituras ainda têm caminho de escrita compatível em `beta_*`, com dual-write privado para `unit_meter_readings`. Faturamento, estimativas, reconciliação, regras e extrações já usam o domínio canônico.

## Backend canônico

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
```

Todas as tabelas canônicas expostas têm RLS habilitado e `FORCE ROW LEVEL SECURITY`. Isolamento privado é por organização/membership. Helpers e triggers ficam em `volt_private` sem exposição direta desnecessária.

## Ciclos e estimativas

`consumer_units.cycle_start_day/cycle_end_day` guarda preferência, não histórico.

`billing_cycles` guarda datas exatas. O workflow cria ciclo operacional apenas quando existe preferência explícita; backfill histórico exige datas reais identificadas.

Quando um ciclo fecha e há dados suficientes, `bill_estimates` congela consumo/total e a versão do motor. Essa estimativa é a referência histórica da comparação e não é recalculada retroativamente.

## Fatura e conciliação

Fluxo:

```text
ciclo fechado
→ “Sua fatura chegou?”
   → não: aguardar sem insistência
   → sim: pedir somente o total
→ bills.invoice_total
→ comparar com bill_estimates
→ matching | small_difference | relevant_difference
→ detalhamento opcional
→ bill_components
→ reconciliations
```

`bills.measured_consumption` e `bills.billed_consumption` são independentes. O mesmo vale para estimativa e total real.

A política atual classifica até R$ 1 como `matching`, até R$ 5 ou 3% como `small_difference` e o restante como `relevant_difference`. A política é persistida na reconciliação.

## Regras regulatórias

`regulatory_rules` é catálogo versionado. Conteúdo publicado é imutável; mudança exige nova versão.

`src/regulatory-engine.js` filtra por serviço, geografia, vigência e perfil. `regulatory_profiles` nunca converte hipótese em direito confirmado.

`rule_applications.bill_component_id` liga um efeito regulatório à linha real da fatura. Isso impede dupla contagem.

Carga inicial intencionalmente pequena:

- Tarifa Social até 80 kWh para perfil compatível;
- Bônus Itaipu como crédito não previsível até existir valor identificado na fatura.

O perfil hardcoded anterior em `data/energy-billing-profiles.js` não é mais autoridade.

## OCR e privacidade

`src/invoice-ocr.js` usa `TextDetector` quando disponível e processa **imagens** localmente. Sugestões só são persistidas após confirmação humana.

Campos estruturados podem incluir prestadora, classe, ciclo, leituras, consumo faturado, método de faturamento, vencimento, total, quantidade/unidade, tarifa unitária, percentual, impostos, iluminação, esgoto, bandeira, benefícios, créditos e taxas.

A imagem original não é enviada ao Supabase. `bills.raw_document_retained` é forçado a `false`. Quando OCR não está disponível, o total manual continua sendo o caminho mínimo. PDF-imagem de fatura não tem OCR automático nesta versão.

## PDF executivo

`src/executive-pdf.js` produz `%PDF-1.4` e inclui:

- unidade/ciclo;
- medido pelo VOLT vs faturado pela concessionária;
- estimativa vs valor real;
- conciliação/diferença;
- componentes;
- regras/perfis;
- proveniência/confiança.

## Relatórios

Relatórios mantêm a ordem funcional:

1. Consumo;
2. Comparação;
3. Financeiro.

A seção Financeiro usa apenas fatura real registrada. Energia e água continuam separadas; não existe soma de `kWh` com `m³`.

## Service Worker

- único `sw.js`, escopo `./`;
- publicação atômica por `RELEASE_ID` compartilhado;
- módulos novos de billing/regulação/OCR/PDF fazem parte do shell offline;
- network-first para navegação e assets;
- fallback somente para o próprio asset em cache;
- caches alheios não são removidos.

## Segurança

O domínio novo não adiciona RPC pública `SECURITY DEFINER`. Helpers privados permanecem em `volt_private`.

Avisos atuais do advisor sobre RPCs `beta_*`, prazo de OTP e leaked-password protection são dívida anterior e devem ser tratados separadamente, sem revogar em massa funções que ainda sustentam autenticação/administração.

## Gates

- `node --check` em JS/MJS;
- `tests/quality_gate.py`: DOM, imports, referências e Service Worker;
- `tests/billing-domain.test.mjs`: Tarifa Social, Itaipu não previsível, OCR estruturado e PDF;
- helpers backend;
- Playwright em Chromium e WebKit;
- migrations Supabase ↔ GitHub alinhadas;
- RLS/GRANT + advisors;
- teste SQL transacional ciclo → estimate → bill → reconciliation → extraction com rollback;
- paridade das 39 leituras antes de qualquer remoção de `beta_*`.

Detalhes de domínio e fases: `docs/VOLT-DOMAIN-FOUNDATION.md`.
