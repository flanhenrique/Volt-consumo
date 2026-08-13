# Relatório de estabilização forense do Volt

- Data: 2026-08-13
- Branch publicada: `fix/full-runtime-stabilization`
- Branch de implementação integrada: `fix/volt-bootstrap-stabilization`
- Baseline auditada: `c6145c5` (`main`)
- SHA funcional testado: `2775d5eef73d7f2131b6dbe947c3057795dfee0b`
- SHA da suíte/harness testado: `f286acca510b089fcc3ba17dd669f28f7cc9f53b`

## Resumo executivo

**Gate local: PASSOU. Gate do PR: PASSOU. Gate publicado: PASSOU.** A aplicação foi consolidada em `/` com uma entrada, um bootstrap, uma store, um renderer por tela e um Service Worker. Os testes reais locais e publicados passaram em Chromium e WebKit, desktop e mobile, sem `console.error`, `pageerror` ou `unhandledrejection` inesperados. A implementação foi integrada por merge normal ao histórico existente do PR #5, preservando seus 76 commits exclusivos, e mesclada em `main` no SHA `e42c7a67f0fd289bdbe758af637e12f52d673580`. A migração aditiva foi aplicada e verificada no Supabase de produção.

A auditoria anterior às mudanças está preservada em `FORENSIC_AUDIT_MATRIX.md`. O diff contém 114 arquivos: 2.833 inserções e 19.151 remoções.

## 1. Arquitetura encontrada

Havia duas aplicações completas: uma raiz incompleta e uma implementação `/beta` mais atual. A raiz apontava para dependências ausentes e possuía manifest e SW próprios. `/beta` carregava simultaneamente `app.js`, `startup-runtime.js`, `beta-shell.js` e `beta-v3.js`, além de módulos regionais que também controlavam auth, readiness, navegação e DOM.

O produto atual estava em `/beta`, porém dividido entre cinco autoridades de inicialização. A compatibilidade de dados no Supabase usa objetos `beta_*`; esse prefixo é de schema/compatibilidade, não uma justificativa para manter uma segunda aplicação.

## 2. Causas-raiz

1. Lifecycle concorrente: quatro controladores podiam declarar o app pronto e reagir aos mesmos eventos.
2. Readiness temporal: timers de 1,6 s, 2,4 s, 3,6 s, 5 s e 5,2 s publicavam telas antes do snapshot consolidado.
3. DOM sem ownership: Home, ciclos e Usuários eram reescritos por módulos diferentes.
4. Estado derivado da tela: módulos liam texto/inputs do DOM para reconstruir identidade, tarifa e ciclos.
5. Acesso prematuro: `setDefaultDate()` executava antes de o contrato DOM estar garantido, causando `Cannot set properties of null` e interrompendo auth.
6. SW concorrentes: raiz e beta tinham escopos/caches distintos, ambos limpavam caches além de sua propriedade e o beta clonava respostas tarde.
7. Fallback incorreto: o SW raiz devolvia `index.html` para assets ausentes, mascarando imports quebrados como JavaScript.
8. Usuários destruído: `platform-users.js` substituía `#beta-users.innerHTML` depois de `beta-shell.js` conectar listeners.
9. Admin global: polling de 25 segundos carregava diretório, flags e métricas fora do lifecycle da tela.
10. Código de onboarding/teste em produção: diálogos obrigatórios, observers e polling interceptavam navegação; o tour guiado foi a causa documentada de um smoke anterior falhar no GitHub.

## 3. Conflitos encontrados

- Auth: `app.js`, `startup-runtime.js` e módulos regionais escutavam sessão.
- Bootstrap: `startup-runtime.js`, `beta-v3.js`, `beta-shell.js` e `app.js` declaravam prontidão.
- Home: `beta-shell.js`, `separate-cycles.js`, `regional-home.js`, `regional-cycles.js` e código monolítico escreviam os mesmos elementos.
- Ciclos: observers esperavam DOM de terceiros, removiam conteúdo, injetavam inputs e interceptavam submit.
- Tarifa: `requestSubmit()` era usado como barramento interno.
- Usuários: `beta-shell.js` e `platform-users.js` eram renderers concorrentes.
- Relatórios: renderer e CSS antigos eram lazy-loaded apesar da decisão de manter a página vazia.
- Cache: dois SWs disputavam versões e removiam caches por exclusão genérica.

