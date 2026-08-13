# VOLT Liquid Glass Design System

## Princípios

O sistema visual evolui a identidade do PDF `VOLT Consumo - Fluxo UI Modo Noturno e Claro` sem copiar suas telas literalmente. A marca verde, a hierarquia de grandes métricas e a diferenciação Energia/Água foram preservadas. O vidro comunica agrupamento e profundidade; nunca substitui contraste ou semântica.

As regras estáticas vivem em `styles/`. Não existe JavaScript de skin, segundo DOM por tema ou renderer visual concorrente.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `styles/tokens.css` | cores, temas, opacidades, blur, tipografia, spacing, radii, motion, z-index e safe areas |
| `styles/glass.css` | níveis de vidro, highlights, tintas Energia/Água e fallback |
| `styles/layout.css` | Login, App Shell, sidebar, topbars, conteúdo e bottom navigation |
| `styles/components.css` | botões, inputs, navegação, chips, dialogs, formulários e controles |
| `styles/pages.css` | grids e composição das páginas oficiais |

## Tokens centrais

- Marca: `--volt-accent`, `--volt-accent-strong`, `--volt-accent-soft`.
- Domínios: `--volt-energy`, `--volt-energy-strong`, `--volt-water`, `--volt-water-strong`.
- Texto: `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-on-accent`.
- Vidro: `--glass-1`, `--glass-2`, `--glass-3`, `--glass-elevated`, `--glass-control`, `--glass-navigation`, `--glass-modal`.
- Óptica: `--glass-border`, `--glass-highlight`, `--glass-shadow*`, `--glass-blur*`, `--glass-saturation`.
- Escala: `--space-1` a `--space-12`, `--radius-xs` a `--radius-xl`, `--touch-target`.
- Movimento: `--duration-fast`, `--duration-normal`, `--ease-standard`.

## Níveis de vidro

| Classe | Uso |
|---|---|
| `.glass-level-1` | agrupamentos de fundo e superfícies discretas |
| `.glass-level-2` | cards e controles secundários |
| `.glass-level-3` | cards analíticos com mais conteúdo |
| `.glass-elevated` | cards principais Energia/Água e autenticação |
| `.glass-control` | inputs, selects, segmented controls e botões secundários |
| `.glass-navigation` | sidebar, topbar e barra inferior |
| `.glass-modal` | dialogs e sheets |

`backdrop-filter` e `-webkit-backdrop-filter` são progressivos. Sem suporte, a cor alfa e a borda continuam legíveis. `prefers-reduced-transparency` remove blur e aumenta a solidez.

## Temas

O DOM é único. `data-theme="light"` e `data-theme="dark"` trocam somente tokens. A ausência de `data-theme` representa Sistema e delega a escolha ao `color-scheme`/media query do navegador.

- Claro: fundo tonal verde muito suave, vidro branco, bordas discretas, sombras curtas.
- Escuro: fundo verde-preto, vidro escuro, highlights frios e verde luminoso controlado.
- Energia: âmbar; Água: azul. Essas cores não substituem texto ou rótulo.

## Tipografia e hierarquia

A fonte é a pilha nativa iniciada por Inter, sem download externo. Métricas usam `--font-size-metric`; headlines usam `--font-size-display` e `--font-size-xl`. Corpo e labels não ficam abaixo de `--font-size-xs` salvo legendas compactas de gráfico.

## Componentes

- Brand lockup e símbolo VOLT em SVG.
- Sidebar desktop e topbar contextual.
- Mobile topbar e bottom navigation com ação central “Nova leitura”.
- Cards Energia/Água, financeiro, insight, histórico e analytics.
- Segmented controls de domínio, período e aparência.
- Formulários, progress bars, listas, empty states, alerts e dialogs nativos.
- Sistema de ícones SVG interno; nenhum emoji é usado como ícone de produto.

## Breakpoints

- Mobile: abaixo de 768 px.
- Tablet: 768–1023 px.
- Desktop: a partir de 1024 px.
- Wide: a partir de 1440 px.

Os breakpoints alteram composição, não dados ou ownership. Os testes cobrem 320, 375, 390, 430, 768, 1024, 1280, 1440 e 1920 px.

## Acessibilidade

- `[hidden] { display: none !important; }` permanece no CSS inicial.
- Touch target mínimo de 44 px.
- `:focus-visible` global, skip link, landmarks, labels e `aria-current`.
- Dialogs nativos fornecem foco modal; todos os dialogs possuem fechamento nomeado.
- Cor nunca é o único identificador de Energia/Água ou status.
- `prefers-reduced-motion` elimina transições não essenciais.
- Safe areas usam `env(safe-area-inset-*)`.

## Performance

Não existem filtros animados continuamente. Blur é agrupado nas superfícies de shell e cards, com opacidade suficiente para evitar camadas extras. Gráficos são DOM/CSS simples. O módulo `src/meter-ocr.js` só é importado após o usuário escolher uma foto.
