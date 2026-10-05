-- Ponto por PIN: bloqueio, cerca de GPS, duplicidade, retroativo, aprovação, fuso do escritório.
\set ON_ERROR_STOP on
select t.admin_db();

\echo == P1. PIN errado, entrada pontual e duplicada
select t.anon();
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a001', '000000', 'entrada') ->> 'erro') = 'PIN_INVALIDO', 'PIN errado é recusado');
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a001', '482913', 'entrada') ->> 'ok') = 'true', 'entrada pontual é registrada');
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a001', '482913', 'entrada') ->> 'erro') = 'JA_REGISTRADO', 'segunda entrada no mesmo dia é recusada');
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a001', '482913', 'tipo_x') ->> 'erro') = 'TIPO_INVALIDO', 'tipo inválido');

\echo == P2. Saída antecipada exige justificativa e vai para análise
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a001', '482913', 'saida') ->> 'erro') = 'JUSTIFICATIVA_OBRIGATORIA', 'saída antecipada sem justificativa');
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a001', '482913', 'saida', 'Audiência externa') ->> 'analise') = 'pendente', 'com justificativa entra em análise (pendente)');

\echo == P3. Bloqueio após 5 erros seguidos
select ponto_bater('00000000-0000-0000-0000-00000000a002', '111111', 'entrada') from generate_series(1, 5);
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a002', '739105', 'entrada') ->> 'erro') = 'PIN_BLOQUEADO', 'após 5 erros, até o PIN certo fica bloqueado');
select t.ok((ponto_historico('00000000-0000-0000-0000-00000000a002', '739105') ->> 'erro') = 'PIN_BLOQUEADO', 'o bloqueio vale também para o histórico');
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a001', '482913', 'entrada') ->> 'erro') = 'JA_REGISTRADO', 'colega (Ana) não é bloqueada pelos erros de Beto');
-- admin redefine o PIN e libera
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select definir_pin('00000000-0000-0000-0000-00000000a002', '739105');
select t.falha($q$ select definir_pin('00000000-0000-0000-0000-00000000a002', '123456') $q$, 'PIN_FRACO', 'PIN em sequência é recusado');
select t.falha($q$ select definir_pin('00000000-0000-0000-0000-00000000a002', '111111') $q$, 'PIN_FRACO', 'PIN repetido é recusado');
select t.falha($q$ select definir_pin('00000000-0000-0000-0000-00000000a002', '12') $q$, 'PIN_FORMATO', 'PIN curto é recusado');
select t.anon();
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a002', '739105', 'entrada') ->> 'ok') = 'true', 'PIN redefinido libera o ponto');

\echo == P4. Histórico
select t.ok(jsonb_array_length(ponto_historico('00000000-0000-0000-0000-00000000a001', '482913') -> 'registros') >= 2, 'histórico de Ana traz as marcações dela');

\echo == P5. Cerca de GPS
select t.como((select v::uuid from t.ctx where k = 'adminA'));
update public.configuracoes set dados = jsonb_set(dados, '{ponto}', dados -> 'ponto' || '{"geofence_ativo": true, "geofence_lat": -4.4608, "geofence_lng": -43.8881, "geofence_raio_m": 300}'::jsonb);
select t.anon();
-- cria um funcionário novo, sem marcações, para testar a cerca
select t.admin_db();
insert into public.funcionarios (id, escritorio_id, nome, salario_mensal, escala_id, vinculo, data_admissao)
  values ('00000000-0000-0000-0000-00000000a003', (select v::uuid from t.ctx where k = 'escA'), 'Carla Cerca', 1800,
          (select id from public.escalas where escritorio_id = (select v::uuid from t.ctx where k = 'escA') and nome = 'T-agora'), 'clt', current_date - 30);
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select definir_pin('00000000-0000-0000-0000-00000000a003', '845216');
select t.anon();
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a003', '845216', 'entrada') ->> 'erro') = 'GPS_OBRIGATORIO', 'cerca ativa: sem GPS é recusado');
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a003', '845216', 'entrada', null, -4.0, -43.0) ->> 'erro') = 'FORA_DA_AREA', 'cerca ativa: longe do escritório é recusado');
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a003', '845216', 'entrada', null, 95, 10) ->> 'erro') = 'GPS_OBRIGATORIO', 'coordenada inválida');
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a003', '845216', 'entrada', null, -4.4609, -43.8882) ->> 'ok') = 'true', 'cerca ativa: dentro do raio é aceito');
-- escritório B tem a própria cerca (desligada): a de A não vale para B
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000b002', '902716', 'entrada') ->> 'ok') = 'true', 'cerca de A não afeta o escritório B');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
update public.configuracoes set dados = jsonb_set(dados, '{ponto}', (dados -> 'ponto') || '{"geofence_lat": null, "geofence_lng": null}'::jsonb);
select t.anon();
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a003', '845216', 'saida', 'x', -4.4609, -43.8882) ->> 'erro') = 'LOCAL_NAO_CONFIGURADO', 'cerca ativa sem local definido recusa (nunca "abre")');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
update public.configuracoes set dados = jsonb_set(dados, '{ponto,geofence_ativo}', 'false');
select t.anon();

\echo == P6. Fuso do escritório (B está em Manaus, UTC-4)
select t.ok((ponto_contexto('barbosa-t') ->> 'fuso') = 'America/Manaus', 'fuso de B vem do cadastro');
select t.admin_db();
select t.ok((select r.data from public.registros_ponto r where funcionario_id = '00000000-0000-0000-0000-00000000b002' and tipo = 'entrada') = (now() at time zone 'America/Manaus')::date, 'data da marcação de B usa o relógio de Manaus');
select t.ok((select status from public.registros_ponto where funcionario_id = '00000000-0000-0000-0000-00000000b002' and tipo = 'entrada') = 'no_horario', 'marcação de B no horário previsto (escala em hora local de Manaus)');

