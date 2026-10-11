# Níveis de acesso, permissões e porta do ponto

Apoio técnico: quem define o que cada nível pode fazer no escritório é o sócio-administrador. Revise com o responsável jurídico e com o encarregado de dados (LGPD) antes de usar em produção.

## Os 8 níveis (hierarquia)

| Nível | Pode, por padrão |
|---|---|
| **Sócio-administrador** (100) | Tudo, inclusive folha, cadastro de pessoas, configurações, auditoria e backup. |
| **Gerência** (80) | Ponto, escalas, ocorrências, relatórios, todos os casos (inclusive sigilosos), modelos, exclusões. Libera acessos fora do horário. |
| **Coordenação** (60) | Delega e acompanha tarefas, prazos e casos; sem ponto, folha ou dados pessoais. |
| **Advogado(a)** (50) | Os processos em que atua (ou que lhe foram delegados), intimações, documentos, modelos, tarefas, honorários. |
| **Financeiro** (40) | Honorários e clientes. Não vê processos nem documentos. |
| **Secretaria** (30) | Todos os processos (menos sigilosos), clientes, documentos, agenda. |
| **Estágio** (20) | Só o que lhe foi delegado em tarefa; não edita processo nem cliente, não delega. |
| **Colaborador** (10) | Só o próprio espaço: ponto, tarefas e agenda pessoais. |

Gerência e coordenação mantêm exatamente o que tinham antes dos novos níveis.

## Permissões

Cada nível tem um conjunto padrão (tela **Acessos e níveis → Níveis e permissões**). O administrador pode ajustar o padrão de cada nível para o escritório, e cada pessoa pode ter permissões **a mais** ou **a menos** que o nível. "Negar" tem a última palavra.

* Permissões implicam outras (ver todos os processos inclui ver os seus; sigilosos inclui ver todos).
* **Reservadas ao sócio-administrador** (nunca delegáveis): folha, cadastro de pessoas, configurações, auditoria e backup.
* Escopo dos processos: os que a pessoa responde, os que lhe foram delegados em tarefa e, com permissão, todos. Processo **sigiloso** só aparece com a permissão própria (o responsável sempre vê o seu). Andamentos, documentos e lista de documentos seguem o processo.

## Hierarquia de gestão

* Só quem tem a permissão *gerenciar acessos* cria acesso, muda nível, redefine senha ou remove; por padrão, só o administrador. Pode ser dada à gerência.
* Ninguém gerencia quem tem nível **igual ou maior** que o seu, nem atribui nível igual ou maior que o seu, nem altera o próprio acesso (exceto o administrador, que sempre mantém ao menos um administrador ativo).
* Só se concede permissão que o próprio ator tem.

## Login do funcionário e porta do ponto

1. O administrador cria o acesso **a partir do cadastro do funcionário** (o login fica ligado ao cadastro) com uma **senha provisória**; a pessoa troca no primeiro acesso.
2. Para os níveis Advogado, Financeiro, Secretaria, Estágio e Colaborador, o acesso **só abre depois do registro de entrada** e **fecha com a saída**. Administrador, gerência e coordenação não dependem do ponto.
3. **Entrada automática:** ao confirmar o ponto (entrada ou retorno do intervalo), quem tem login ligado ao cadastro entra no sistema sozinho, com o nível dele (a Edge Function `ponto-entrar` valida o PIN e abre a sessão). Não vale no modo quiosque (tablet compartilhado), para administração e gerência (entram com e-mail e senha), nem com senha provisória. O administrador liga ou desliga em *Acessos e níveis*. Sem ponto, o login mostra apenas "Bata o ponto para entrar": nenhum dado do escritório é lido, nem pelo banco.
4. **Liberação pela gerência** (audiência externa, plantão, hora extra): de 5 min a 12 h, com motivo, registrada.
5. O administrador pode desligar a exigência no escritório, ou dispensar/exigir o ponto de uma pessoa.

A regra vale no **banco** (políticas de segurança por linha), não só na tela. Uma marcação rejeitada não abre o acesso.

## Registro de acessos

Entradas, barreiras por ponto, acesso encerrado, criação, alteração e remoção de acesso, redefinição de senha, troca de senha, liberações e mudança de permissões ficam em *Registro de acessos* (só administrador) e na auditoria.

## Como ativar

1. Rode o fluxo **Supabase — aplicar banco e funções** (marque *Publicar as Edge Functions*): aplica as migrações `0013` e `0014` e publica `documentos`, `processos` e a nova `ponto-entrar`. Veja também `docs/SEGURANCA.md`.
2. Enquanto o banco não tiver a 0013, o app continua funcionando com os três níveis antigos; a tela de acessos avisa que falta a atualização.
3. Em **Acessos e níveis**, crie os acessos dos funcionários e confira o padrão de cada nível.

## Onde está no código

* `src/lib/permissoes.ts` — níveis, catálogo, padrões, hierarquia e porta do ponto (puro, testado; o banco repete e `permissoes.paridade.test.ts` confere).
* `supabase/migrations/0013_niveis_acesso.sql` — tabelas, `tem_permissao()`, políticas restritivas, funções de gestão.
* `src/data/local.ts` — o mesmo comportamento no modo demonstração.
* `src/pages/Acessos.tsx`, `MeuEspaco.tsx`, `AcessoBloqueado.tsx`, `TrocarSenha.tsx`.
* Testes: `src/lib/permissoes.test.ts`, `src/data/acessos.test.ts`, `supabase/tests_99_acessos.sql`, `e2e/14-niveis-acesso.spec.ts`.
