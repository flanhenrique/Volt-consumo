# VOLT — preparação para registro no INPI

Este diretório organiza a versão técnica do VOLT que será usada como referência para o pedido de Registro de Programa de Computador (RPC) no INPI.

## Versão congelada

- Produto: VOLT Consumo
- Release: `20260816.5`
- Commit: `5c99b3daf292e775405f6f24959525c3f69e21cd`
- Data da release: 16/08/2026
- Repositório: `flanhenrique/Volt-consumo`

O pedido deve apontar para uma documentação técnica imutável. O script `prepare_inpi_bundle.py` gera um ZIP diretamente desse commit, calcula o SHA-512 e cria um manifesto de conferência.

## Gerar o pacote técnico

Na raiz de um clone Git completo do repositório:

```bash
python inpi/prepare_inpi_bundle.py
```

Arquivos gerados em `inpi/output/`:

- `VOLT-20260816.5-source.zip` — documentação técnica a preservar sem qualquer alteração;
- `VOLT-20260816.5-source.sha512.txt` — resumo digital para conferência;
- `VOLT-20260816.5-manifest.json` — identificação da versão, commit, algoritmo, tamanho e hash.

Após gerar o pacote, faça pelo menos duas cópias de segurança do ZIP. **Não recompacte, renomeie internamente, edite ou regenere o arquivo depois de utilizar o hash no pedido.** O arquivo cujo hash foi informado ao INPI é a prova técnica que deverá permanecer íntegra.

## Dados técnicos sugeridos para o e-Software

- Título: `VOLT Consumo`
- Versão: `20260816.5`
- Tipo principal de programa: `AP01 — Aplicativo`
- Tipo complementar, se aplicável ao formulário: `GI01 — Gerenciador de Informações`
- Campo de aplicação principal: `EN01 — Energia`
- Descrição curta: aplicação web progressiva para registro de leituras, acompanhamento, análise e projeção de consumo de energia elétrica e água, com ciclos, tarifas, indicadores e relatórios de consumo.
- Algoritmo do resumo digital preparado: `SHA-512`
- Código do serviço INPI: `730 — Pedido de Registro de Programa de Computador`

## Itens que dependem do titular no momento do protocolo

1. Confirmar no e-INPI o titular exatamente conforme o cadastro jurídico/CPF ou CNPJ.
2. Confirmar autor(es) e eventual cessão dos direitos patrimoniais, se houver mais de um autor ou desenvolvimento por terceiros.
3. Emitir e pagar a GRU 730.
4. Baixar a Declaração de Veracidade (DV) gerada pelo sistema e assiná-la com certificado digital qualificado ICP-Brasil.
5. Informar no e-Software o SHA-512 do ZIP gerado por este diretório.
6. Guardar o ZIP original e suas cópias de segurança.

## Marca

O registro do software não concede exclusividade sobre o nome VOLT. A estratégia de marca está separada em `MARCA.md` porque o nome apresenta risco de anterioridades semelhantes e não deve ser depositado de forma automática sem busca marcária final nas classes pretendidas.
