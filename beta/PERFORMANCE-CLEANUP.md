# Beta — correções e otimização sequencial

## Estado

Branch de trabalho: `fix/sequential-beta-corrections`.

Progresso estimado desta rodada de estabilização: **90% concluído / 10% restante**.

A porcentagem mede os blocos de trabalho conhecidos da estabilização Beta, não uma contagem literal de bugs. Os 10% finais são principalmente validação funcional em navegador/dispositivo real antes de merge.

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
- Sincronização do onboarding deixou de disparar `submit` artificial da localidade; metadados recebidos da conta não são persistidos de volta apenas por sincronização de UI.
- Sincronização de perfil do onboarding é coalescida por usuário e ignora refresh de token.
- `persistMetadata()` evita `updateUser` quando o valor persistido já é equivalente ao solicitado.
- O render global de `beta-shell.js` continua preservado por segurança visual, mas agora recebe eventos coalescidos e somente quando o snapshot global realmente muda; renderizadores de Home/ciclo também possuem assinatura própria.
- Service Worker v94 resolve offline assets versionados com `?v=...` usando `ignoreSearch`.
- O quality gate valida que todos os assets locais declarados pelo Service Worker existem, além das referências de HTML/imports.
- Auditoria atual não identificou arquivo seguro para nova exclusão; nenhuma remoção foi feita por aparência/nome.
- Workflows GitHub Actions foram atualizados para actions atuais e o atualizador tarifário foi protegido contra corrida de push em branches.
- Quality gate foi reforçado contra regressões destrutivas de `app.js`, `index.html`, `hidden`, valores financeiros intermediários, polling de ciclos, ressincronização circular do onboarding e referências locais inexistentes.
- Quality gates mais recentes passaram após as correções de autenticação, eventos, ciclos e onboarding.

## Restante antes do merge

1. **Smoke/regressão em navegador real** — login, sessão restaurada, MFA, Home, Energia, Água, nova leitura, edição/exclusão, configurações, relatórios, Usuários e logout.
2. **Regional** — validar onboarding e cálculos BR/UY com dados reais de teste, incluindo UTE/OSE.
3. **PWA/dispositivo** — validar tema claro/escuro, instalação/atualização do Service Worker, recarga offline e Android.
4. **Home** — confirmar visualmente que não há sobreposição de telas e que os valores financeiros aparecem uma única vez já consolidados.

## Regra de segurança

Nenhum arquivo será apagado apenas por parecer antigo. Exclusão exige ausência de imports/referências, ausência no Service Worker e ausência de dependência runtime conhecida.
