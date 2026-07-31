# Volt Consumo

PWA para registrar leituras e acompanhar o consumo de energia elétrica.

## Funcionalidades implementadas

- interface responsiva inspirada no iOS;
- autenticação por e-mail e senha com Supabase Auth;
- registro local de leituras;
- cálculo de consumo, custo estimado e média diária;
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

## Próximas etapas

1. Migrar as leituras locais para a tabela protegida por RLS em `supabase-setup.sql`.
2. Integrar OCR para leitura do medidor pela câmera.
3. Publicar e validar a instalação no Safari do iPhone.
