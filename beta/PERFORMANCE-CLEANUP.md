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

## Próximos alvos, por risco

1. `app.js`: tirar privacidade, convite, admin, feature flags e métricas do caminho bloqueante até o primeiro render, preservando MFA e dados essenciais.
2. Medir e eliminar listeners/observers duplicados entre Home, ciclos e relatórios.
3. Auditar arquivos sem referências antes de qualquer exclusão adicional.
4. Revisar cache/offline após cada remoção para impedir `cache.addAll()` de apontar para arquivos inexistentes.
5. Smoke tests: login, Home, Energia, Água, nova leitura, configurações, relatórios, onboarding BR/UY, tema claro/escuro e Android.

## Regra de segurança

Nenhum arquivo será apagado apenas por parecer antigo. Exclusão exige ausência de imports/referências, ausência no Service Worker e ausência de dependência runtime conhecida.
