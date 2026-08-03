# Rollback da migração de identidade no Beta

## Escopo e invariantes

Este procedimento cobre `TK-IDN-0008`, `TK-IDN-0009`, `TK-IDN-0010` e `TK-IDN-0011`. `auth.users` permanece a fonte de verdade das credenciais durante toda a migração. Senhas, refresh tokens e access tokens não são copiados para tabelas públicas; por isso o rollback não exige recadastro de senha.

O console de usuários continua autorizado exclusivamente para `flanhenriquee@icloud.com` com AAL2. A flag `identity.new-auth` deve permanecer com `enabled = false`, `rollout_percentage = 0` e `kill_switch = false` até que o BFF esteja em origem first-party e os gates de cada etapa tenham sido aprovados.

## Pré-condições do corte

1. `beta_identity_migration_integrity()` precisa retornar `missing_membership = 0`, `missing_context = 0` e `invalid_context = 0`.
2. O total de `auth_users` deve ser igual aos totais cobertos por membership e contexto.
3. O ensaio transacional de `scripts/auth-migration-rollback-rehearsal.sql` precisa terminar com `trigger_restored = true`.
4. Login, refresh, logout, MFA e RLS devem estar verdes.
5. Cada etapa 5% → 25% → 50% → 100% exige uma janela de observação e nova validação de integridade.

## Acionamento do rollback

Acione o kill switch e volte o tráfego para o fluxo vigente se houver aumento de falha de login, sessão, MFA ou divergência de identidade. Antes de qualquer alteração estrutural:

1. Defina `identity.new-auth.kill_switch = true` pelo RPC administrativo auditado.
2. Confirme que a interface voltou ao fluxo vigente.
3. Execute `beta_identity_migration_integrity()` e preserve o resultado no registro do incidente.
4. Mantenha o dual-write ativo enquanto houver cadastros, evitando nova divergência.
5. Reconcile identidades ausentes chamando `beta_provision_identity` apenas como `postgres`, depois repita a auditoria.

O trigger de dual-write só deve ser removido se ele próprio for a causa confirmada. Nesse caso, remova-o dentro de uma mudança controlada, preserve as tabelas criadas e restaure o trigger após a correção. Não exclua organizações, memberships nem contextos durante rollback operacional.

## Ponto de não-retorno

Depois de 100%, o retorno exige primeiro congelar novas mutações e reconciliar os dois caminhos. A flag não pode chegar a 100% sem evidência dos quatro patamares, integridade zero e ensaio anterior ao corte.