## 4. Arquivos removidos

Foram removidos os runtimes completos de `/beta`, incluindo `beta/app.js`, `beta/startup-runtime.js`, `beta/beta-shell.js`, `beta/beta-v3.js`, `beta/sw.js`, implementações regionais, `separate-cycles.js`, `platform-users.js`, `reports-v3.js`, seus CSS, onboarding/tour/manutenção, helpers especiais de conta de teste e packages órfãos. Também foram removidos Tesseract, tessdata e WASM porque OCR deixou de ter consumidor ativo.

Assets puros ainda necessários foram promovidos: Supabase vendor, ícones, privacidade, domínio de consumo e catálogo tarifário.

## 5. Arquivos alterados e criados

- Entradas oficiais: `index.html`, `app.js`, `styles.css`, `config.js`, `manifest.webmanifest`, `sw.js`.
- Estado e domínio: `src/app-state.js`, `src/volt-service.js`, `src/renderer.js`, `src/cycles.js`, `src/tariff.js`, `src/supabase-loader.js`.
- Compatibilidade: `beta/index.html`, `beta/redirect.js`.
- Backend: `supabase-setup.sql`, `supabase/migrations/202608130900_bootstrap_permissions.sql`, helper BFF de auth.
- Automação: workflows, updater tarifário, `package.json`, configuração Playwright e testes.
- Documentação: `README.md`, `ARCHITECTURE.md`, `FORENSIC_AUDIT_MATRIX.md` e este relatório.

## 6. Código legado removido

Foram eliminados readiness por timer, proxies de startup, observers compensatórios, polling administrativo, renderers duplicados, relatórios antigos, cards removidos, seletor visual de organização, guided experience, tutorial obrigatório, maintenance gate, runtime de OCR, resets/prefills de conta de teste, CSS de autoridade de ciclo e packages sem entrada ativa. Busca estática confirma que `Tarifas e encargos` e `Organização ativa` não existem no código ativo.

## 7. Mudanças de bootstrap

`app.js` contém a única função `bootstrap()`. Ela valida o contrato DOM, carrega Supabase, cria um cliente, registra um listener de auth, restaura a sessão, resolve MFA, carrega conta/dados/permissão mínima, produz um snapshot e somente então publica `READY`. Eventos de sessão passam por uma fila serial e o mesmo token é deduplicado. Não existe timeout de sucesso.

## 8. Mudanças de autenticação

Sem sessão, apenas Login é renderizado. Com sessão, o Dashboard permanece oculto durante restauração, conta, MFA e dados. MFA usa `listFactors()`, `getAuthenticatorAssuranceLevel()` e `challengeAndVerify()`. `SIGNED_OUT` limpa o estado privado. `TOKEN_REFRESHED` atualiza a sessão sem refazer cargas estáveis.

Nome e e-mail vêm de Supabase/store, nunca do DOM. Nome é normalizado por `display_name || name || prefixo do e-mail || Usuário`; e-mail vem de `session.user.email`. A atualização persiste via Auth, atualiza a store e renderiza de novo.

## 9. Mudanças da Home

`src/renderer.js` é o único dono. O Dashboard não aparece enquanto dados estão indefinidos; nenhum zero ou valor financeiro intermediário é publicado. Ciclos, consumo e tarifa são funções de dados. Zero só aparece quando é o resultado consolidado real. Os cards legados e o seletor de organização foram removidos.

## 10. Mudanças de ciclos

`src/cycles.js` implementa carga, normalização e atualização explícitas. Não espera outro módulo criar DOM, não observa mutações, não apaga HTML e não intercepta submit. Persistência de metadata é feita pelo service e o resultado confirmado atualiza a store.

