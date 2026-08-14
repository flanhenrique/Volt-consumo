# VOLT para iOS + WidgetKit

Esta pasta contém a fundação nativa do VOLT para iPhone sem reescrever a aplicação web.

## Arquitetura

```text
www.voltconsumo.com.br
        ↓ WKWebView
ponte JavaScript → WKScriptMessageHandler
        ↓
WidgetSnapshot
        ↓
App Group: group.br.com.voltconsumo.shared
        ↓
WidgetKit
```

O site continua sendo a aplicação principal e a fonte das regras de consumo. O contêiner iOS recebe apenas um snapshot já apresentado pelo VOLT e o grava no App Group. A extensão WidgetKit lê esse snapshot sem precisar duplicar autenticação ou regras tarifárias.

## Targets

- `Volt`: aplicativo iOS que abre o VOLT oficial em `WKWebView` e sincroniza o snapshot do widget.
- `VoltWidgetExtension`: extensão WidgetKit.
- `Shared`: modelo e armazenamento usados pelos dois targets.

## Widgets incluídos

- Home Screen pequeno: consumo de energia + progresso da meta.
- Home Screen médio: energia + meta + custo atual + água + CO₂e.
- Lock Screen circular: percentual da meta.
- Lock Screen retangular: consumo + percentual + status.

## Requisitos

- macOS com Xcode compatível com iOS 17 ou superior.
- XcodeGen para gerar o `.xcodeproj` a partir de `project.yml`.
- Uma conta Apple Developer configurada no Xcode para instalar em dispositivo real.

## Gerar o projeto

```bash
cd ios
brew install xcodegen
xcodegen generate
open VOLT.xcodeproj
```

No Xcode:

1. Selecione o target `Volt` e defina o seu Team em Signing & Capabilities.
2. Faça o mesmo no target `VoltWidgetExtension`.
3. Registre/ative o App Group `group.br.com.voltconsumo.shared` para os dois targets.
4. Confirme os bundle identifiers:
   - `br.com.voltconsumo.app`
   - `br.com.voltconsumo.app.widget`
5. Execute o target `Volt` no iPhone.
6. Faça login no VOLT pelo app nativo.
7. Adicione `VOLT` pela galeria de widgets do iOS.

## Atualização dos dados

A ponte WebKit observa o estado `READY` do VOLT e os elementos da Home. Quando consumo, meta, custo, água ou CO₂e mudam, ela envia um novo snapshot para o código nativo. O app grava o snapshot no App Group e solicita ao WidgetKit a recarga do widget.

O timeline usa política `.never`: não existe polling artificial. O widget é recarregado quando o VOLT entrega um snapshot diferente.

## Segurança e privacidade

- O widget não recebe senha nem token Supabase.
- O snapshot compartilhado contém apenas métricas resumidas exibidas pelo widget.
- Links externos ao domínio VOLT são abertos fora do `WKWebView`.
- O widget de Tela Bloqueada não mostra nome, e-mail ou identificadores da conta.

## Dívida técnica conhecida do marco 1

A ponte nativa lê os IDs estáveis já renderizados pela Home (`home-energy-consumption`, `home-energy-goal`, etc.). Isso permite integrar WidgetKit sem alterar a aplicação web neste primeiro marco, mas não deve ser a interface definitiva.

Próximo endurecimento recomendado: criar no domínio web um `volt:widget-snapshot` canônico, produzido pela mesma camada que calcula o snapshot de consumo do renderer. Quando isso existir, a ponte nativa deixa de depender da estrutura visual do DOM.

## Próximas fases

1. Interface canônica `volt:widget-snapshot` no web app.
2. Previsão fechada da fatura no widget médio, separando custo atual de projeção do ciclo.
3. Deep links para Home, Consumo e Nova leitura.
4. Assets oficiais do VOLT e App Icon nativo.
5. Live Activity, se houver um caso de uso que justifique atualização mais frequente.
6. Testes em dispositivo e pipeline de build iOS.
