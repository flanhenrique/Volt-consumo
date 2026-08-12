# Beta — correções e otimização sequencial

## Estado

Branch de trabalho: `fix/sequential-beta-corrections`.

Progresso estimado desta rodada de estabilização: **75% concluído / 25% restante**.

A porcentagem mede os blocos de trabalho conhecidos da estabilização Beta, não uma contagem literal de bugs.

## Concluído

- Runtime principal e contrato DOM restaurados antes desta etapa.
- Service Worker sem referência ao `home-cleanup.js` removido.
- Cache do shell atualizado para evitar clientes presos em assets antigos.
- Bootstrap pós-login dividido em fases: crítico, secundário e deferred.
- Módulos independentes de cada fase carregam em paralelo controlado (`Promise.all`) em vez de uma cascata serial de imports.
- Módulos exclusivos da conta de teste continuam condicionais e carregam em paralelo entre si.
- `startup-runtime.js` é carregado antes de `app.js`, garantindo singleton Supabase, rastreio das quatro consultas-base e adiamento das RPCs administrativas.
- Home/ciclos só são liberados depois de `volt:account-data-ready`, resolução tarifária e contexto de ciclo estabilizados, com fail-safe.
- Telas com atributo `hidden` não podem mais permanecer visíveis por conflito de CSS.
- Valores financeiros da Home permanecem ocultos durante o bootstrap e são revelados somente após estabilização.
- `volt:beta-data` é consolidado por frame e eventos globais sem mudança efetiva de snapshot deixam de provocar render completo.
- Eventos redundantes de `INITIAL_SESSION` e `TOKEN_REFRESHED` deixam de repetir a carga visual/dados da conta.
- `regional-home.js` e `regional-cycles.js` usam assinatura de estado para evitar reescritas redundantes do DOM.
- `regional-cycles.js` não escuta mais diretamente `volt:beta-data`; reage às autoridades de ciclo/localidade.
- `uruguay-water-detail.js` e Home regional tiveram listeners redundantes removidos.
- `platform-users.js` permanece lazy e não é mais importado indiretamente pelo detalhe de energia.
- `separate-cycles.js` deixou de fazer polling a cada 100 ms; usa observer, coalescência por frame e só publica `cycle-context` quando o estado muda.
- Service Worker v94 resolve offline assets versionados com `?v=...` usando `ignoreSearch`.
- Workflows GitHub Actions foram atualizados para actions atuais e o atualizador tarifário foi protegido contra corrida de push em branches.
- Quality gate foi reforçado contra regressões destrutivas de `app.js`, `index.html` e referências locais inexistentes.
- Quality gates mais recentes passaram após as correções de autenticação, eventos e ciclos.

## Restante, por risco

1. **Onboarding e metadados** — eliminar o `submit` artificial de localidade e impedir `updateUser` quando os metadados efetivos não mudaram.
2. **Renderização por área** — reduzir o alcance de `renderBetaExperience()` para que atualizações da Home não reconstruam administração, MFA, convites e relatórios sem necessidade.
3. **Auditoria de órfãos/dependências** — cruzar todos os arquivos Beta com imports estáticos, imports dinâmicos, HTML e Service Worker antes de qualquer exclusão.
4. **Cache/offline final** — confirmar dependências transitivas do conjunto CORE e comportamento offline dos módulos lazy.
5. **Smoke/regressão final** — login, sessão restaurada, MFA, Home, Energia, Água, nova leitura, configurações, relatórios, Usuários, onboarding BR/UY, tema claro/escuro e Android/PWA.

## Regra de segurança

Nenhum arquivo será apagado apenas por parecer antigo. Exclusão exige ausência de imports/referências, ausência no Service Worker e ausência de dependência runtime conhecida.
