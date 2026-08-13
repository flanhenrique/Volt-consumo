# Auditoria de integridade dos dados

Data da reconciliação: 13/08/2026 (America/Manaus)

Escopo: comparação somente leitura entre o estado atual do projeto Supabase
`Volt Consumo` e o backup pré-estabilização
`backup_users_20260813_0437_utc`. Nenhum dado foi escrito, apagado ou
restaurado durante esta auditoria.

| Controle | Backup | Atual | Diferença relevante |
|---|---:|---:|---:|
| Contas em `auth.users` | 9 | 9 | 0 ausentes |
| Identidades atuais | — | 9 | 0 conta sem identidade |
| Memberships ativas | 9 | 9 | 0 redução |
| Contextos de usuário | 9 | 9 | 0 redução |
| Leituras de energia | 34 | 35 | +1 leitura |
| Leituras de água | 3 | 3 | 0 |

Comparação por UUID:

- usuários do backup ausentes no estado atual: **0**;
- usuários atuais criados depois do backup: **0**;
- usuários atuais marcados como apagados: **0**.

Conclusão: todos os 9 UUIDs de usuário presentes no backup pré-estabilização
continuam presentes no Supabase atual. As coleções de leituras não sofreram
redução; energia ganhou uma leitura e água permaneceu igual. Portanto, não há
evidência de perda de conta ou de dados de consumo desde esse backup.

Nota histórica: existe uma migration anterior ao backup, intitulada
`remove_two_test_accounts`, que removeu explicitamente duas contas de teste.
Ela não faz parte desta estabilização e essas contas já não integravam o backup
de referência. Nenhuma migration desta entrega remove usuários ou dados.
