# VOLT Responsive Architecture

## Baseline

O redesign parte do runtime estabilizado integrado em `main` no SHA `f1db383b1796dae32bde7e07e626d612adca5984`. Bootstrap, auth, sessão, store, renderer e Service Worker continuam únicos.

```text
app.js
  -> createApplicationStore()
  -> createVoltService()
  -> restore session / MFA / snapshot
  -> store.update()
  -> createRenderer().render(state)
       -> lifecycle
       -> navigation
       -> identity
       -> Home / Consumo / Leituras / Alertas
       -> Relatórios / Usuários / Configurações / Ajuda
```

Não existem `desktop-app.js`, `mobile-app.js`, DOM duplicado por tema ou módulo posterior que substitui a interface.

## App Shell

O mesmo `#dashboard` contém:

- `.desktop-sidebar`: navegação completa, perfil, tema e logout;
- `.desktop-topbar`: saudação, ciclos, alertas, tema e perfil;
- `.mobile-topbar`: marca, alertas e tema;
- `#page-container`: outlet único de páginas;
- `.mobile-bottom-navigation`: Início, Consumo, Nova leitura, Alertas e Mais.

CSS alterna a composição em 1024 px. Estado, listeners, serviços e elementos de página são compartilhados.

## Navegação

| Destino | Desktop | Mobile |
|---|---|---|
| Início | sidebar | bottom bar |
| Consumo | sidebar | bottom bar |
| Nova leitura | ação contextual | ação central nomeada |
| Alertas | sidebar/topbar | bottom bar |
| Leituras | sidebar | sheet Mais |
| Relatórios | sidebar | sheet Mais |
| Usuários | sidebar, se autorizado | sheet Mais, se autorizado |
| Configurações/Perfil | sidebar/topbar | sheet Mais |
| Ajuda | sidebar | sheet Mais |
| Sair | sidebar | sheet Mais |

`navigate()` altera apenas `state.activePage`. O renderer deriva `hidden` e `aria-current`. Usuários continua carregando administração somente na primeira abertura autorizada.

## Ownership

| Responsabilidade | Dono |
|---|---|
| lifecycle e auth | `app.js` + `src/volt-service.js` |
| estado | `src/app-state.js` |
| todas as páginas e componentes de dados | `src/renderer.js` |
| cálculos de domínio | `packages/consumption-domain` + `src/cycles.js` |
| interação e persistência explícita | `app.js` |
| OCR sob demanda | `src/meter-ocr.js` |
| temas e composição responsiva | `styles/` |
| cache oficial | `sw.js` |

## Páginas

- Home: consumo do ciclo, estimativas, meta, insight e últimas leituras.
- Consumo: Energia/Água, métricas, intervalos reais, gráfico e comparação com meta.
- Leituras: resumos, histórico e abertura do fluxo de nova leitura.
- Alertas: somente sinais derivados de leituras/metas; nenhum alerta de backend é inventado.
- Relatórios: shell e empty state honesto, sem lógica legada.
- Usuários: renderer único condicionado a `permissions.canManageUsers`.
- Configurações: perfil, aparência, ciclos, energia, água, localidade, privacidade e sobre.
- Ajuda: tutoriais, cálculo, privacidade e FAQ; nenhum canal de contato fictício.

Contas e Ciclos anteriores não possuem página, rota, botão ou item de navegação.

## Nova leitura e OCR

O dialog oficial oferece:

1. escolha Energia/Água;
2. foto/captura ou entrada manual;
3. análise local lazy quando `TextDetector` existir;
4. revisão obrigatória de tipo, valor e data;
5. persistência pela função explícita existente.

Sem `TextDetector`, o app informa a limitação e oferece entrada manual. OCR nunca salva silenciosamente.

## Mobile e safe areas

Topbar e bottom navigation incorporam `safe-area-inset-top`, `safe-area-inset-bottom`, `safe-area-inset-left` e `safe-area-inset-right`. O conteúdo possui padding inferior que mantém o último card acessível apesar da barra flutuante.

## Service Worker

Permanece um único `sw.js`. A versão `volt-app-v3-liquid-glass` adiciona os cinco arquivos CSS oficiais. `meter-ocr.js` não integra o shell crítico: é solicitado e cacheado somente quando o fluxo de foto é usado.
