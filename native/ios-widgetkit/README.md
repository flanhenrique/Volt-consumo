# VOLT WidgetKit

Camada iOS isolada para disponibilizar widgets do VOLT sem reescrever o PWA.

## Arquitetura

- `VOLT`: host iOS mínimo com `WKWebView`, carregando `https://www.voltconsumo.com.br`.
- `VOLTWidgets`: extensão WidgetKit.
- `VoltWidgetCore`: contrato Codable e regras puras do snapshot.
- App Group: `group.br.com.voltconsumo.shared`.
- URL scheme: `volt://`.

O App Group armazena apenas o snapshot resumido necessário aos widgets. Sessão, JWT e credenciais do Supabase não são compartilhados.

## Widgets

- Resumo: Small, Medium e Large.
- Energia: Small.
- Água: Small.
- Nova leitura: Small, Medium e Large.
- Tela Bloqueada: Circular, Rectangular e Inline.

Rotas rápidas:

- `volt://reading` abre a escolha Luz/Água.
- `volt://reading/energy` abre diretamente o campo de leitura de energia.
- `volt://reading/water` abre diretamente o campo de leitura de água.
- `volt://consumption/energy` e `volt://consumption/water` abrem o consumo correspondente.

## Build no macOS

O projeto usa `project.yml` para XcodeGen. No Mac:

```bash
cd native/ios-widgetkit
swift test
cd ios
xcodegen generate
open VOLT.xcodeproj
```

Antes de executar em dispositivo real, configure o Team de assinatura e registre o App Group nos dois targets.

Esta branch não altera nem publica o `main`.
