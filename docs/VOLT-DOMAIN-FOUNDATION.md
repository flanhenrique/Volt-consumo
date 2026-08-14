# VOLT — Fundação de domínio

## Objetivo

Evoluir o VOLT de monitor de consumo para uma plataforma que acompanha, prevê, explica e concilia contas de energia e água sem aumentar a complexidade do cadastro inicial.

A unidade central do domínio é a **unidade consumidora**, e a unidade temporal principal é o **ciclo de faturamento**. Mês civil é apenas uma visão secundária.

## Estado preservado

O runtime atual continua usando as tabelas `beta_*`, a store existente e o mesmo fluxo de autenticação. A Fase 1 é aditiva e não faz cutover de dados.

Ativos que devem ser preservados e evoluídos:

- `src/volt-service.js`: fronteira única com Supabase;
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

### `billing_cycles`

Armazena datas exatas do ciclo. Energia e água podem ter ciclos diferentes. O ciclo possui estado próprio: aberto, fechado, aguardando fatura, faturado ou conciliado.

### `unit_meter_readings`

É o destino canônico futuro das leituras. Mantém proveniência e confiança. A Fase 1 não move leituras existentes para evitar uma troca prematura de autoridade.

### `bills`

`measured_consumption` e `billed_consumption` são campos diferentes. `estimated_total` e `invoice_total` também são campos diferentes. Nenhum deles deve sobrescrever o outro.

Uma fatura corrigida gera nova revisão; a revisão anterior permanece rastreável.

### `bill_components`

Representa as linhas financeiras identificadas na fatura: energia, água, bandeira, tributos, CIP/COSIP, esgoto, taxas, descontos, subvenções, créditos, compensações e ajustes.

O sinal financeiro é explícito por `direction = charge | credit | neutral`. Valor ausente permanece `NULL`; não deve ser inventado.

### `regulatory_rules`

Catálogo global versionado e append-only. Uma mudança legal ou tarifária cria uma nova versão; a versão anterior não é editada.

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

Os registros novos usam duas dimensões distintas:

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

Todas as novas tabelas de domínio têm RLS habilitado e forçado.

O isolamento é por `organization_id`, validado contra membership ativa. As funções auxiliares de autorização ficam no schema privado `volt_private`, com `search_path` vazio e sem exposição ao papel `anon`.

O catálogo regulatório é leitura global autenticada, mas não pode ser alterado pelo frontend. Escrita de regras deve ocorrer por processo administrativo controlado.

## Migração dos dados atuais

A migração será expand/contract:

1. manter `beta_*` como autoridade durante a transição;
2. criar unidades de energia/água somente quando houver evidência suficiente para aquele serviço;
3. migrar localidade, distribuidora e ciclos hoje presentes em `user_metadata` para a unidade correspondente;
4. não inventar ciclo para contas sem informação; usar fatura futura ou pergunta mínima ao usuário;
5. copiar leituras para `unit_meter_readings` preservando timestamp e valor;
6. comparar quantidade, datas e valores entre origem e destino antes do cutover;
7. verificar as tabelas legadas sem prefixo para não duplicar registros já presentes em `beta_*`;
8. ativar o novo caminho por feature flag/dual-read controlado;
9. trocar a autoridade do `volt-service.js` apenas após paridade;
10. manter as tabelas antigas durante uma janela de rollback e removê-las somente em uma migração de contrato futura.

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
- **Fase 2 — próxima:** unidades consumidoras, backfill seguro e ciclos persistidos no banco.
- Fase 3: fluxo “Sua fatura chegou?”.
- Fase 4: valor real e comparação automática.
- Fase 5: reconciliação progressiva.
- Fase 6: carga inicial do catálogo regulatório.
- Fase 7: motor de regras usando catálogo SQL.
- Fase 8: OCR/análise de faturas.
- Fase 9: PDF executivo.

## Gates antes de cada fase

Não avançar sem validar integridade, RLS, regressão do runtime atual, separação energia/água, separação medido/faturado e ausência de valores financeiros inventados.
