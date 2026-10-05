-- Integridade: funcionário com histórico, período fechado congelado, reabertura com motivo, decisões só do administrador.
\set ON_ERROR_STOP on
select t.admin_db();

\echo == I1. Funcionário com histórico não pode ser excluído (painel e API); sem histórico pode; desligar preserva tudo
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.falha($q$ delete from public.funcionarios where id = '00000000-0000-0000-0000-00000000a001' $q$, 'FUNCIONARIO_COM_HISTORICO', 'admin não exclui funcionário com marcações');
select t.admin_db();
select t.falha($q$ delete from public.funcionarios where id = '00000000-0000-0000-0000-00000000a001' $q$, 'FUNCIONARIO_COM_HISTORICO', 'nem o dono do banco exclui funcionário com histórico');
insert into public.funcionarios (id, escritorio_id, nome, vinculo) values ('00000000-0000-0000-0000-00000000a0d1', (select v::uuid from t.ctx where k='escA'), 'Dora Descartável', 'clt');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select definir_pin('00000000-0000-0000-0000-00000000a0d1', '357951');
select t.sem_efeito($q$ select 1 where false $q$, 'sem histórico: sem bloqueio indevido');
delete from public.funcionarios where id = '00000000-0000-0000-0000-00000000a0d1';
select t.ok(not exists (select 1 from public.funcionarios where id = '00000000-0000-0000-0000-00000000a0d1'), 'funcionário sem histórico foi excluído');
select t.admin_db();
select t.ok(not exists (select 1 from public.funcionario_pins where funcionario_id = '00000000-0000-0000-0000-00000000a0d1'), 'o hash do PIN dele saiu junto (cascade só em PIN)');
-- só ocorrência (sem ponto) já basta para bloquear
insert into public.funcionarios (id, escritorio_id, nome, vinculo) values ('00000000-0000-0000-0000-00000000a0d2', (select v::uuid from t.ctx where k='escA'), 'Edu Ocorrência', 'clt');
insert into public.ocorrencias (escritorio_id, funcionario_id, data_inicio, data_fim, tipo) values ((select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a0d2', current_date - 9, current_date - 9, 'outro');
select t.falha($q$ delete from public.funcionarios where id = '00000000-0000-0000-0000-00000000a0d2' $q$, 'FUNCIONARIO_COM_HISTORICO', 'ocorrência também conta como histórico');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
update public.funcionarios set ativo = false, data_desligamento = current_date where id = '00000000-0000-0000-0000-00000000a001';
select t.ok((select count(*) from public.registros_ponto where funcionario_id = '00000000-0000-0000-0000-00000000a001') >= 2, 'desligar preserva o histórico');
update public.funcionarios set ativo = true, data_desligamento = null where id = '00000000-0000-0000-0000-00000000a001';

\echo == I2. Folha fechada congela o período
select t.admin_db();
-- período de teste: dois meses atrás, inteiro
create temp table per as select date_trunc('month', current_date - interval '2 months')::date as ini,
                                (date_trunc('month', current_date - interval '2 months') + interval '1 month - 1 day')::date as fim;
grant select on per to authenticated;
insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, horario_previsto, horario_real, status)
  select (select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a002', ini + 5, 'entrada', '08:00', (ini + 5)::timestamptz + interval '11 hours', 'no_horario' from per;
insert into public.registros_ponto (id, escritorio_id, funcionario_id, data, tipo, horario_previsto, horario_real, status, status_aprovacao, analise)
  select '00000000-0000-0000-0000-0000000000c1', (select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a002', ini + 6, 'entrada', '08:00', (ini + 6)::timestamptz + interval '12 hours', 'atraso', 'aprovado', 'pendente' from per;

select t.como((select v::uuid from t.ctx where k = 'adminA'));
-- não fecha com atraso ainda em análise
select t.falha($q$ insert into public.folhas (funcionario_id, periodo_inicio, periodo_fim, status) select '00000000-0000-0000-0000-00000000a002', ini, fim, 'fechada' from per $q$, 'ANALISES_PENDENTES', 'não fecha a folha com atraso em análise');
-- admin decide o atraso
update public.registros_ponto set analise = 'recusada', motivo_decisao = 'Sem comprovante' where id = '00000000-0000-0000-0000-0000000000c1';
select t.ok((select decidido_por from public.registros_ponto where id = '00000000-0000-0000-0000-0000000000c1') = (select v::uuid from t.ctx where k='adminA'), 'decisão registra quem decidiu');
insert into public.folhas (funcionario_id, periodo_inicio, periodo_fim, status, valor_final, salario_mensal) select '00000000-0000-0000-0000-00000000a002', ini, fim, 'fechada', 1500, 2000 from per;
select t.ok(true, 'folha fecha depois da decisão');

select t.falha($q$ insert into public.registros_ponto (funcionario_id, data, tipo) select '00000000-0000-0000-0000-00000000a002', ini + 9, 'entrada' from per $q$, 'PERIODO_FECHADO', 'não insere marcação em período fechado');
select t.falha($q$ update public.registros_ponto set diferenca_minutos = 1 where id = '00000000-0000-0000-0000-0000000000c1' $q$, 'PERIODO_FECHADO', 'não edita marcação em período fechado');
select t.falha($q$ delete from public.registros_ponto where id = '00000000-0000-0000-0000-0000000000c1' $q$, 'PERIODO_FECHADO', 'não exclui marcação em período fechado');
select t.falha($q$ insert into public.ocorrencias (funcionario_id, data_inicio, data_fim, tipo) select '00000000-0000-0000-0000-00000000a002', ini - 2, ini + 1, 'atestado' from per $q$, 'PERIODO_FECHADO', 'ocorrência que encosta no período fechado é recusada');
select t.falha($q$ insert into public.ajustes_dia (funcionario_id, data, situacao) select '00000000-0000-0000-0000-00000000a002', ini + 3, 'falta' from per $q$, 'PERIODO_FECHADO', 'não lança ajuste de dia em período fechado');
select t.falha($q$ insert into public.ajustes_folha (funcionario_id, data, tipo, valor, motivo) select '00000000-0000-0000-0000-00000000a002', ini + 3, 'adicional', 10, 'x' from per $q$, 'PERIODO_FECHADO', 'não lança ajuste de folha em período fechado');
select t.falha($q$ update public.folhas set valor_final = 9999 where funcionario_id = '00000000-0000-0000-0000-00000000a002' $q$, 'FOLHA_FECHADA', 'valores congelados não são editáveis sem reabrir');
select t.falha($q$ delete from public.folhas where funcionario_id = '00000000-0000-0000-0000-00000000a002' $q$, 'PERIODO_FECHADO', 'folha fechada não é excluída');
select t.falha($q$ delete from public.funcionarios where id = '00000000-0000-0000-0000-00000000a002' $q$, 'FUNCIONARIO_COM_HISTORICO', 'funcionário com folha não é excluído');
-- fora do período fechado continua livre
insert into public.ajustes_folha (funcionario_id, data, tipo, valor, motivo) select '00000000-0000-0000-0000-00000000a002', fim + 1, 'adicional', 10, 'mês seguinte' from per;
select t.ok(true, 'ajuste fora do período fechado é permitido');

\echo == I3. Gerência também é barrada (apesar de não ler folhas)
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.falha($q$ update public.registros_ponto set diferenca_minutos = 1 where id = '00000000-0000-0000-0000-0000000000c1' $q$, 'PERIODO_FECHADO', 'gerência não edita marcação de período fechado');
select t.falha($q$ insert into public.ocorrencias (funcionario_id, data_inicio, data_fim, tipo) select '00000000-0000-0000-0000-00000000a002', ini + 2, ini + 2, 'outro' from per $q$, 'PERIODO_FECHADO', 'gerência não lança ocorrência em período fechado');
select t.falha($q$ update public.ocorrencias set status_analise = 'recusada' where id = '00000000-0000-0000-0000-0000000000a9' $q$, 'SO_ADMINISTRADOR', 'gerência não decide atestados');
select t.sem_efeito($q$ update public.folhas set status = 'aberta', motivo_reabertura = 'tentativa da gerência' $q$, 'gerência não reabre folha (sem acesso)');

\echo == I3b. A gerência enxerga QUAIS períodos estão fechados (sem ler folhas)
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.ok(t.n('select 1 from periodos_fechados()') = 1, 'gerência lista os períodos fechados do próprio escritório');
select t.ok(t.n('select 1 from periodos_fechados() where funcionario_id = ''00000000-0000-0000-0000-00000000b001''') = 0, 'e nenhum do escritório B');
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(t.n('select 1 from periodos_fechados()') = 0, 'escritório B não vê períodos de A');
select t.anon();
select t.falha($q$ select periodos_fechados() $q$, 'permission denied', 'anon não chama periodos_fechados');

\echo == I4. Reabrir exige motivo e fica na auditoria
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.falha($q$ update public.folhas set status = 'aberta' where funcionario_id = '00000000-0000-0000-0000-00000000a002' $q$, 'MOTIVO_REABERTURA', 'reabrir sem motivo é recusado');
select t.falha($q$ update public.folhas set status = 'aberta', motivo_reabertura = 'oi' where funcionario_id = '00000000-0000-0000-0000-00000000a002' $q$, 'MOTIVO_REABERTURA', 'motivo curto é recusado');
update public.folhas set status = 'paga' where funcionario_id = '00000000-0000-0000-0000-00000000a002';
select t.ok((select status from public.folhas where funcionario_id = '00000000-0000-0000-0000-00000000a002') = 'paga', 'fechada pode virar paga');
update public.folhas set status = 'aberta', motivo_reabertura = 'Correção de um atestado entregue depois' where funcionario_id = '00000000-0000-0000-0000-00000000a002';
select t.ok((select reaberta_por from public.folhas where funcionario_id = '00000000-0000-0000-0000-00000000a002') = (select v::uuid from t.ctx where k='adminA'), 'registra quem reabriu');
select t.ok((select count(*) from public.auditoria where acao = 'Folha reaberta' and detalhe like '%Correção de um atestado%') = 1, 'a reabertura (com o motivo) está na auditoria');
update public.registros_ponto set diferenca_minutos = 1 where id = '00000000-0000-0000-0000-0000000000c1';
select t.ok(true, 'reaberta: a marcação volta a ser editável');
update public.folhas set valor_final = 1600 where funcionario_id = '00000000-0000-0000-0000-00000000a002';
select t.ok(true, 'reaberta: a folha volta a ser editável');

\echo == I5. Decisão do administrador sobre atestado enviado pelo funcionário
select t.admin_db();
insert into public.ocorrencias (id, escritorio_id, funcionario_id, data_inicio, data_fim, tipo, origem, status_analise)
  values ('00000000-0000-0000-0000-0000000000c2', (select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a002', current_date - 4, current_date - 4, 'atestado', 'funcionario', 'pendente');
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.falha($q$ update public.ocorrencias set status_analise = 'aceita' where id = '00000000-0000-0000-0000-0000000000c2' $q$, 'SO_ADMINISTRADOR', 'gerência não aceita atestado');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
update public.ocorrencias set status_analise = 'aceita' where id = '00000000-0000-0000-0000-0000000000c2';
select t.ok((select decidido_em from public.ocorrencias where id = '00000000-0000-0000-0000-0000000000c2') is not null, 'administrador aceita e fica registrado quando');
select t.admin_db();
