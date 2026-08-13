# Arquitetura do Volt

## Princípio central

Existe uma aplicação oficial em `/`, uma entrada JavaScript (`app.js`), uma store, um cliente Supabase, uma autoridade de lifecycle e um Service Worker. `/beta` não possui runtime de produto; apenas preserva query string e hash ao redirecionar para a raiz.

## Startup

```text
index.html (proteção estática [hidden])
  -> app.js / bootstrap()
     -> carrega runtime Supabase e cria um único client
     -> registra um único onAuthStateChange
     -> getSession()
        -> sem sessão: SIGNED_OUT -> Login
        -> sessão: LOADING_ACCOUNT
           -> resolve MFA
              -> necessária: MFA_REQUIRED
              -> satisfeita: LOADING_DATA
                 -> identidade + organização + leituras + settings
                 -> ciclos + tarifa + permissão mínima
                 -> snapshot consolidado
                 -> READY -> render único -> Dashboard
```

`READY` nunca é produzido por relógio, observer, polling ou animação. Uma falha produz `ERROR`; timeouts, quando futuramente necessários para rede, só podem produzir falha explícita.

## Estados

`src/app-state.js` define:

- `BOOTING`
- `SIGNED_OUT`
- `RESTORING_SESSION`
- `MFA_REQUIRED`
- `LOADING_ACCOUNT`
- `LOADING_DATA`
- `READY`
- `ERROR`

O renderer deriva a visibilidade exclusivamente desse estado. Login, MFA, erro e Dashboard não escrevem a visibilidade uns dos outros.

## Ownership

| Responsabilidade | Dono | Regra |
|---|---|---|
| lifecycle/bootstrap/auth events | `app.js` | uma fila serializa mudanças de sessão e deduplica o mesmo token |
| estado privado e startup | `src/app-state.js` | snapshot em memória; DOM nunca é fonte de identidade ou dados |
| Supabase, tabelas e RPCs | `src/volt-service.js` | um cliente; funções retornam dados e não acessam DOM |
| Home, Leituras, Usuários, Configurações e navegação | `src/renderer.js` | um renderer; usa `textContent`, `replaceChildren` e valores da store |
| ciclos | `src/cycles.js` | cálculo puro e persistência explícita via service |
| tarifa | `src/tariff.js` + `data/national-energy-catalog.js` | resolução pura; persistência por função, nunca `requestSubmit()` |
| cálculos de consumo | `packages/consumption-domain/browser/index.js` | funções puras |
| cache/offline | `sw.js` | escopo `/`; cache versionado e explicitamente pertencente ao Volt |
| compatibilidade antiga | `beta/index.html` + `beta/redirect.js` | redirecionamento; nenhum bootstrap, store ou SW próprio |

## Store

O snapshot representa `session`, `user`, `identity`, `account`, `readings`, `settings`, `cycles`, `tariff`, `locality`, `permissions`, `organization`, `admin`, página ativa, status e erro.

Dados fluem em uma direção:

```text
Supabase / funções puras -> store -> renderer -> DOM
```

Formulários chamam funções explícitas do service; o resultado confirmado atualiza a store. Nenhuma rotina lê texto da tela para reconstruir identidade, contexto ou valores financeiros.

## Auth e identidade

- `getSession()` restaura a sessão uma vez.
- `onAuthStateChange()` existe uma vez e trata eventos posteriores.
- `INITIAL_SESSION` redundante é ignorado durante a restauração inicial.
- `SIGNED_IN` do provedor e o retorno do formulário convergem para a mesma fila e o mesmo identificador de sessão.
- `TOKEN_REFRESHED` atualiza a sessão sem recarregar dados estáveis.
- `SIGNED_OUT` limpa todo estado privado.
- MFA bloqueia o Dashboard até AAL2 quando há fator verificado.
- nome: `display_name || name || prefixo do e-mail || "Usuário"`.
- e-mail: `session.user.email`.

