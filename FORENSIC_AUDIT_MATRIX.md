# Matriz de auditoria forense — estado anterior à estabilização

Baseline: `main` em `c6145c5` (2026-08-13). Esta matriz foi produzida antes de qualquer alteração funcional. Arquivos vendorizados foram verificados por versão, checksum e carregamento; não receberam revisão semântica linha a linha.

Legenda: **R** = requerido, **L** = legado/substituído, **C** = conflita com outro dono. “DOM” resume leitura e escrita; seletores completos permanecem rastreáveis no código baseline.

## Entradas, bootstrap e apresentação

| Arquivo | Responsabilidade | Importado por | Importa/carrega | Eventos emitidos / escutados | DOM lido / modificado | Timers / observers | RPCs / rede | Estado global | Classificação / conflito |
|---|---|---|---|---|---|---|---|---|---|
| `index.html` | Shell oficial antigo | navegador `/` | vendor, packages, `config.js`, `app.js`, `styles.css`, manifest | formulários e navegação | declara Login/Dashboard e páginas antigas | — | registra `sw.js` | — | **L/C**: aponta para arquivos inexistentes na raiz; produto incompleto |
| `app.js` | Aplicação raiz antiga monolítica | `index.html` | packages/vendor globais | auth, formulários, navegação | lê/escreve praticamente toda a UI raiz | timeouts e listeners globais | Auth, tabelas e RPCs Supabase | numerosos `current*`, clientes e caches | **L/C**: segunda aplicação independente |
| `styles.css` | CSS raiz antigo | `index.html` | — | — | regras da aplicação raiz; inclui `[hidden]` estático | — | — | — | **L** após promoção da implementação atual |
| `config.js` | configuração Supabase raiz | `index.html` | — | — | — | — | URL/chave pública | `VOLT_CONFIG` | **L/C**: duplicado por beta |
| `manifest.webmanifest` | PWA raiz | navegador | ícone raiz | — | — | — | — | — | **L/C**: segundo manifest |
| `sw.js` | Service Worker raiz | `index.html` | shell raiz | install/activate/fetch | — | lifecycle SW | `fetch`, Cache API | cache `volt-shell-v10` | **L/C** crítico: apaga caches alheios e devolve HTML para assets |
| `beta/index.html` | Shell do produto atual | navegador `/beta` | 5 entradas JS, 4 CSS, vendor, manifest | formulários e navegação | declara Login/Dashboard, formulários e diálogos legados | — | registra `beta/sw.js` | — | **R/C**: produto correto, porém múltiplas autoridades |
| `beta/environment.js` | Inicializa ambiente beta | `beta/index.html` | `app-environment`, `startup-runtime` | — | — | — | — | ambiente/runtime | **L/C**: segunda entrada e importa runtime interceptador |
| `beta/startup-runtime.js` | Proxy de Supabase e heurística de “pronto” | `environment.js` e `beta/index.html` | API global | intercepta auth, RPC, `volt:beta-data` | observa atributos/telas | `setTimeout(250/5000)`, polling | intercepta Supabase | `VOLT_STARTUP_RUNTIME`, Proxy de `VOLT_BETA_API` | **L/C** crítico: readiness por timeout; causa erro de Proxy |
| `beta/app.js` | Auth, persistência e UI legada monolítica | `beta/index.html` | domínio, auth-client, engine-core; Supabase global | muitos `volt:*`; auth; submits | lê/escreve Login, Dashboard, settings, leituras, água, cards | listeners globais; auth via `setTimeout(0)` | Auth, tabelas beta, admin/invites/health RPCs | `VOLT_BETA_API`, cliente, `current*` | **R/C**: contém contratos úteis, mas é autoridade concorrente e acessa DOM cedo |
| `beta/beta-shell.js` | Cria shell novo, Home, navegação, Usuários | `beta/index.html` | API global | `volt:beta-data`, flags/admin/metrics; focus/visibility | injeta `innerHTML` no Dashboard; move diálogos; renderiza Home e Usuários | polling 25 s; `MutationObserver` | API/RPC por wrappers | snapshot local e referências DOM | **C** crítico: dono concorrente de Home/Usuários e polling global |
| `beta/beta-v3.js` | Orquestra módulos regionais e lazy loading | `beta/index.html` | maintenance, auth/onboarding, tarifa, ciclos, Home, relatórios, usuários etc. | escuta/dispara `volt:*` | injeta estilo; altera prontidão e páginas | timeouts 1600/2400/3600/5200; idle; observers | indireto | flags de boot | **L/C** crítico: segundo bootstrap, prontidão temporal e lazy renderers |
| `beta/beta-v3.css` | ajustes do shell V3 | `beta/index.html` | — | — | estilos das páginas/cards | — | — | — | **C**: contém estilos de implementações substituídas |
| `beta/styles.css` | CSS beta legado | `beta/index.html` | — | — | estilos Login/Dashboard/formulários; `[hidden]` estático | — | — | — | **R**, a consolidar |
| `beta/volt-lumen-tokens.css` | tokens visuais | `beta/index.html` | — | — | variáveis CSS | — | — | — | **R** |
| `beta/volt-lumen-components.css` | componentes visuais | `beta/index.html` | tokens | — | componentes do shell | — | — | — | **R**, podar seletores órfãos |
| `beta/config.js` | configuração Supabase beta | `beta/index.html` | — | — | — | — | URL/chave pública | `VOLT_CONFIG` | **R/C**: duplicado pela raiz |
| `beta/manifest.webmanifest` | PWA beta | navegador | ícones beta | — | — | — | — | — | **R/C**: promover como manifest único |
| `beta/sw.js` | Service Worker beta | `beta/index.html` | shell e módulos beta | install/activate/fetch/message | — | lifecycle SW | `fetch`, Cache API, `Response.clone()` | cache `volt-beta-shell-v96` | **R/C** crítico: apaga caches alheios, contém legados e clone tardio |

