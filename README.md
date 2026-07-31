# Volt Consumo

PWA para registrar leituras e acompanhar o consumo de energia elétrica.

## Funcionalidades implementadas

- interface responsiva inspirada no iOS;
- autenticação por e-mail e senha com Supabase Auth;
- registro local de leituras;
- cálculo de consumo, custo estimado e média diária;
- previsão de consumo e faixa provável da próxima conta;
- leitura assistida pela câmera com OCR e confirmação do usuário;
- módulo de água com tarifa, esgoto, taxa fixa e alerta de possível vazamento;
- manifest e service worker para instalação e uso offline;
- caminhos relativos compatíveis com GitHub Pages.

## Executar localmente

Sirva a pasta com um servidor HTTP:

```sh
python -m http.server 8080
```

Depois abra `http://localhost:8080`.

## Configurar o login

1. Crie um projeto no Supabase.
2. Em Authentication > Users, crie o usuário autorizado.
3. Copie a URL e a chave publicável do projeto para `config.js`.
4. Não use a chave `service_role` no navegador.

A sessão é persistida e renovada pelo Supabase Auth. O painel só é exibido para uma sessão autenticada.

## Atualização do banco

Execute novamente `supabase-setup.sql` no SQL Editor ao atualizar uma instalação anterior. O script cria as tabelas de água e suas políticas RLS sem apagar dados existentes.
