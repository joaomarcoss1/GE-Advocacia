-- Atestados: fluxo controlado de envio, rastro de acessos, lixeira do Storage e retenção (LGPD).
\set ON_ERROR_STOP on
select t.admin_db();

\echo == V1. Envio de atestado só pelo fluxo controlado (service_role)
select t.anon();
select t.falha($q$ select ponto_anexo_preparar('00000000-0000-0000-0000-00000000a002', '739105', null, '00000000-0000-0000-0000-0000000000c2', 'a.pdf', 'application/pdf', 100, 'x') $q$, 'permission denied', 'anon não registra anexo direto');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.falha($q$ select ponto_anexo_preparar('00000000-0000-0000-0000-00000000a002', '739105', null, '00000000-0000-0000-0000-0000000000c2', 'a.pdf', 'application/pdf', 100, 'x') $q$, 'permission denied', 'nem administrador registra anexo direto');
select t.falha($q$ insert into public.anexos (funcionario_id, ocorrencia_id, nome, mime, tamanho) values ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000c2', 'a.pdf', 'application/pdf', 10) $q$, 'permission denied', 'API não insere anexo');
select t.admin_db();

-- ocorrência pendente do funcionário (para receber anexo)
insert into public.ocorrencias (id, escritorio_id, funcionario_id, data_inicio, data_fim, tipo, origem, status_analise)
  values ('00000000-0000-0000-0000-0000000000d1', (select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a002', current_date - 1, current_date - 1, 'atestado', 'funcionario', 'pendente');
set role service_role;
select t.ok((ponto_anexo_preparar('00000000-0000-0000-0000-00000000a002', '000000', null, '00000000-0000-0000-0000-0000000000d1', 'a.pdf', 'application/pdf', 100, 'h') ->> 'erro') = 'PIN_INVALIDO', 'PIN errado não registra anexo');
select t.ok((ponto_anexo_preparar('00000000-0000-0000-0000-00000000a001', '482913', null, '00000000-0000-0000-0000-0000000000d1', 'a.pdf', 'application/pdf', 100, 'h') ->> 'erro') = 'NAO_ENCONTRADO', 'funcionário não anexa na ocorrência de outro');
select t.ok((ponto_anexo_preparar('00000000-0000-0000-0000-00000000a002', '739105', null, '00000000-0000-0000-0000-0000000000d1', 'a.exe', 'application/x-msdownload', 100, 'h') ->> 'erro') = 'ARQUIVO_INVALIDO', 'tipo não permitido');
select t.ok((ponto_anexo_preparar('00000000-0000-0000-0000-00000000a002', '739105', null, '00000000-0000-0000-0000-0000000000d1', 'a.pdf', 'application/pdf', 3000000, 'h') ->> 'erro') = 'ARQUIVO_INVALIDO', 'acima de 2 MB');
select t.ok((ponto_anexo_preparar('00000000-0000-0000-0000-00000000a002', '739105', null, null, 'a.pdf', 'application/pdf', 100, 'h') ->> 'erro') = 'NAO_ENCONTRADO', 'precisa de ocorrência OU marcação');
select t.ok((ponto_anexo_preparar('00000000-0000-0000-0000-00000000a002', '739105', null, '00000000-0000-0000-0000-0000000000d1', 'atestado médico/ç.pdf', 'application/pdf', 100, 'abc') ->> 'path') like (select v from t.ctx where k = 'escA') || '/00000000-0000-0000-0000-00000000a002/%', 'caminho do arquivo = escritório/funcionário/id');
select ponto_anexo_preparar('00000000-0000-0000-0000-00000000a002', '739105', null, '00000000-0000-0000-0000-0000000000d1', 'b.pdf', 'application/pdf', 100, 'h') from generate_series(1, 3);
select t.ok((ponto_anexo_preparar('00000000-0000-0000-0000-00000000a002', '739105', null, '00000000-0000-0000-0000-0000000000d1', 'e.pdf', 'application/pdf', 100, 'h') ->> 'erro') = 'LIMITE_ANEXOS', 'máximo de 4 arquivos por envio');
reset role;
select t.ok((select nome from public.anexos where funcionario_id = '00000000-0000-0000-0000-00000000a002' and sha256 = 'abc') = 'atestado m_dico__.pdf', 'nome do arquivo é saneado');

\echo == V2. Cada abertura de atestado fica registrada, e o registro é imutável
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select anexo_abrir((select id from public.anexos where sha256 = 'abc'));
select t.ok((select count(*) from public.acessos_sensiveis where anexo_id = (select id from public.anexos where sha256 = 'abc')) = 1, 'abertura registrada com usuário e anexo');
select t.falha($q$ update public.acessos_sensiveis set usuario = 'x' $q$, 'permission denied', 'administrador não edita o rastro de acessos');
select t.falha($q$ delete from public.acessos_sensiveis $q$, 'permission denied', 'administrador não apaga o rastro de acessos');
select t.falha($q$ insert into public.acessos_sensiveis (usuario, anexo_id) values ('forjado', gen_random_uuid()) $q$, 'permission denied', 'ninguém forja entradas no rastro (só a função anexo_abrir grava)');
select t.admin_db();
select t.falha($q$ update public.acessos_sensiveis set usuario = 'x' $q$, 'REGISTRO_IMUTAVEL', 'nem o dono do banco edita o rastro');

\echo == V3. Anexo apagado vai para a lixeira do Storage
select t.como((select v::uuid from t.ctx where k = 'adminA'));
delete from public.anexos where sha256 = 'abc';
select t.admin_db();
select t.ok((select count(*) from public.anexos_lixeira where storage_path like '%/00000000-0000-0000-0000-00000000a002/%') = 1, 'o caminho do arquivo apagado ficou na lixeira para o Storage');

\echo == V4. Retenção: prévia, execução e trilha (inclusive em período fechado)
-- dados antigos
insert into public.anexos (escritorio_id, funcionario_id, ocorrencia_id, nome, mime, tamanho, storage_path, created_at)
  values ((select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000d1', 'velho.pdf', 'application/pdf', 100, 'velho/path', now() - interval '70 months');
insert into public.registros_ponto (id, escritorio_id, funcionario_id, data, tipo, latitude, longitude, horario_real)
  values ('00000000-0000-0000-0000-0000000000e1', (select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a002', current_date - 400, 'entrada', -4.46, -43.88, now() - interval '400 days'),
         ('00000000-0000-0000-0000-0000000000e2', (select v::uuid from t.ctx where k='escB'), '00000000-0000-0000-0000-00000000b001', current_date - 400, 'entrada', -3.1, -60.0, now() - interval '400 days');
insert into public.folhas (escritorio_id, funcionario_id, periodo_inicio, periodo_fim, status)
  values ((select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a002', date_trunc('month', current_date - 400)::date, (date_trunc('month', current_date - 400) + interval '1 month - 1 day')::date, 'fechada');
insert into public.pin_tentativas (funcionario_id, escritorio_id, sucesso, created_at)
  values ('00000000-0000-0000-0000-00000000a002', (select v::uuid from t.ctx where k='escA'), false, now() - interval '120 days'),
         ('00000000-0000-0000-0000-00000000b001', (select v::uuid from t.ctx where k='escB'), false, now() - interval '120 days');

select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.falha($q$ select expurgo_executar(false) $q$, 'SEM_PERMISSAO', 'gerência não roda expurgo');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.ok((expurgo_executar(false) ->> 'anexos')::int = 1 and (expurgo_executar(false) ->> 'geolocalizacao')::int = 1 and (expurgo_executar(false) ->> 'tentativas_pin')::int = 1, 'prévia conta o que seria apagado (só do escritório A)');
select t.admin_db();
select t.ok((select count(*) from public.anexos where nome = 'velho.pdf') = 1, 'prévia não apaga nada');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.ok((expurgo_executar(true) ->> 'executado') = 'true', 'expurgo confirmado');
select t.admin_db();
select t.ok((select count(*) from public.anexos where nome = 'velho.pdf') = 0, 'anexo vencido foi apagado');
select t.ok((select count(*) from public.anexos_lixeira where storage_path = 'velho/path') = 1, 'e o arquivo foi para a lixeira do Storage');
select t.ok((select latitude is null and longitude is null from public.registros_ponto where id = '00000000-0000-0000-0000-0000000000e1'), 'geolocalização antiga zerada, mesmo em período fechado');
select t.ok((select data from public.registros_ponto where id = '00000000-0000-0000-0000-0000000000e1') = current_date - 400, 'a marcação em si (data/tipo) foi preservada');
select t.ok((select latitude from public.registros_ponto where id = '00000000-0000-0000-0000-0000000000e2') = -3.1, 'o escritório B não foi tocado');
select t.ok((select count(*) from public.pin_tentativas where created_at < now() - interval '90 days' and escritorio_id = (select v::uuid from t.ctx where k='escA')) = 0, 'tentativas de PIN antigas de A removidas');
select t.ok((select count(*) from public.pin_tentativas where created_at < now() - interval '90 days' and escritorio_id = (select v::uuid from t.ctx where k='escB')) = 1, 'tentativas de PIN de B intactas');
select t.ok((select count(*) from public.auditoria where acao = 'Expurgo de retenção' and escritorio_id = (select v::uuid from t.ctx where k='escA')) = 1, 'expurgo registrado na auditoria com um resumo');
select t.ok(expurgar_tentativas_antigas() >= 1, 'rotina automática limpa tentativas antigas (qualquer escritório)');
-- a exceção do expurgo NÃO vale para usuários comuns, mesmo forjando a configuração
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select set_config('ge.expurgo', 'on', false);
select t.falha($q$ insert into public._expurgo_ativo (tx) values (txid_current()) $q$, 'permission denied', 'usuário não escreve a permissão de expurgo');
select t.falha($q$ update public.registros_ponto set diferenca_minutos = 5 where id = '00000000-0000-0000-0000-0000000000e1' $q$, 'PERIODO_FECHADO', 'forjar ge.expurgo não destrava período fechado');
select t.admin_db();