## Módulos de domínio e telas beta

| Arquivo | Responsabilidade | Importado por | Importa | Eventos emitidos / escutados | DOM lido / modificado | Timers / observers | RPCs / rede | Estado global | Classificação / conflito |
|---|---|---|---|---|---|---|---|---|---|
| `beta/separate-cycles.js` | ciclos separados e cálculo exibido | `beta-v3.js` | Supabase global | `volt:cycle-context`; auth/submit | substitui configurações; escreve cards Home | `MutationObserver`, espera/retry | Auth e metadata | `VOLT_CYCLE_CONTEXT`, `VOLT_CYCLE_VALUES` | **C** crítico: espera DOM de terceiros, intercepta submit e reescreve Home |
| `beta/regional-cycles.js` | ciclo regional | `beta-v3.js` | catálogos/contexto | eventos regionais/ciclo | escreve Home e controles de ciclo | waits indiretos | — | contexto regional | **C**: terceiro escritor da Home/ciclos |
| `beta/regional-home.js` | Home regional | `beta-v3.js` | cálculos/contexto | `volt:*` regionais | escreve saudação, consumo e financeiro | waits indiretos | — | snapshot regional | **C**: quarto escritor da Home |
| `beta/regional-tariff-resolver.js` | resolve e persiste tarifa | `beta-v3.js` | catálogos nacional/sul/Uruguai | escuta contexto/dados | lê snapshot; escreve inputs ocultos; `requestSubmit()` | debounce/waits | persistência indireta pelo form | tarifa resolvida global/eventos | **C** crítico: simula interação humana e acopla DOM à persistência |
| `beta/locality-context.js` | seletor/contexto de localidade | `beta-v3.js` | `mercosur-region` | eventos de localidade | injeta/atualiza cards e formulário | listeners | metadata/API | contexto localidade | **C**: mutação paralela das configurações/Home |
| `beta/national-energy-catalog.js` | catálogo tarifário Brasil | resolver/scripts | — | — | — | — | fetch opcional de catálogo | dados puros | **R**: cálculo/dados puros |
| `beta/south-tariff-catalog.js` | tarifas do Sul | resolver | catálogo nacional | — | — | — | — | dados puros | **R** |
| `beta/uruguay-tariff-catalog.js` | tarifas Uruguai | resolver/detalhe | — | — | — | — | — | dados puros | **R** |
| `beta/mercosur-region.js` | normalização regional | módulos regionais | — | — | — | — | — | dados puros | **R** |
| `beta/energy-detail.js` | detalhe de energia | `beta-v3.js` | contexto | eventos/navegação | injeta página/detalhe | listeners | — | — | **C**: renderer dinâmico secundário |
| `beta/energy-detail.css` | estilo detalhe energia | `beta/index.html` | — | — | seletores do detalhe | — | — | — | **C**, conservar apenas se tela permanecer |
| `beta/uruguay-water-detail.js` | detalhe de água uruguaio | `beta-v3.js` | catálogo/contexto | eventos regionais | injeta detalhe | listeners | — | — | **C**: renderer dinâmico secundário |
| `beta/platform-users.js` | implementação alternativa de Usuários | lazy por `beta-v3.js` | API/Supabase | eventos admin | `#beta-users.innerHTML = ...` | listeners | `beta_platform_users_snapshot` (inexistente no SQL) | refs locais | **L/C** crítico: destrói DOM/listeners do shell |
| `beta/platform-users.css` | CSS da implementação alternativa | `beta/index.html` | — | — | seletores exclusivos | — | — | — | **L** |
| `beta/reports-v3.js` | relatório antigo | lazy por `beta-v3.js` | API | navegação/filtros | `#beta-reports.innerHTML = ...` | listeners | dados do snapshot | refs locais | **L** por decisão de produto |
| `beta/reports-v3.css` | CSS relatório antigo | `beta/index.html` | — | — | seletores exclusivos | — | — | — | **L** por decisão de produto |
| `beta/regional-auth.js` | adapta auth à região | `beta-v3.js` | Supabase global | auth e `volt:*` | altera login/cadastro | auth listener | Auth | estado regional | **C**: segunda autoridade de auth |
| `beta/regional-onboarding.js` | onboarding regional | `beta-v3.js` | API/contexto | auth/onboarding | injeta/edita onboarding | listeners/timeouts | metadata | flags onboarding | **C**: lifecycle concorrente |
| `beta/initial-bill-setup.js` | setup inicial por conta | `beta-v3.js` | API | dados/auth | injeta diálogo obrigatório | waits/listeners | metadata/settings | estado setup | **C**: bloqueia UI por efeito lateral |
| `beta/initial-bill-setup.css` | estilo setup | `beta/index.html` | — | — | diálogo setup | — | — | — | **C** |
| `beta/guided-experience.js` | tour guiado | `beta-v3.js` | API | navegação/tour | injeta `<dialog data-mandatory>` | listeners/timeouts | metadata | progresso do tour | **L/C**: bloqueou smoke autenticado real |
| `beta/guided-experience.css` | estilo tour | `beta/index.html` | — | — | diálogo/overlay | — | — | — | **L** |
| `beta/tutorial-ack.js` | aceite de tutorial | `beta-v3.js` | API | dashboard/auth | injeta diálogo | `MutationObserver`, `setInterval`, timeouts | metadata | flag aceite | **L/C**: polling e overlay concorrente |
| `beta/tutorial-ack.css` | estilo tutorial | `beta/index.html` | — | — | diálogo | — | — | — | **L** |
| `beta/maintenance-mode.js` | gate de manutenção | `beta-v3.js` | — | cliques/teclas | injeta gate e oculta app | listeners | — | bypass local | **L/C**: impede login normal e é bootstrap paralelo |
| `beta/maintenance-mode.css` | estilo do gate | `beta/index.html` | — | — | gate | — | — | — | **L** |
| `beta/test-account-reset.js` | reset especial de conta de teste | `beta-v3.js` | API | auth/dados | muta interface/dados de teste | polling/observer | Supabase | flags de teste | **L**: comportamento de teste em produção |
| `beta/test-account-onboarding-prefill.js` | prefill especial de conta de teste | `beta-v3.js` | API | auth/onboarding | preenche formulário | waits/observer | metadata | flags de teste | **L** |
| `beta/signup-confirmation.js` | confirmação de cadastro | `beta/index.html` | Auth global | submit/auth | lê/escreve formulário/feedback | listeners | Auth | — | **R**, integrar ao dono único |
| `beta/signup-confirmation.css` | estilo de confirmação | `beta/index.html` | — | — | formulário | — | — | — | **R**, consolidar |
| `beta/cycle-authority.css` | correções visuais de disputa de ciclos | `beta/index.html` | — | — | força aparência/visibilidade de ciclos | — | — | — | **L**: CSS compensando ownership quebrado |
| `beta/privacy.html` | política de privacidade | link direto | CSS inline/externo | — | documento estático | — | — | — | **R**, promover/ajustar links |
| `beta/PERFORMANCE-CLEANUP.md` | registro de limpeza anterior | humano | — | — | — | — | — | — | **L** documental/desatualizado |
| `beta/runtime-regression-checklist.md` | checklist manual anterior | humano | — | — | — | — | — | — | **L** após testes executáveis |