## 11. Mudanças de Usuários

A aba deriva de `permissions.canManageUsers`. O bootstrap chama somente `beta_user_permissions()`; diretório e convites são carregados por `beta_admin_snapshot()` apenas quando a tela abre. O nó da página é estático e não é substituído. Abrir, fechar, reabrir e receber dados posteriores mantém os mesmos listeners. Não existe polling global.

A RPC nova é aditiva, `SECURITY INVOKER`, exige chamador autenticado, AAL2, e-mail autorizado e papel `owner/admin`, e tem `EXECUTE` revogado de `PUBLIC`/`anon` e concedido somente a `authenticated`. Ela não modifica tabelas ou dados. Foi aplicada no projeto Supabase `Volt Consumo` como `20260813065357_bootstrap_permissions`. A auditoria confirmou `security_definer=false`, `search_path=''`, `anon_execute=false`, `authenticated_execute=true` e resultado não autorizado `{role: null, can_manage_users: false}`.

## 12. Mudanças de Service Worker

Existe somente `sw.js` no app oficial. O clone da resposta é criado sincronicamente antes de qualquer consumo. Navegação e assets têm estratégias separadas. `index.html` só é fallback de navegação; asset inexistente conserva erro e nunca recebe HTML. Instalação sequencial falha se um asset crítico faltar.

## 13. Mudanças de cache

O cache ativo é `volt-app-v2`. `OWNED_CACHE_NAMES` enumera somente caches históricos conhecidos do Volt. A ativação remove apenas esses nomes, preservando caches alheios. Uma versão aguardando não escreve no cache da versão ativa. O teste semeia cache Volt antigo e cache não relacionado, ativa o SW e comprova a limpeza seletiva.

## 14. Mudanças de Relatórios

A aba continua ativa. `#page-reports` existe, abre e permanece sem filhos e sem texto. Renderer, lazy load, CSS e referências no SW foram apagados; a implementação antiga não é escondida por CSS.

## 15. Testes adicionados

- `tests/quality_gate.py`: contrato DOM, IDs, entrada única, imports, referências locais, padrões proibidos, Relatórios vazio, `[hidden]`, SW, manifest e checksums vendor.
- `tests/e2e/volt.spec.mjs`: cenários A–I, sessão, login, MFA, Home, Leituras, Configurações, Usuários, Relatórios, logout, Chromium/WebKit/mobile e gate de console.
- `tests/e2e/sw.spec.mjs`: registro/controle, asset 404 não-HTML, offline/online.
- `tests/browser_smoke.py`: execução local equivalente com browser real, incluindo hard reload e lifecycle de cache.
- `tests/static_server.py`: servidor de gate isolado, com assets pré-carregados, evitando que resets de um servidor externo produzam falsos resultados de startup/SW.
- Fixtures Supabase determinísticas: exercitam contratos do frontend sem mutar usuários reais.

## 16. Testes executados

No SHA funcional `2775d5eef73d7f2131b6dbe947c3057795dfee0b` e novamente no SHA de harness `f286acca510b089fcc3ba17dd669f28f7cc9f53b`:

```text
QUALITY GATE: PASSOU
Chromium: deslogado desktop/mobile, sessão completa, MFA, Usuários,
Service Worker, /beta — PASSOU
WebKit: deslogado desktop/mobile, sessão completa, MFA, Usuários,
/beta — PASSOU
BROWSER GATE: PASSOU
git diff --check — PASSOU
```

O cenário de sessão completa cobre Home, Leituras, persistência de nome com reload, Relatórios e logout. O teste SW cobre primeira visita, reload, hard reload, cache antigo, contexto novo, offline e retorno online.

## 17. Resultados

Todos os gates locais passaram. A aplicação mostrou somente Login em contexto limpo; em sessão restaurada não mostrou Login nem Home antes do snapshot; Usuários reutilizou o mesmo DOM; Relatórios permaneceu vazio; `/beta` redirecionou para `/` preservando query/hash; assets ausentes retornaram erro não-HTML; cache alheio foi preservado.

