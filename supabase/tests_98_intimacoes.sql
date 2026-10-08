-- Caixa de intimações (0012): só a Edge Function insere; a equipe lê e trata; o conteúdo do tribunal não muda; isolamento entre escritórios.
\set ON_ERROR_STOP on
select t.admin_db();

\echo == I1. Carga (service_role): idempotente por djen_id
insert into public.intimacoes (escritorio_id, djen_id, tribunal, tipo_comunicacao, numero_processo, texto, data_disponibilizacao, exige_providencia, prazo_dias, prazo_regime, prazo_fim)
  values ((select v::uuid from t.ctx where k = 'escA'), 747388968, 'TJMA', 'Intimação', '0801234-56.2026.8.10.0001', 'Fica intimada para se manifestar no prazo de 15 dias.', '2026-10-06', true, 15, 'uteis', '2026-10-30');
select t.falha($q$ insert into public.intimacoes (escritorio_id, djen_id, tribunal, texto, data_disponibilizacao) values ((select v::uuid from t.ctx where k = 'escA'), 747388968, 'TJMA', 'repetida', '2026-10-06') $q$, 'duplicate key', 'a mesma comunicação não entra duas vezes');
insert into public.intimacoes_sync (escritorio_id, oabs, novas, mensagem) values ((select v::uuid from t.ctx where k = 'escA'), '["12345/MA"]'::jsonb, 1, 'ok');
select t.ok((select status from public.intimacoes where djen_id = 747388968) = 'nova', 'nasce como nova');

\echo == I2. A equipe lê e trata, mas não insere
select t.como((select v::uuid from t.ctx where k = 'coordA'));
select t.ok(t.n($q$ select 1 from public.intimacoes $q$) = 1 and t.n($q$ select 1 from public.intimacoes_sync $q$) = 1, 'coordenação lê a caixa e a última busca');
select t.falha($q$ insert into public.intimacoes (djen_id, tribunal, texto, data_disponibilizacao) values (1, 'TJMA', 'forjada', '2026-10-06') $q$, 'permission denied', 'usuário não cria intimação');
select t.falha($q$ insert into public.intimacoes_sync (escritorio_id) values ((select v::uuid from t.ctx where k = 'escA')) $q$, 'permission denied', 'usuário não grava a busca');
update public.intimacoes set status = 'lida' where djen_id = 747388968;
select t.ok((select status from public.intimacoes where djen_id = 747388968) = 'lida', 'marca como lida');
update public.intimacoes set status = 'tratada', prazo_dias = 10 where djen_id = 747388968;
select t.ok((select tratada_em is not null from public.intimacoes where djen_id = 747388968), 'tratada registra quando');
select t.falha($q$ update public.intimacoes set texto = 'adulterado' where djen_id = 747388968 $q$, 'CAMPO_IMUTAVEL', 'o texto do tribunal não muda');
select t.falha($q$ update public.intimacoes set data_disponibilizacao = '2026-01-01' where djen_id = 747388968 $q$, 'CAMPO_IMUTAVEL', 'a data de disponibilização não muda');
select t.falha($q$ update public.intimacoes set status = 'inventado' where djen_id = 747388968 $q$, 'violates check', 'status fora da lista é recusado');
update public.intimacoes set status = 'nova' where djen_id = 747388968;
select t.ok((select tratada_em is null from public.intimacoes where djen_id = 747388968), 'reabrir limpa o tratamento');
select t.sem_efeito($q$ delete from public.intimacoes where djen_id = 747388968 $q$, 'coordenação não exclui');

\echo == I3. Gerência exclui; auditoria registra o tratamento
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.ok(t.n($q$ select 1 from public.intimacoes $q$) = 1, 'gerência lê');
select t.admin_db();
select t.ok(exists (select 1 from public.auditoria where tabela = 'intimacoes' and acao like 'Alterado%'), 'mudanças de tratamento ficam na auditoria');
select t.ok(not exists (select 1 from public.auditoria where tabela = 'intimacoes' and acao like 'Criado%'), 'a carga das comunicações não enche a auditoria');

\echo == I4. Isolamento
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(t.n($q$ select 1 from public.intimacoes $q$) = 0 and t.n($q$ select 1 from public.intimacoes_sync $q$) = 0, 'B não vê as intimações de A');
select t.sem_efeito($q$ update public.intimacoes set status = 'descartada' $q$, 'B não trata intimação de A');
select t.sem_efeito($q$ delete from public.intimacoes $q$, 'B não exclui intimação de A');

\echo == I5. Exclusão pela gerência de A e versão
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
delete from public.intimacoes where djen_id = 747388968;
select t.ok(t.n($q$ select 1 from public.intimacoes $q$) = 0, 'gerência exclui');
select t.admin_db();
select t.ok((select max(versao) from public.schema_versao) >= 12, 'versão do esquema 12 registrada');
select 'intimacoes ok' as msg;