## DOM contract

Todos os elementos obrigatórios estão presentes estaticamente em `index.html` antes da entrada module. `src/renderer.js` valida seus IDs antes do bootstrap. Elementos opcionais só podem ser consultados como opcionais fora do caminho crítico.

`styles.css`, carregado no `<head>`, contém:

```css
[hidden] { display: none !important; }
```

Portanto, uma falha JavaScript não sobrepõe Login, Dashboard ou páginas internas.

## Home e valores financeiros

Somente `src/renderer.js` escreve na Home. Ciclos e cálculos retornam dados. O Dashboard permanece oculto em todos os estados de carregamento; números são escritos no mesmo render síncrono que publica `READY`. Zero é exibido somente depois que coleções e configurações foram carregadas e o cálculo consolidado realmente resultou em zero.

## Usuários e administração

O bootstrap chama apenas `beta_user_permissions()`, que retorna papel e autorização mínima usando a mesma autoridade do banco. A função é `SECURITY INVOKER`, exige `auth.uid()`, AAL2, identidade administrativa e papel `owner/admin`; `PUBLIC` e `anon` não recebem `EXECUTE`. O diretório global (`beta_platform_users_snapshot`) só é solicitado ao abrir Usuários. Ele lista todas as contas de `auth.users` sem expor credenciais, tokens ou sessões e exige identidade administrativa explícita, AAL2 e membership ativa `owner/admin`. A página é estática e reusada; abrir/fechar/reabrir não substitui o nó nem perde listeners. Não existe polling administrativo nem renderer de organização na tela.

## Relatórios

A rota e a aba existem. `#page-reports` permanece sem filhos e sem texto. Não há renderer, lazy import ou CSS de relatório.

## Service Worker

- um registro em `./sw.js`, escopo `./`;
- cada publicação define um `RELEASE_ID` único compartilhado por HTML, import graph, dependências dinâmicas e Service Worker;
- assets mutáveis usam `?v=<RELEASE_ID>`, portanto um worker anterior nunca pode devolver um módulo incompatível de uma release passada;
- `volt-app-v4-atomic-<RELEASE_ID>` é instalado separadamente do cache ativo anterior;
- instalação sequencial evita saturar origens simples e continua sendo atômica: qualquer asset crítico ausente falha a instalação;
- `skipWaiting()` só ocorre depois que todos os assets críticos formaram a nova coorte de cache;
- ativação remove somente nomes enumerados em `OWNED_CACHE_NAMES`;
- navegações usam network-first e podem cair em `index.html`;
- assets usam network-first e podem cair apenas no próprio asset em cache;
- uma resposta HTTP de asset não-ok vira erro com o mesmo status, nunca HTML;
- `response.clone()` ocorre imediatamente, antes de qualquer consumo, e a cópia é entregue ao cache por `event.waitUntil`.

O registro do worker acontece antes da restauração de autenticação, para que uma falha posterior de sessão ou renderização não impeça a atualização. A limpeza da versão anterior ocorre somente na ativação da nova versão; caches alheios continuam intocados.

## Backend

O frontend preserva tabelas e RPCs existentes `beta_*`; o prefixo é compatibilidade de dados, não uma segunda aplicação. `supabase/migrations/202608130900_bootstrap_permissions.sql` é aditiva, não apaga nem modifica dados, senhas ou sessões. RLS e RPCs continuam sendo a autoridade de autorização.

## Gates

- `tests/quality_gate.py`: DOM, imports, referências, ownership, manifest, SW e vendor.
- `tests/e2e/volt.spec.mjs`: cenários A–I, console/pageerror/unhandledrejection, desktop/mobile, Chromium/WebKit.
- `tests/e2e/sw.spec.mjs`: registro, controle, asset 404, offline e retorno online.
- `tests/browser_smoke.py`: fallback local equivalente.
- `.github/workflows/app-quality-gate.yml`: sintaxe, helpers backend e browser real.