\echo == P7. Marcação retroativa
select t.anon();
select t.ok((ponto_retroativo('00000000-0000-0000-0000-00000000a001', '482913', current_date, 'entrada', '08:00', 'esqueci') ->> 'erro') = 'USE_PONTO_NORMAL', 'retroativo de hoje é recusado');
select t.ok((ponto_retroativo('00000000-0000-0000-0000-00000000a001', '482913', current_date - 90, 'entrada', '08:00', 'esqueci') ->> 'erro') = 'DATA_MUITO_ANTIGA', 'mais de 45 dias é recusado');
select t.ok((ponto_retroativo('00000000-0000-0000-0000-00000000a001', '482913', current_date - 2, 'entrada', '8h', 'esqueci') ->> 'erro') = 'HORA_INVALIDA', 'hora inválida');
select t.ok((ponto_retroativo('00000000-0000-0000-0000-00000000a001', '482913', current_date - 2, 'entrada', '08:00', 'x') ->> 'erro') = 'JUSTIFICATIVA_OBRIGATORIA', 'justificativa curta');
select t.ok((ponto_retroativo('00000000-0000-0000-0000-00000000a001', '482913', current_date - 2, 'entrada', '08:00', 'Esqueci de bater') ->> 'ok') = 'true', 'retroativo válido entra pendente');
select t.ok((ponto_retroativo('00000000-0000-0000-0000-00000000a001', '482913', current_date - 2, 'entrada', '08:05', 'Esqueci de bater') ->> 'erro') = 'JA_REGISTRADO', 'retroativo duplicado');

\echo == P8. Aprovação pela gerência (só do próprio escritório)
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.falha($q$ select aprovar_ponto((select id from public.registros_ponto where retroativo and funcionario_id = '00000000-0000-0000-0000-00000000a001' limit 1), 'rejeitar') $q$, 'MOTIVO_OBRIGATORIO', 'rejeitar exige motivo');
select t.ok((aprovar_ponto((select id from public.registros_ponto where retroativo and funcionario_id = '00000000-0000-0000-0000-00000000a001' limit 1), 'aprovar') ->> 'ok') = 'true', 'gerência aprova o ajuste');
select t.admin_db();
select t.ok((select status_aprovacao from public.registros_ponto where retroativo and funcionario_id = '00000000-0000-0000-0000-00000000a001') = 'aprovado', 'marcação ficou aprovada');
select t.falha($q$ select aprovar_ponto('00000000-0000-0000-0000-0000000000a8', 'aprovar') $q$, 'SEM_PERMISSAO', 'sem login não aprova');

\echo == P9. Índice único: duplicata é barrada pelo banco
select t.falha($q$ insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, status_aprovacao) values ((select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a001', current_date - 2, 'entrada', 'aprovado') $q$, 'registros_ponto_unico_idx', 'duplicata direta no banco é barrada');
insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, status_aprovacao, motivo_rejeicao) values ((select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a001', current_date - 2, 'entrada', 'rejeitado', 'teste');
select t.ok(true, 'marcação REJEITADA do mesmo tipo/dia pode coexistir (permite refazer)');

\echo == P10. Migração com duplicatas pré-existentes não falha: mantém a mais antiga e rejeita as demais
drop index public.registros_ponto_unico_idx;
insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, status_aprovacao, horario_real) values
  ((select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a002', current_date - 11, 'entrada', 'aprovado', now() - interval '3 hours'),
  ((select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a002', current_date - 11, 'entrada', 'aprovado', now() - interval '2 hours'),
  ((select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a002', current_date - 11, 'entrada', 'aprovado', now() - interval '1 hour');
\i migrations/0002_ponto.sql
\i migrations/0006_delegacao.sql
\i migrations/0007_processos_documentos.sql
select t.ok((select count(*) from public.registros_ponto where funcionario_id = '00000000-0000-0000-0000-00000000a002' and data = current_date - 11 and status_aprovacao <> 'rejeitado') = 1, 'sobrou uma única marcação ativa');
select t.ok((select count(*) from public.registros_ponto where funcionario_id = '00000000-0000-0000-0000-00000000a002' and data = current_date - 11 and motivo_rejeicao like 'Duplicidade removida%') = 2, 'as duas excedentes foram rejeitadas com motivo explícito');
select t.ok((select horario_real from public.registros_ponto where funcionario_id = '00000000-0000-0000-0000-00000000a002' and data = current_date - 11 and status_aprovacao <> 'rejeitado') < now() - interval '2 hours 30 minutes', 'a mantida é a mais antiga');
select t.ok(exists (select 1 from pg_indexes where indexname = 'registros_ponto_unico_idx'), 'o índice único foi recriado');

\echo == P11. Auditoria dos eventos de ponto (imutável)
select t.ok((select count(*) from public.auditoria where tabela = 'registros_ponto' and escritorio_id = (select v::uuid from t.ctx where k='escA')) > 0, 'marcações geram trilha de auditoria');
select t.falha($q$ update public.auditoria set acao = 'x' $q$, 'REGISTRO_IMUTAVEL', 'auditoria não aceita edição (nem do dono)');
select t.falha($q$ delete from public.auditoria $q$, 'REGISTRO_IMUTAVEL', 'auditoria não aceita exclusão (nem do dono)');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.falha($q$ update public.auditoria set acao = 'x' $q$, 'permission denied', 'administrador não edita a auditoria');
select t.falha($q$ delete from public.auditoria $q$, 'permission denied', 'administrador não apaga a auditoria');