## 18. Erros de console encontrados e corrigidos

- `Cannot set properties of null (setting 'value')`: removida a inicialização prematura e criado contrato DOM validado antes do auth.
- erro do Proxy em startup: removido `startup-runtime.js` e o proxy concorrente.
- `Response body is already used` / `Response.clone()`: clone movido para antes do consumo e cache delegado a `event.waitUntil`.
- imports/arquivos mascarados por HTML: fallback de asset removido e referências locais validadas.
- cliques interceptados por diálogo obrigatório: guided experience/tutorial legado removido pela causa.

Os testes falham automaticamente em `console.error`, `pageerror` e `unhandledrejection`. O único 404 intencional é criado e classificado dentro do teste negativo do SW para comprovar que JavaScript ausente não recebe HTML.

## 19. Riscos restantes

1. Não havia credencial de usuário real disponível, portanto auth/RLS foram validados por contrato, fixture e execução sem contexto autenticado, não por mutação de conta real.
2. Safari foi representado por WebKit Playwright no Windows, no CI e contra o site publicado; teste em hardware Safari real permanece recomendável.
3. Os advisors Supabase continuam mostrando warnings preexistentes em funções administrativas `SECURITY DEFINER`, configuração de OTP/senhas e tabelas de backup; a nova RPC não adicionou warning.

## 20. Dívida técnica restante

- Os nomes `beta_*` no banco e no domínio persistem por compatibilidade de dados; renomeá-los exigiria migração separada e não faz parte desta estabilização.
- O vendor Supabase continua UMD local; uma futura atualização deve preservar versão pinada e checksum.
- O teste Python duplica parte do Playwright Node para permitir validação em máquinas sem Node; o CI usa a suíte Node oficial.
- A migração foi criada como arquivo versionado porque o CLI Supabase não está instalado neste ambiente. Antes da aplicação, deve ser conferida com o CLI atual, advisors e uma query autenticada em ambiente seguro.

## 21. Diagrama do startup antigo

```text
root app + root SW
        └── produto incompleto / fallback HTML para assets

/beta/index.html
  ├── environment -> startup-runtime (Proxy + timer READY)
  ├── app.js (auth + DOM + dados)
  ├── beta-shell (Home + Usuários + polling)
  └── beta-v3 (timers + módulos lazy)
       ├── regional-home / regional-cycles
       ├── separate-cycles (observer + submit)
       ├── platform-users (substitui DOM)
       └── reports-v3

dois SWs -> caches concorrentes -> telas e valores dependentes de timing
```

## 22. Diagrama do startup novo

```text
index.html + [hidden] estático
  -> app.js / bootstrap único
     -> Supabase loader/client único
     -> auth subscriber único + getSession
        -> SIGNED_OUT: Login
        -> MFA_REQUIRED: MFA
        -> LOADING_ACCOUNT -> LOADING_DATA
           -> identity/account/settings/readings/cycles/tariff/permissions
           -> store consolidada
           -> renderer único
           -> READY: Dashboard

sw.js único -> cache Volt explicitamente pertencente -> fallback por tipo
/beta -> redirect para /
```

## 23. Lista de commits

```text
45f2ac8 docs(audit): record pre-stabilization forensic matrix
261587d refactor(bootstrap): promote one deterministic root application
0dbf314 fix(auth): expose minimal bootstrap permission authority
67e27ad chore(tariff): publish catalog from official root
7dce53c fix(sw): isolate versioned cache and safe response cloning
0462225 test(e2e): gate startup auth navigation and service worker
d9ac906 docs(architecture): document deterministic ownership
bf578f1 test(e2e): cover MFA and cache lifecycle
2775d5e fix(auth): harden bootstrap permission RPC
60ab7d8 docs(report): record forensic stabilization results
f286acc test(e2e): isolate static server lifecycle
ac63ea0 docs(report): satisfy diff integrity gate
0373f35 merge(stabilization): consolidate deterministic root runtime
99401a5 docs(report): record Supabase and CI validation
e42c7a6 fix(runtime): consolidar bootstrap determinístico do Volt (#5)
```

