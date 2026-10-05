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
- **Logo**: pórtico em arco (a porta do fórum) com o monograma "GE" em serifa dourada sobre azul-noite. O desenho das letras vem da fonte do sistema (Cormorant Garamond Bold) e fica em `src/components/logoPaths.ts`.
- Para ajustar a marca: edite `scripts/gerar-logo.py` (tamanho, posição, espaçamento) e rode `npm run logo:gerar` (precisa de `pip install fonttools`). Isso regrava os contornos e **todos os ícones** (`public/favicon.svg`, `public/icons/*`).
- **Painel azul** das telas de entrada: monograma em linha que se desenha ao abrir, anéis e colunas sutis. Sem textos de apresentação. Respeita *reduzir movimento*.
- **Crédito "Desenvolvido por Nexutec"**: canto do painel azul (computador), rodapé da página (celular) e rodapé do menu lateral. A marca da Nexutec é **provisória**: para usar a logo oficial, troque só o `<svg>` em `src/components/Nexutec.tsx` (use `currentColor` para acompanhar o tema).

## Interações e animações
Botões levantam no hover (só em aparelhos com mouse), afundam ao tocar e têm brilho suave nos principais; ícones reagem (setas, atualizar, adicionar). Abas, menu lateral, janelas, avisos e a troca de telas têm transições curtas; os cartões do painel entram em sequência. Tudo é desligado para quem pede *reduzir movimento* no aparelho.

## Responsividade e celular
- Testado em 320, 375, 390, 768, 1024, 1366 e 1920 px.
- `npm run auditar:layout` percorre todas as telas e aponta rolagem lateral, elementos que estouram a largura, alvos de toque menores que 40 px e campos que dão zoom no iPhone. A última rodada ficou sem ocorrências.
- Barra inferior de atalhos, menu lateral em gaveta, áreas seguras (notch e barra do iPhone) e janelas em folha no celular.
