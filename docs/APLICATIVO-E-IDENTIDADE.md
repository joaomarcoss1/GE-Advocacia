# Aplicativo instalável, identidade visual e uso no celular

## Instalar no aparelho
O GE Advocacia é um aplicativo web instalável (PWA): ocupa a tela inteira, tem ícone próprio e abre mais rápido. Não precisa de loja de aplicativos.

| Aparelho | Como instalar |
|---|---|
| **Android (Chrome)** | Abra o endereço do sistema e toque em **Instalar aplicativo** (nas telas de entrada e de ponto, ou no rodapé do menu). Se preferir, menu do Chrome > *Instalar app*. |
| **Computador (Chrome ou Edge)** | Clique em **Instalar aplicativo** ou no ícone de instalação na barra de endereço. |
| **iPhone e iPad (Safari)** | O Safari não tem pedido automático. Toque em **Instalar aplicativo** para ver o passo a passo: *Compartilhar > Adicionar à Tela de Início*. Precisa ser o Safari. |

Depois de instalado, o aplicativo **abre onde a pessoa estava**: a tela de ponto do escritório (funcionários) ou o painel (equipe de gestão). Atalhos de pressionar o ícone: Tarefas, Processos e Documentos.

## O que funciona sem internet
- A **casca** do aplicativo (telas, estilos e ícones) abre sem rede, e uma faixa avisa "Sem conexão".
- **Dados não ficam guardados no aparelho**: consultar, salvar, bater o ponto e enviar documentos exigem internet. Isso é proposital (segurança e confiabilidade do ponto).
- Quando sai uma versão nova, aparece **"Nova versão disponível"** com o botão *Atualizar*. Nada recarrega sozinho no meio de um preenchimento.

Limites conhecidos: no iPhone não há notificação por push neste projeto; a primeira abertura precisa de internet; o Safari pode limpar dados de sites pouco usados.

## Publicação (Vercel)
`vercel.json` já define: `sw.js` sem cache (para a atualização chegar), manifest e página offline sempre revalidados, ícones com cache de 7 dias. A política de segurança (CSP) permite apenas arquivos do próprio endereço.

Para conferir depois de publicar: `npm run build`, `npx vite preview --port 4173` e, em outro terminal, `npm run pwa:verificar` (também aceita o endereço publicado como argumento). Ele checa o service worker, os critérios de instalação do Chrome, o manifest e a abertura sem internet.

> A Vercel está com a *Vercel Authentication* ligada nos endereços `*.vercel.app` do projeto. Enquanto estiver, só quem tem conta no time abre o sistema e o aplicativo não instala para os funcionários. Desligue em *Settings > Deployment Protection* ou use um domínio próprio.

## Identidade visual
- **Logo**: pórtico em arco (a porta do fórum) com pedra-chave, monograma "GE" em serifa dourada e um pequeno brilho, sobre azul-safira com moldura dourada. As letras vêm da fonte do sistema (Cormorant Garamond Bold). Fonte única do desenho: `src/components/logoPaths.ts`, gerado por `scripts/gerar-logo.py`.
- Para ajustar a marca (cores, tamanho, posição): edite `scripts/gerar-logo.py` e rode `npm run logo:gerar` (precisa de `pip install fonttools`). Isso regrava o desenho **e todos os ícones** (`public/favicon.svg`, `public/icons/*`, `public/arte/marca-linha.svg`).
- **Painel azul** das telas de entrada: bisel de relógio que gira devagar, aura dourada, monograma em linha que se desenha ao abrir, quatro peças de vidro com balança, fórum, martelo e livro, pontos de luz, cantos, fio com losango e colunas. Tudo decorativo, sem texto, escondido para leitores de tela e desligado em *reduzir movimento*.
- **Tela de ponto**: o bisel vira o mostrador do relógio; abaixo da hora há a faixa da semana (hoje em dourado) e a régua do dia com o ponto de luz que acompanha o horário.
- **Lado direito das telas de entrada**: cartão de vidro com fio dourado, marca-d'água da logo e pontilhado discreto.
- **Painel do sistema**: menu lateral em azul-safira com item ativo em dourado, títulos com ornamento, cartões e indicadores com relevo e canto dourado, tabelas com realce ao passar, botões com degradê (principal azul, destaque em ouro vivo), janelas com fio dourado e fundo desfocado, barras de progresso e estados vazios com a marca ao fundo. Tudo com versão para o tema escuro.
- **Lado do formulário** (entrada, tela inicial e ponto): cantos finos, fio com losango, anéis suaves atrás do cartão e três selos temáticos (horário, segurança, documento) abaixo dele. Tudo decorativo e sem texto.
- **Crédito**: apenas o texto "Sistema desenvolvido pela Nexutec", sem logo, no canto do painel azul (computador), no rodapé da página (celular) e no rodapé do menu lateral. Para mudar o texto, edite `src/components/Nexutec.tsx`.

## Interações e animações
Botões levantam no hover (só em aparelhos com mouse), afundam ao tocar e têm brilho suave nos principais; ícones reagem (setas, atualizar, adicionar). Abas, menu lateral, janelas, avisos e a troca de telas têm transições curtas; os cartões do painel entram em sequência. Tudo é desligado para quem pede *reduzir movimento* no aparelho.

## Responsividade e celular
- Testado em 320, 375, 390, 768, 1024, 1366 e 1920 px.
- `npm run auditar:layout` percorre todas as telas e aponta rolagem lateral, elementos que estouram a largura, alvos de toque menores que 40 px e campos que dão zoom no iPhone. A última rodada ficou sem ocorrências.
- Barra inferior de atalhos, menu lateral em gaveta, áreas seguras (notch e barra do iPhone) e janelas em folha no celular.
