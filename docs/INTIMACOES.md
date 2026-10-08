# Caixa de intimações (DJEN)

Tela **Intimações** (menu *Processos*). Traz o que o tribunal **publicou para os advogados do escritório** no Diário de Justiça Eletrônico Nacional (DJEN, CNJ), com prazo sugerido e tarefa.

## O que você precisa fazer
1. Em **Funcionários**, preencha a **OAB com a UF** de cada advogado (ex.: `OAB/MA 12345`). O sistema busca por esse número em todos os tribunais.
2. Aplicar a migração `0012` (workflow *Supabase — aplicar banco e funções*) e publicar a função `processos`.
3. Clique em **Buscar no DJEN** (traz os últimos 15 dias). Depois a busca roda sozinha a cada 6 horas (workflow *Acompanhamento de processos e Drive*, que precisa dos segredos `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `CRON_SECRET`).

## Como funciona
- **Busca**: API pública de comunicações do CNJ (`comunicaapi.pje.jus.br`), por número e UF da OAB. A API **só responde a partir do Brasil**; por isso a função `processos` é chamada com o cabeçalho `x-region: sa-east-1` (São Paulo). Verificado em 08/10/2026: da região padrão a resposta é 403; de sa-east-1, 200.
- **Sem repetir**: cada comunicação tem um identificador do DJEN; a mesma não entra duas vezes (nem quando dois advogados do escritório são intimados juntos).
- **Processo**: se o número já está cadastrado, a intimação é ligada a ele e ao responsável; senão aparece "Processo não cadastrado" com o atalho **Cadastrar este processo** (com número, órgão e classe já preenchidos).
- **Prazo**: quando o texto traz o prazo ("no prazo de 15 (quinze) dias"), o sistema calcula o vencimento pela disponibilização no Diário (publicação no 1º dia útil seguinte e contagem a partir do dia útil depois, em dias úteis, descontando os feriados cadastrados: Lei 11.419, art. 4º; CPC, arts. 219 e 224). Sem prazo claro no texto, o sistema **não inventa**: mostra "definir" e deixa o advogado informar os dias.
- **Tarefa**: intimação que exige providência e foi publicada nos últimos 10 dias vira tarefa (com prazo na Agenda, se houver prazo), para o responsável pelo processo ou o advogado da OAB. Pode ser desligado em *Configurações* (mesma chave dos andamentos). No máximo 30 tarefas por rodada, para a primeira busca não inundar a equipe.
- **Tratamento** (na janela da intimação): marcar como lida, **lançar o prazo em Tarefas** (tarefa do tipo prazo, dia inteiro, na Agenda; marcar "prazo fatal" é decisão do advogado), tratada sem tarefa, descartar e reabrir. O conteúdo vindo do tribunal **nunca** é alterado (garantido no banco).
- **Quem vê**: administração, gerência e coordenação. Exclusão: administração e gerência. Mudanças de tratamento ficam na auditoria.

## Aviso
O prazo calculado é **sugestão pela regra geral**: o advogado confere no ato (feriados locais, suspensão de prazos, prazo em dobro, regras do juízo) e é quem responde por ele. A comunicação do DJEN é pública, mas o texto pode trazer dados pessoais das partes: o acesso é restrito ao escritório.

## Banco
Migração `0012_intimacoes.sql`: `intimacoes` (só a Edge Function insere; a equipe atualiza apenas os campos de tratamento) e `intimacoes_sync` (resultado da última busca). RLS por escritório.