## 24. SHA final testado

Código funcional e migração: `2775d5eef73d7f2131b6dbe947c3057795dfee0b`. Suíte e servidor isolado: `f286acca510b089fcc3ba17dd669f28f7cc9f53b`. Integração no histórico do PR #5: `0373f35c5ab9a4675c3b81a366853a89b77d3e4b`, com pais `9d6a26c` e `ac63ea0`. Head final da branch testado no PR: `99401a5c36f37a289e4b91379d329bac497a1af1`. Merge publicado e testado: `e42c7a67f0fd289bdbe758af637e12f52d673580`.

## 25. URL/deploy testado

- Local: `http://127.0.0.1:4173/` — PASSOU.
- CI final do PR #5, run `31675728576`: estático e browsers/SW — PASSOU.
- CI pós-merge em `main`, run `31675929059`: estático e browsers/SW — PASSOU.
- GitHub Pages, run `31675928610`: deploy — PASSOU.
- BFF, run `31675929078`: deploy — PASSOU.
- Supabase `Volt Consumo`: migração `20260813065357_bootstrap_permissions` — APLICADA E VALIDADA.
- GitHub Pages: `https://flanhenrique.github.io/Volt-consumo/` — PASSOU em Chromium/WebKit, 1440×1000 e 390×844, fresh contexts, reload, `/beta`, SW, asset 404 não-HTML e offline/online.
- Sessão autenticada publicada: não executada por ausência de credencial real; o mesmo fluxo passou no browser local/CI com provider determinístico, sem alterar contas reais.

## Critérios de aceitação do item 33

| Critério | Estado local | Evidência |
|---|---|---|
| Zero exceções JavaScript no startup | PASSOU | gate de console Chromium/WebKit |
| Zero erro de elemento `null` | PASSOU | contrato DOM + startup real |
| Zero body usado / clone | PASSOU | teste lifecycle SW |
| Zero unhandled rejection | PASSOU | listener automático nos browsers |
| Zero telas sobrepostas | PASSOU | `[hidden]` estático + asserts Login/Dashboard/páginas |
| Login e Dashboard nunca simultâneos | PASSOU | cenários deslogado, sessão, MFA e logout |
| Home sem valores intermediários falsos | PASSOU | Dashboard oculto até snapshot e observação de render |
| Nome e e-mail carregados | PASSOU | sessão/configurações |
| Nome permanece após reload | PASSOU | atualização + reload no cenário F |
| Usuários determinístico para autorizado | PASSOU | permissão mínima + cenário G |
| Usuários abre/reabre sem destruir DOM | PASSOU | identidade do nó e listeners verificados |
| Relatórios existe e está vazio | PASSOU | cenário H + contrato estático |
| Card `Tarifas e encargos` ausente | PASSOU | DOM e busca do código ativo |
| `Organização ativa` ausente da Home | PASSOU | DOM e busca do código ativo |
| Um renderer por tela | PASSOU | grafo/imports e módulos legados removidos |
| Um bootstrap | PASSOU | entrada module única e gate estático |
| Uma autoridade de estado | PASSOU | `src/app-state.js` |
| Um Service Worker oficial | PASSOU | raiz única; beta redireciona/unregister legado |
| Nenhum import local quebrado | PASSOU | quality gate |
| Nenhum módulo crítico pronto por timeout | PASSOU | busca estática e fluxo de estado |
| DOM não é fonte primária de estado | PASSOU | service/store/renderer unidirecional |
| Todos os testes locais de navegador | PASSOU | Chromium + WebKit + mobile + SW |

Conclusão local, PR e publicação: **PASSOU**. A única cobertura não executada contra produção foi sessão autenticada com credencial real, preservada deliberadamente para não alterar contas, senhas ou sessões.