## Packages próprios

| Arquivo | Responsabilidade | Importado por | Importa | Eventos / DOM / timers | RPCs | Estado | Classificação |
|---|---|---|---|---|---|---|---|
| `beta/packages/consumption-domain/browser/index.js` | validação, consumo, projeção, energia e água | `beta/app.js` | — | nenhum efeito lateral | — | funções puras | **R** |
| `beta/packages/auth-client/browser/index.js` | validação de cadastro/auth | `beta/app.js` | — | nenhum efeito lateral | — | funções puras | **R** |
| `beta/packages/app-environment/browser/index.js` | resolve oficial/beta | `environment.js` | — | lê URL | — | objeto de ambiente | **L** após app único |
| `beta/packages/engine-core/browser/index.js` | fachada do engine | `beta/app.js` | contracts | nenhum DOM | — | engine em memória | **R?**, validar uso final |
| `beta/packages/engine-core/browser/consumption-contracts.js` | contratos do engine | engine-core | — | nenhum | — | funções puras | **R?** |
| `beta/packages/calculation-engine/browser/index.js` | cálculo alternativo | nenhuma entrada ativa comprovada | imports bare `@volt/*` | nenhum | — | funções puras | **L** órfão/import quebrado fora bundler |
| `beta/packages/rule-engine/browser/index.js` | regras alternativas | nenhuma entrada ativa comprovada | consumption-rules | nenhum | — | funções puras | **L** órfão |
| `beta/packages/rule-engine/browser/consumption-rules.js` | regras de consumo | rule-engine | imports bare | nenhum | — | funções puras | **L** órfão |
| `beta/packages/engine-platform/browser/index.js` | fachada de plataforma | nenhuma entrada ativa | runtime/platform | nenhum | — | funções | **L** órfão |
| `beta/packages/engine-platform/browser/runtime.js` | runtime alternativo | engine-platform | imports bare | nenhum | — | runtime | **L** órfão |
| `beta/packages/engine-platform/browser/consumption-platform.js` | plataforma alternativa | engine-platform | imports bare | nenhum | — | funções | **L** órfão |

