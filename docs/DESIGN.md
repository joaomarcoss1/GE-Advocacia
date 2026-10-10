# Design do GE Advocacia: guia curto

Identidade: azul-noite e latão contido sobre porcelana (neutros frios). Títulos e números em Cormorant Garamond; interface em Inter.

## Cores (tokens em `src/styles.css`)
| Papel | Token | Claro | Escuro |
|---|---|---|---|
| Fundo | `--bg` | `#F3F5F8` | `#08101B` |
| Superfície | `--surface` / `--card` | `#FFFFFF` | `#0E1827` |
| Superfície 2 | `--surface-2` | `#F7F8FB` | `#121E30` |
| Linha decorativa | `--line` | `#E3E7ED` | `#1F2D42` |
| **Borda de campo** | `--field-border` | `#868FA0` (3,3:1) | `#5B7098` (3,7:1) |
| **Anel de foco** | `--focus-ring` | `#86652F` (4,9:1) | `#D4B886` |
| Placeholder | `--placeholder` | `#667080` (5,0:1) | `#7D889B` |
| Ação | `--navy` | `#0F1C2E` | `#D2B27A` |
| Latão (acento) | `--brass`, `--gold-hi/mid/lo` | `#B08D57`, `#D9C08F`, `#C4A46A`, `#A88346` | idem |

Regra: ouro é acento, nunca fundo grande. Sem amarelo vivo e sem degradê metálico; o botão dourado usa `--ouro-vivo` (latão fosco).

## Botões
- **Dourado (`.btn.gold`)**: a ação de criar ou concluir da tela, no máximo um por tela.
- **Azul (`.btn`)**: ação principal em formulários e janelas.
- **Contornado (`.btn.ghost`)**: todo o resto, inclusive ações por linha.
- **Perigo (`.btn.danger`)**: exclusão. Sempre com confirmação.
- Hover: sobe 1 px e ganha sombra curta, só com mouse (`hover: hover`). Sem brilho varrendo.

## Acessibilidade
- Campos com borda de 3:1 ou mais; foco visível com `--focus-ring`; modo de alto contraste (`forced-colors`) tratado.
- Celular (até 980 px): alvos de toque de 44 px (botões de ícone, chips, caixas de marcação, abas).
- Marcos: `<main>` em todas as telas, `<aside>` na faixa de marca, `<header>` no topo; tabelas rolam por teclado com nome próprio.
- O teste `e2e/06-acessibilidade` (axe-core, WCAG 2.1 AA) cobre todas as telas, inclusive Intimações, Modelos e Honorários.

## Tipografia
Escala única em rem, tokens `--fs-*`: 2xs 11 px · xs 12 · sm 13 · md 14 · lg 15 · base 16 · xl 18 · 2xl 20 · 3xl 24. O menor texto do sistema é 11 px (antes havia 57 tamanhos, de 8,8 a 25 px). Títulos grandes e números de destaque seguem com `clamp()` próprio.

## Raios de borda
Escala única: `--r-1` 4 px (marcas e barras) · `--r-2` 8 px (botões e campos, `--radius-sm`) · `--r-3` 12 px (cartões, `--radius`) · `--r-4` 16 px · `--r-5` 20 px (janelas e folhas) · `--r-pill` (selos). Círculos usam `50%`. Antes havia 27 valores diferentes; não escreva raio em px direto na folha de estilos nem em `style={{}}`.

## Estilos soltos nos componentes
Espaços, tamanhos de fonte, cores de texto e alinhamentos comuns viram classes utilitárias no fim de `src/styles.css`: `m-0`, `mt-*`/`mb-*`, `g-*`, `fs-*` (tokens), `fw-600`, `c-muted`/`c-bad`/…, `nowrap`, `minw-*`/`maxw-*`. O que sobrou em `style={{}}` (cerca de cem usos, antes 338) é valor calculado na hora (largura de barra, posição) ou medida única de um componente.

## Folha de estilos
Regras repetidas do mesmo seletor foram fundidas (46 fusões, sem mudar nenhum pixel nas 88 capturas de referência). Sobram poucas camadas que se sobrepõem de propósito (por exemplo `.modal`, `.nav a.on::before`, que têm versão para o celular). Ao mexer, edite a regra existente em vez de acrescentar outra no fim.

## Movimento
Entrada de tela em fade de 200 ms; cartões entram juntos; `prefers-reduced-motion` desliga tudo. Durações: `--dur-1` 120 ms, `--dur-2` 200 ms, `--dur-3` 320 ms.

## Celular
A barra superior mostra o nome da tela. O título dentro da página fica só para leitores de tela, e os botões de ação seguem em fila. Avisos fixos são curtos; o lembrete de backup pode ser adiado por 24 horas.

## Como voltar atrás
Os tons claros são tokens: para voltar ao marfim anterior, troque `--bg`, `--surface-2`, `--line*`, `--seg`, `--mute-bg` e `--scroll-*` no bloco `:root`.
