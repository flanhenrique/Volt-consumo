# VOLT — Fundação de domínio

## Objetivo

Evoluir o VOLT de monitor de consumo para uma plataforma que acompanha, prevê, explica e concilia contas de energia e água sem aumentar a complexidade do cadastro inicial.

A unidade central do domínio é a **unidade consumidora**, e a unidade temporal principal é o **ciclo de faturamento**. Mês civil é apenas uma visão secundária.

## Estado de transição

O frontend continua usando as tabelas `beta_*` como autoridade operacional durante a janela de rollback. Desde a Fase 2, leituras novas e alterações de metadados relevantes são espelhadas automaticamente no modelo canônico por triggers privados no banco.

Isso mantém a aplicação atual estável sem deixar `consumer_units` e `unit_meter_readings` ficarem obsoletos durante a transição.

Ativos preservados:

- `src/volt-service.js`: fronteira atual com Supabase;
- `src/cycles.js`: cálculo puro de ciclos;
- `packages/consumption-domain/browser/billing-engine.js`: cálculo e análise financeira;
- `src/consumption-report-*`: relatórios de consumo por ciclo;
- autenticação, MFA, organização, RLS e suíte de testes existentes.

## Modelo alvo

```text
auth.users
    ↓
beta_organizations / beta_memberships
    ↓
consumer_units
    ↓
billing_cycles
    ├── unit_meter_readings
    └── bills
          ├── bill_components
          └── reconciliations

consumer_units
    ├── regulatory_profiles
    └── rule_applications ── regulatory_rules
                              └── bill_components
```

### `consumer_units`

Uma linha representa uma unidade de um único serviço. Energia usa `kWh`; água usa `m3`. Uma mesma pessoa ou organização pode possuir várias unidades.

Localidade, distribuidora, classe, subclasse e tipo de sistema pertencem à unidade, não ao CPF e não ao cadastro inicial.

A preferência de ciclo é armazenada separadamente das ocorrências reais, por `cycle_start_day` e `cycle_end_day`. Ela indica um padrão informado pelo usuário, não prova que um ciclo histórico específico existiu.

### `billing_cycles`

Armazena datas exatas do ciclo. Energia e água podem ter ciclos diferentes. O ciclo possui estado próprio: aberto, fechado, aguardando fatura, faturado ou conciliado.

Uma ocorrência só é criada por backfill quando existem datas exatas identificadas. O sistema não fabrica histórico a partir de um padrão mensal.

### `unit_meter_readings`

É o destino canônico das leituras por unidade consumidora. Mantém proveniência e confiança.

Durante a transição, `beta_meter_readings` e `beta_water_readings` continuam recebendo as escritas do frontend. Triggers privados fazem dual-write para `unit_meter_readings`. Inserção, alteração e exclusão são espelhadas; se uma primeira leitura surgir para um serviço ainda sem unidade, a unidade é criada automaticamente com o mínimo de dados já disponível.

### `bills`

`measured_consumption` e `billed_consumption` são campos diferentes. `estimated_total` e `invoice_total` também são campos diferentes. Nenhum deles deve sobrescrever o outro.

Uma fatura corrigida gera nova revisão; a revisão anterior permanece rastreável.

### `bill_components`

Representa as linhas financeiras identificadas na fatura: energia, água, bandeira, tributos, CIP/COSIP, esgoto, taxas, descontos, subvenções, créditos, compensações e ajustes.

O sinal financeiro é explícito por `direction = charge | credit | neutral`. Valor ausente permanece `NULL`; não deve ser inventado.

### `regulatory_rules`

Catálogo global versionado. O conteúdo de uma regra publicada é imutável. Mudança legal ou tarifária exige nova versão.

São permitidas apenas transições administrativas controladas de status, como `draft → published → superseded/retired`.

Resolução de regra deve considerar, no mínimo:

```text
service
+ jurisdiction
+ country/state/city
+ distributor
+ valid_from/valid_until
+ conditions
+ priority
+ version
```

A competência/ciclo decide qual versão pode ser aplicada. `conditions` e `effect` são payloads estruturados; o motor não deve espalhar regras jurídicas em `if` pelo frontend.

### `regulatory_profiles`

Estado de uma regra para uma unidade:

- `not_analyzed`
- `possible`
- `apparent_eligible`
- `confirmed_on_bill`
- `not_identified`

O produto não transforma hipótese em direito confirmado.

### `rule_applications`

É a ponte entre os três motores:

- `legal`: qual regra estava vigente e poderia se aplicar;
- `billing`: como a regra afeta a cobrança;
- `reconciliation`: se o efeito esperado corresponde ao que foi faturado.

Quando uma regra jurídica aparece na fatura como lançamento financeiro, `bill_component_id` relaciona a regra àquela linha. Isso evita dupla contagem, por exemplo Tarifa Social + Subvenção Baixa Renda tratadas indevidamente como dois descontos independentes.

### `reconciliations`

Persiste a comparação entre total calculado e total real, diferença absoluta/percentual, diferença entre consumo medido e faturado, classificação e diagnóstico.