## Backend, SQL, automação e documentação

| Arquivo | Responsabilidade | Consumidor/importador | RPCs/rede/estado | DOM/eventos/timers | Necessidade / risco |
|---|---|---|---|---|---|
| `supabase-setup.sql` | schema/RLS/RPCs históricos da beta | implantação/manual; frontend | define tabelas `beta_*`, organizações, convites, admin, flags, métricas, saúde | — | **R**; não executar destrutivamente; `beta_platform_users_snapshot` não existe |
| `supabase/migrations/202608032145_identity_dual_write.sql` | migração compatível de identidade | Supabase CLI | metadata/profile dual write | — | **R**; preservar dados |
| `supabase/migrations/202608032205_password_recovery.sql` | recuperação de senha | Supabase CLI/Auth | auth recovery | — | **R** |
| `supabase/migrations/202608032225_mfa_backup_codes.sql` | códigos de backup MFA | Supabase CLI/Auth | tabela/funções MFA | — | **R** |
| `supabase/functions/_shared/auth-login-core.mjs` | núcleo BFF login | edge function/testes | Auth/HTTP | — | **R** |
| `supabase/functions/auth-login/index.ts` | endpoint BFF login | deploy workflow | Auth/HTTP | — | **R** |
| `supabase/functions/_shared/health-core.mjs` | núcleo health | edge function/testes | health/HTTP | — | **R** |
| `supabase/functions/health/index.ts` | endpoint health | deploy workflow | health/HTTP | — | **R** |
| `scripts/update-national-energy-tariffs.mjs` | atualiza catálogo tarifário | workflow | fontes externas/GitHub | — | **R**, executar apenas no workflow autorizado |
| `scripts/auth-migration-rollback-rehearsal.sql` | ensaio de rollback auth | operação manual | SQL transacional | — | **R** documental/operacional |
| `.github/workflows/beta-quality-gate.yml` | gate beta anterior | GitHub Actions | checkout/node/python | regex/syntax; preserva `MutationObserver` ruim | **L/C**: CI não prova inicialização e codifica arquitetura quebrada |
| `.github/workflows/beta-backup.yml` | backup/restore rehearsal | GitHub Actions | Supabase/artefatos | schedule/manual | **R**; notificações registram falhas a investigar sem apagar dados |
| `.github/workflows/deploy-beta-auth-bff.yml` | deploy auth BFF | GitHub Actions | Supabase deploy | push/manual | **R**, atualizar paths após promoção |
| `.github/workflows/deploy-beta-health.yml` | deploy health | GitHub Actions | Supabase deploy | push/manual | **R**, atualizar paths após promoção |
| `.github/workflows/update-national-tariffs.yml` | atualização de tarifas | GitHub Actions | fontes/GitHub commit | schedule/manual | **R**, notificações registram falhas |
| `README.md` | documentação atual | humano | — | — | **R**, atualizar arquitetura/execução |
| `docs/runbooks/AUTH-MIGRATION-ROLLBACK-BETA.md` | runbook de rollback | humano | Supabase | — | **R**, renomeação posterior opcional |

