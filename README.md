# Volt Consumo

PWA para registrar leituras e acompanhar o consumo de energia e água. A aplicação oficial é publicada na raiz (`/`); `/beta` existe somente como redirecionamento compatível.

## Arquitetura

O navegador carrega uma única entrada, `app.js`. Ela controla a máquina de estados de inicialização, cria um único cliente Supabase e só revela o Dashboard depois de consolidar sessão, MFA, identidade, contexto, leituras, configurações, ciclos, tarifa e permissões.

Consulte `ARCHITECTURE.md` para ownership, fluxo de startup, contrato DOM e Service Worker.

## Executar localmente

```sh
python -m http.server 4173
```

Abra `http://127.0.0.1:4173/`.

## Testes

Gate estático, referências, imports, contrato DOM, Service Worker e checksums:

```sh
python tests/quality_gate.py
```

Suíte de navegador oficial do CI:

```sh
npm install
npx playwright install chromium webkit
npm test
```

Fallback local equivalente, usado quando Node não está disponível:

```sh
python -m pip install playwright==1.54.0
python -m playwright install chromium webkit
python tests/browser_smoke.py
```

## Supabase

A chave no frontend é publicável; nunca use `service_role` no navegador. O schema continua usando tabelas/RPCs `beta_*` por compatibilidade de dados. A migração `202608130900_bootstrap_permissions.sql` é aditiva e expõe somente a permissão mínima necessária durante o bootstrap; membros e convites são carregados apenas ao abrir Usuários.

Nenhum script de aplicação executa migrações automaticamente.
