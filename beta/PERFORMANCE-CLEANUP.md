# Beta — correções e otimização sequencial

## Estado

Branch de trabalho: `fix/sequential-beta-corrections`.

## Concluído

- Runtime principal e contrato DOM restaurados antes desta etapa.
- Service Worker sem referência ao `home-cleanup.js` removido.
- Cache do shell atualizado para evitar clientes presos em assets antigos.
- Bootstrap pós-login dividido em fases: crítico, secundário e deferred.
- Módulos independentes de cada fase agora carregam em paralelo controlado (`Promise.all`) em vez de uma cascata serial de imports.
- Módulos exclusivos da conta de teste continuam condicionais e agora carregam em paralelo entre si.
- Proteção existente contra inicialização duplicada da navegação preservada.
- `startup-runtime.js` agora é carregado antes de `app.js`, garantindo que o singleton Supabase, o rastreio das quatro consultas-base e o adiamento de RPCs administrativos atuem sobre o cliente realmente usado no login.
- O runtime pós-login só libera Home/ciclos depois de `volt:account-data-ready`, com fail-safe caso o backend não conclua a carga.
- Service Worker atualizado para resolver offline assets versionados com `?v=...` usando `ignoreSearch`, evitando falhas de PWA após cache bust.
- Quality gate da branch validado após as correções de startup/cache.

## Próximos alvos, por risco

1. Medir o caminho real `MFA -> dados da conta -> primeiro render` e reduzir qualquer round-trip restante que não seja requisito de segurança.
2. Eliminar listeners/observers duplicados entre Home, ciclos e relatórios.
3. Auditar arquivos sem referências antes de qualquer exclusão adicional.
4. Revisar cache/offline após cada remoção para impedir referências quebradas no shell.
5. Smoke tests: login, Home, Energia, Água, nova leitura, configurações, relatórios, onboarding BR/UY, tema claro/escuro e Android.

## Regra de segurança

Nenhum arquivo será apagado apenas por parecer antigo. Exclusão exige ausência de imports/referências, ausência no Service Worker e ausência de dependência runtime conhecida.
