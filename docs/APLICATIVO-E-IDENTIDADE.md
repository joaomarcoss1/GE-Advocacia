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
Linguagem clássica de escritório de advocacia: papel marfim, azul-noite, ouro, serifa, filetes duplos e um pórtico de fórum. Nada de brilho neon, partículas ou vidro.

- **Logo**: pórtico em arco com pedra-chave, monograma "GE" em serifa dourada e um pequeno brilho, sobre azul-safira com moldura dourada. As letras vêm da fonte do sistema (Cormorant Garamond Bold). Fonte única do desenho: `src/components/logoPaths.ts`, gerado por `scripts/gerar-logo.py`. Para ajustar (cores, tamanho, posição) edite o script e rode `npm run logo:gerar` (precisa de `pip install fonttools`): isso regrava o desenho **e todos os ícones** (`public/favicon.svg`, `public/icons/*`, `public/arte/marca-linha.svg`).
- **Painel azul** das telas de entrada: moldura dupla em ouro fino, selo da marca com anéis e losangos, fio de prumo e um **pórtico de fórum em linha fina** (frontão com a balança, entablamento, seis colunas jônicas e degraus, em `src/components/Forum.tsx`), que "sobe" ao abrir. Sem textos de apresentação; decoração escondida para leitores de tela e sem movimento em *reduzir movimento*.
- **Tela de ponto**: o mesmo painel com o relógio; abaixo da hora há a faixa da semana (hoje em dourado) e a régua do dia.
- **Lado do formulário** (entrada, tela inicial e ponto): "papel timbrado" marfim com moldura dupla, cartão branco com filete duplo interno, **selo da marca** sobre a borda e título centralizado com ornamento.
- **Painel do sistema**: menu lateral em azul-safira com item ativo em dourado, títulos com ornamento, cartões e indicadores com relevo, tabelas com realce ao passar, botões com degradê (principal em azul, destaque em ouro), janelas com fio dourado e fundo desfocado. Há versão para o tema escuro.
- **Tema**: o padrão é o **claro**, mesmo que o aparelho esteja no modo escuro; escuro e automático são escolha da pessoa (ícone de tema no menu).
  - **Escurecimento automático de sites (Chrome/Android):** alguns celulares invertem as cores de qualquer site, e o papel marfim ficava escuro. O sistema declara `color-scheme: only light` (meta e CSS), o que desativa essa inversão; quando a pessoa escolhe o tema escuro, ele passa a declarar `dark light`. O teste `e2e/10-celular-claro.spec.ts` roda o Chrome com esse recurso ligado.
- **Celular (dois tons)**: faixas **azul-noite com ouro** emolduram um conteúdo **claro** (papel marfim com cartões brancos). Azul-noite: cabeçalho (com o selo da marca e o aviso em dourado), atalhos inferiores com indicador dourado, menu lateral, topo das telas de entrada (selo e pórtico) e um bloco de título em cada tela. Claro: todo o conteúdo e os formulários. A barra do navegador e a abertura do aplicativo instalado são azul-noite.
- **Crédito**: apenas o texto "Sistema desenvolvido pela Nexutec", sem logo, no canto do painel azul (computador), no rodapé da página (celular) e no rodapé do menu lateral. Para mudar o texto, edite `src/components/Nexutec.tsx`.

## Interações e animações
Botões levantam no hover (só em aparelhos com mouse), afundam ao tocar e têm brilho suave nos principais; ícones reagem (setas, atualizar, adicionar). Abas, menu lateral, janelas, avisos e a troca de telas têm transições curtas; os cartões do painel entram em sequência. Tudo é desligado para quem pede *reduzir movimento* no aparelho.

## Responsividade e celular
- Testado em 320, 375, 390, 768, 1024, 1366 e 1920 px.
- `npm run auditar:layout` percorre todas as telas e aponta rolagem lateral, elementos que estouram a largura, alvos de toque menores que 40 px e campos que dão zoom no iPhone. A última rodada ficou sem ocorrências.
- Barra inferior de atalhos, menu lateral em gaveta, áreas seguras (notch e barra do iPhone) e janelas em folha no celular.
