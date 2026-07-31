# Volt Consumo

PWA para registrar leituras e acompanhar o consumo de energia elétrica.

## Funcionalidades implementadas

- interface responsiva inspirada no iOS;
- tela de entrada preparada para integração com autenticação;
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

## Segurança

O GitHub Pages é uma hospedagem pública e estática. A tela atual não grava a senha e funciona como protótipo do fluxo. Para restringir o acesso a um único usuário, a publicação definitiva deverá usar autenticação externa, como Supabase ou Firebase.

## Próximas etapas

1. Conectar um provedor de autenticação.
2. Integrar OCR para leitura do medidor pela câmera.
3. Adicionar tarifa e meta configuráveis.
4. Publicar e validar a instalação no Safari do iPhone.