Os estados finais são `reconciled`, `partially_reconciled` e `not_reconciled`. Os limites de “batendo”, “pequena diferença” e “diferença relevante” pertencem à configuração versionada do motor, não a texto solto da interface.

## Proveniência e confiança

Os registros novos usam duas dimensões distintas.

`source_type`:

- `volt_measured`
- `user_informed`
- `bill_identified`
- `volt_calculated`
- `rule_predicted`

`confidence`:

- `confirmed`
- `probable`
- `not_identified`

Fonte e confiança não são sinônimos. OCR pode produzir `bill_identified + probable`; confirmação humana pode elevar a confiança sem alterar a origem.

## RLS e isolamento

Todas as novas tabelas de domínio expostas têm RLS habilitado e forçado.

O isolamento é por `organization_id`, validado contra membership ativa. As funções auxiliares de autorização e os triggers de dual-write ficam no schema privado `volt_private`, usam `search_path = ''` e não concedem `EXECUTE` a `public`, `anon` ou `authenticated` quando não precisam ser chamadas diretamente.

O catálogo regulatório é leitura global autenticada, mas não pode ser alterado pelo frontend. Escrita de regras deve ocorrer por processo administrativo controlado.

## Fase 2 — migração concluída

Estratégia usada: **expand/contract**.

1. `beta_*` foi mantido como autoridade do frontend;
2. unidades foram criadas somente quando existia leitura ou referência real de fatura;
3. localidade/distribuidora disponíveis foram copiadas sem normalizar nomes duvidosos;
4. preferência de ciclo foi migrada apenas quando existia como objeto válido em `user_metadata`;
5. ocorrência de `billing_cycles` foi criada somente quando já existiam datas exatas de ciclo;
6. todas as leituras foram copiadas preservando usuário de origem, valor e timestamp;
7. comparações `EXCEPT` nos dois sentidos confirmaram paridade;
8. triggers de dual-write passaram a manter origem e destino sincronizados;
9. alterações posteriores de localidade/ciclo em `user_metadata` são refletidas nas unidades existentes;
10. o cutover de leitura do frontend permanece adiado para permitir rollback simples.

### Checkpoint de produção em 14/08/2026 UTC

- 6 unidades criadas: 5 energia + 1 água;
- 39 leituras canônicas: 36 energia + 3 água;
- 0 leituras faltantes;
- 0 leituras extras;
- 2 preferências de ciclo migradas;
- 1 ciclo exato identificado e persistido;
- 3 leituras ligadas a esse ciclo exato;
- dual-write de leitura validado com transação de rollback;
- sincronização de preferência de ciclo validada com transação de rollback;
- nenhum dado fictício permaneceu após os testes.

Migrations da Fase 2:

- `20260814012539_volt_consumer_units_backfill_v2.sql`
- `20260814012734_volt_consumer_units_dual_write_v2_1.sql`

## Fluxo de fechamento e conciliação

```text
ciclo fecha
→ awaiting_bill
→ “Sua fatura chegou?”
   → ainda não: permanece aguardando sem insistência
   → sim: usuário informa total
→ snapshot da estimativa do VOLT
→ comparação automática
→ matching | small_difference | relevant_difference
→ diagnóstico progressivo se necessário
→ componentes da fatura + regras aplicadas
→ reconciled | partially_reconciled | not_reconciled
```

OCR entra posteriormente como uma fonte de dados da fatura. O fluxo de conciliação não depende de OCR para existir.

## Privacidade e retenção

O cadastro principal não recebe novos campos regulatórios ou sensíveis.

A análise de benefícios deve partir primeiro da própria fatura. Perguntas adicionais são opcionais e mínimas.

A imagem original da fatura não deve ser persistida por padrão. O desenho alvo é: upload temporário privado → processamento → extração → validação → descarte. Persistência do arquivo original exige opção explícita do usuário.

Dados estruturados de consumo/faturamento permanecem enquanto necessários ao serviço e ao histórico solicitado pelo usuário. Exclusão de conta/unidade deve ser implementada por fluxo controlado de backend, preservando apenas dados que precisem ser mantidos por obrigação legal e removendo/anominizando o restante conforme a política aplicável.

Nenhum conteúdo de fatura, identificador sensível ou resposta sobre benefícios deve ir para logs ou analytics.

## Fases

- **Fase 1 — concluída:** fundação SQL, RLS, proveniência e catálogo versionado.
- **Fase 2 — concluída:** unidades consumidoras, backfill, preferência/ciclos persistidos e dual-write.
- **Fase 3 — próxima:** fluxo “Sua fatura chegou?”.
- Fase 4: valor real e comparação automática.
- Fase 5: reconciliação progressiva.
- Fase 6: carga inicial do catálogo regulatório.
- Fase 7: motor de regras usando catálogo SQL.
- Fase 8: OCR/análise de faturas.
- Fase 9: PDF executivo.

## Gates antes de cada fase

Não avançar sem validar integridade, RLS, regressão do runtime atual, separação energia/água, separação medido/faturado e ausência de valores financeiros inventados.