## Assets e vendor

| Grupo | Validação | Resultado baseline | Decisão |
|---|---|---|---|
| `beta/vendor/supabase/supabase.min.js` | identificação interna + SHA-256 | `gotrue-js 2.65.0`; checksum válido | promover como dependência única, manter carregamento local |
| `beta/vendor/tesseract/*` | versão interna + `SHA256SUMS` | Tesseract `5.1.1`; WASM/tessdata válidos. Seis JS diferem apenas por checkout CRLF; hash após normalização LF coincide exatamente | adicionar `.gitattributes` para integridade reproduzível; OCR não participa do auth/bootstrap |
| `beta/icon-192.png`, `beta/icon-512.png`, `beta/icon.svg` | existência/referência | válidos e referidos pelo manifest | promover para raiz |
| `icon.svg` raiz | existência/referência | pertence ao app antigo | substituir pelo conjunto oficial |

## Grafo de inicialização encontrado

```text
/beta/index.html
├─ environment.js ──> startup-runtime.js ──> Proxy Supabase/API + timeout de ready
├─ startup-runtime.js (entrada redundante)
├─ app.js ──> auth + sessão + dados + DOM legado
├─ beta-shell.js ──> shell + Home + Usuários + polling administrativo
└─ beta-v3.js ──> manutenção + auth regional + onboarding + ciclos + tarifa
                 ├─ regional-home.js (Home)
                 ├─ separate-cycles.js (Home/ciclos/novo auth)
                 ├─ regional-cycles.js (Home/ciclos)
                 ├─ reports-v3.js (lazy, substitui DOM)
                 └─ platform-users.js (lazy, substitui DOM)
```

## Conclusões que condicionam a mudança

1. A raiz não é publicável: suas referências locais não existem e seu Service Worker mascara esse defeito devolvendo HTML para assets.
2. `/beta` contém o produto funcional mais recente, mas não possui uma autoridade de lifecycle. `app.js`, `startup-runtime.js`, `beta-shell.js` e `beta-v3.js` controlam prontidão, sessão ou telas.
3. Home possui pelo menos quatro escritores. Usuários e Relatórios possuem dois renderers destrutivos por página.
4. O erro `Cannot set properties of null` nasce de `setDefaultDate()` executado antes de validar o contrato/lifecycle do DOM; não é um caso para simplesmente ignorar elemento ausente.
5. O erro de `Response.clone()` e a mistura de versões são consequência de ownership/cache/lifecycle incorretos nos dois Service Workers.
6. A estabilização exige promover o produto beta para `/`, transformar `/beta` em compatibilidade sem runtime próprio e remover interceptadores/renderers substituídos, preservando módulos de domínio puros e contratos Supabase existentes.
