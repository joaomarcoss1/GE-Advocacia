-- Delegação: papel coordenador, tarefas/prazos, CNJ, andamentos imutáveis, visão do funcionário (PIN) e isolamento entre escritórios.
\set ON_ERROR_STOP on
select t.admin_db();

\echo == D1. Número de processo (CNJ) com dígito verificador
do $$
declare base text := '000123420248260001'; dd text; n text;
begin
  -- N(7) AAAA(4) JTR(3) OOOO(4) + "00" -> DD = 98 - (valor mod 97)
  dd := lpad((98 - ((substr(base, 1, 7) || substr(base, 8, 4) || substr(base, 12, 3) || substr(base, 15, 4) || '00')::numeric % 97))::int::text, 2, '0');
  n := substr(base, 1, 7) || dd || substr(base, 8, 4) || substr(base, 12, 3) || substr(base, 15, 4);
  perform set_config('t.cnj', n, false);
  perform t.ok(public.cnj_normalizar(n) = substr(n,1,7) || '-' || dd || '.2024.8.26.0001', 'CNJ válido é normalizado com máscara');
  perform t.ok(public.cnj_normalizar(substr(n,1,7) || lpad(((dd::int + 1) % 100)::text, 2, '0') || substr(n, 10)) is null, 'dígito verificador errado é recusado');
  perform t.ok(public.cnj_normalizar('123') is null, 'número curto é recusado');
  -- paridade com src/lib/cnj.ts (o app gera 0001234-77.2024.8.26.0001 para os mesmos campos)
  perform t.ok(dd = '77' and public.cnj_normalizar('0001234-77.2024.8.26.0001') = '0001234-77.2024.8.26.0001', 'SQL e TypeScript calculam o mesmo dígito verificador');
  perform t.ok(public.cnj_normalizar('0012345-68.2025.8.10.0001') = '0012345-68.2025.8.10.0001', 'número de demonstração do app é válido no banco');
end $$;

\echo == D2. Coordenador criado pelo administrador do escritório A
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select criar_usuario('coord.a@t.com', 'segredo123', 'Coordenadora A', 'coordenador');
select t.falha($q$ select criar_usuario('x@t.com', 'segredo123', 'X', 'superuser') $q$, 'PAPEL_INVALIDO', 'papel inexistente é recusado');
select t.admin_db();
insert into t.ctx select 'coordA', id::text from public.perfis where email = 'coord.a@t.com';

\echo == D3. Administrador A delega tarefas
select t.como((select v::uuid from t.ctx where k = 'adminA'));
do $$
declare ea uuid := (select v::uuid from t.ctx where k = 'escA'); cnj text := current_setting('t.cnj');
begin
  insert into public.tarefas (id, tipo, titulo, prioridade, responsavel_id, revisor_id, participantes, processo_numero, area, cliente, inicio, fim, prazo_fatal)
  values ('00000000-0000-0000-0000-0000000d0001', 'prazo', '  Contestação  ', 'urgente', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a002',
          array['00000000-0000-0000-0000-00000000a002']::uuid[], cnj, 'civel', 'Cliente Exemplo', now() + interval '3 days', now() + interval '3 days', true);
  perform t.ok((select titulo from public.tarefas where id = '00000000-0000-0000-0000-0000000d0001') = 'Contestação', 'título é aparado');
  perform t.ok((select escritorio_id from public.tarefas where id = '00000000-0000-0000-0000-0000000d0001') = ea, 'tarefa nasce no escritório do usuário');
  perform t.ok((select criado_por_nome from public.tarefas where id = '00000000-0000-0000-0000-0000000d0001') is not null, 'autoria registrada');
  perform t.ok((select processo_numero from public.tarefas where id = '00000000-0000-0000-0000-0000000d0001') like '%-%.2024.8.26.0001', 'processo gravado com máscara');
end $$;
select t.falha($q$ insert into public.tarefas (titulo, processo_numero) values ('x', '1234567-00.2024.8.26.0001') $q$, 'PROCESSO_INVALIDO', 'processo com dígito errado é recusado');
select t.falha($q$ insert into public.tarefas (titulo, responsavel_id) values ('x', '00000000-0000-0000-0000-00000000b001') $q$, 'RESPONSAVEL_INVALIDO', 'responsável de outro escritório é recusado');
select t.falha($q$ insert into public.tarefas (titulo, participantes) values ('x', array['00000000-0000-0000-0000-00000000b001']::uuid[]) $q$, 'PARTICIPANTE_INVALIDO', 'participante de outro escritório é recusado');
select t.falha($q$ insert into public.tarefas (tipo, titulo) values ('audiencia', 'sem data') $q$, 'tarefas_check', 'audiência exige data');
select t.falha($q$ insert into public.tarefas (tipo, titulo, inicio, fim) values ('reuniao', 'x', now(), now() - interval '1 hour') $q$, 'tarefas_check', 'fim antes do início é recusado');
insert into public.tarefas (id, tipo, titulo, inicio, fim, local) values
  ('00000000-0000-0000-0000-0000000d0002', 'reuniao', 'Reunião de sócios', now() + interval '1 day', now() + interval '1 day 1 hour', 'Sala 2');

\echo == D4. Coordenador: vê o escritório, edita só o que criou, não lê dados pessoais
select t.como((select v::uuid from t.ctx where k = 'coordA'));
select t.ok(t.n('select 1 from public.tarefas') = 2, 'coordenador vê as tarefas do escritório');
insert into public.tarefas (id, titulo, responsavel_id) values ('00000000-0000-0000-0000-0000000d0003', 'Minuta de contrato', '00000000-0000-0000-0000-00000000a001');
select t.sem_efeito($q$ update public.tarefas set titulo = 'alterada' where id = '00000000-0000-0000-0000-0000000d0001' $q$, 'coordenador não altera tarefa criada por outro');
select t.sem_efeito($q$ delete from public.tarefas where id = '00000000-0000-0000-0000-0000000d0001' $q$, 'coordenador não exclui tarefa criada por outro');
update public.tarefas set prioridade = 'alta' where id = '00000000-0000-0000-0000-0000000d0003';
select t.ok((select prioridade from public.tarefas where id = '00000000-0000-0000-0000-0000000d0003') = 'alta', 'coordenador altera a que ele criou');
select t.sem_acesso('funcionarios', 'coordenador não lê o cadastro (salário/CPF)');
select t.sem_acesso('registros_ponto', 'coordenador não lê o ponto');
select t.sem_acesso('folhas', 'coordenador não lê a folha');
select t.sem_acesso('ocorrencias', 'coordenador não lê ocorrências/atestados');
select t.sem_acesso('anexos', 'coordenador não lê anexos');
select t.ok((select count(*) from public.equipe()) >= 2, 'coordenador vê a equipe (sem dados sensíveis) para delegar');
select t.falha($q$ select definir_pin('00000000-0000-0000-0000-00000000a001', '482913') $q$, 'SEM_PERMISSAO', 'coordenador não mexe em PIN');
select t.falha($q$ select criar_usuario('y@t.com', 'segredo123', 'Y', 'admin') $q$, 'SEM_PERMISSAO', 'coordenador não cria acessos');
select t.falha($q$ insert into public.tarefas (escritorio_id, titulo) values ((select v::uuid from t.ctx where k = 'escB'), 'invasão') $q$, 'row-level security', 'coordenador não cria tarefa em outro escritório');

\echo == D5. Gerência altera qualquer tarefa; andamentos automáticos e imutáveis
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
update public.tarefas set status = 'em_andamento' where id = '00000000-0000-0000-0000-0000000d0001';
select t.ok((select count(*) from public.tarefa_andamentos where tarefa_id = '00000000-0000-0000-0000-0000000d0001' and tipo = 'status') = 1, 'mudança de status gera andamento');
insert into public.tarefa_andamentos (tarefa_id, texto, autor_nome, autor_usuario) values ('00000000-0000-0000-0000-0000000d0001', 'Protocolo conferido', 'Gerente A', t.id_perfil('gerente.a@t.com'));
select t.falha($q$ insert into public.tarefa_andamentos (tarefa_id, texto, autor_nome, autor_usuario) values ('00000000-0000-0000-0000-0000000d0001', 'falso', 'Outro', t.id_perfil('admin.a@t.com')) $q$, 'row-level security', 'não dá para assinar andamento como outra pessoa');
select t.sem_efeito($q$ update public.tarefa_andamentos set texto = 'editado' $q$, 'andamento não se edita (RLS)');
select t.sem_efeito($q$ delete from public.tarefa_andamentos $q$, 'andamento não se apaga (RLS)');
select t.admin_db();
select t.falha($q$ update public.tarefa_andamentos set texto = 'editado' $q$, 'ANDAMENTO_IMUTAVEL', 'nem o dono do banco edita andamento (gatilho)');
select t.falha($q$ delete from public.tarefa_andamentos where tipo = 'status' $q$, 'ANDAMENTO_IMUTAVEL', 'nem o dono do banco apaga andamento (gatilho)');
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.falha($q$ update public.tarefas set escritorio_id = (select v::uuid from t.ctx where k = 'escB') where id = '00000000-0000-0000-0000-0000000d0001' $q$, 'ESCRITORIO_IMUTAVEL', 'tarefa não muda de escritório');

\echo == D6. Isolamento: o escritório B não vê nem toca nas tarefas de A
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(t.n('select 1 from public.tarefas') = 0, 'B não vê tarefas de A');
select t.ok(t.n('select 1 from public.tarefa_andamentos') = 0, 'B não vê andamentos de A');
select t.sem_efeito($q$ update public.tarefas set titulo = 'x' $q$, 'B não altera tarefas de A');
select t.sem_efeito($q$ delete from public.tarefas $q$, 'B não exclui tarefas de A');
insert into public.tarefas (id, titulo, responsavel_id) values ('00000000-0000-0000-0000-0000000d00b1', 'Tarefa de B', '00000000-0000-0000-0000-00000000b001');
select t.ok(t.n('select 1 from public.tarefas') = 1, 'B vê só a sua');
select t.admin_db();
select t.ok((select count(*) from public.tarefas where escritorio_id = (select v::uuid from t.ctx where k = 'escA')) = 3, 'A continua com as suas 3');

\echo == D7. Funcionário (PIN): vê e atualiza só o que é dele
select t.anon();
select t.ok((ponto_tarefas('00000000-0000-0000-0000-00000000a001', '000000') ->> 'erro') = 'PIN_INVALIDO', 'PIN errado não lista tarefas');
select t.ok(jsonb_array_length(ponto_tarefas('00000000-0000-0000-0000-00000000a001', '482913') -> 'tarefas') = 2, 'Ana vê as 2 tarefas em que é responsável');
select t.ok(jsonb_array_length(ponto_tarefas('00000000-0000-0000-0000-00000000a002', '739105') -> 'tarefas') = 1, 'Beto (revisor/participante) vê 1');
select t.ok((ponto_tarefas('00000000-0000-0000-0000-00000000a002', '739105') -> 'tarefas' -> 0 ->> 'papel') in ('revisor', 'participante'), 'Beto não é o responsável');
select t.ok(jsonb_array_length(ponto_tarefas('00000000-0000-0000-0000-00000000b001', '561847') -> 'tarefas') = 1, 'Bia vê só a tarefa do escritório B');
select t.ok((ponto_tarefa_atualizar('00000000-0000-0000-0000-00000000a002', '739105', '00000000-0000-0000-0000-0000000d0001', 'concluida') ->> 'erro') = 'NAO_ENCONTRADO', 'quem não é responsável não altera o status');
select t.ok((ponto_tarefa_atualizar('00000000-0000-0000-0000-00000000b001', '561847', '00000000-0000-0000-0000-0000000d0001', 'concluida') ->> 'erro') = 'NAO_ENCONTRADO', 'funcionário de B não toca em tarefa de A');
select t.ok((ponto_tarefa_atualizar('00000000-0000-0000-0000-00000000a001', '482913', '00000000-0000-0000-0000-0000000d0001', 'cancelada') ->> 'erro') = 'STATUS_INVALIDO', 'funcionário não cancela tarefa');
select t.ok((ponto_tarefa_atualizar('00000000-0000-0000-0000-00000000a001', '482913', '00000000-0000-0000-0000-0000000d0001', 'concluida', 'Peça protocolada') ->> 'ok') = 'true', 'responsável conclui com nota');
select t.admin_db();
select t.ok((select status from public.tarefas where id = '00000000-0000-0000-0000-0000000d0001') = 'concluida', 'status gravado');
select t.ok((select concluida_em is not null from public.tarefas where id = '00000000-0000-0000-0000-0000000d0001'), 'data de conclusão gravada');
select t.ok((select count(*) from public.tarefa_andamentos where tarefa_id = '00000000-0000-0000-0000-0000000d0001' and autor_funcionario = '00000000-0000-0000-0000-00000000a001' and texto like '%Peça protocolada%') = 1, 'andamento do funcionário com a nota');
select t.ok((select count(*) from public.tarefa_andamentos where tarefa_id = '00000000-0000-0000-0000-0000000d0001' and tipo = 'status') = 2, 'sem duplicar andamento de status');

\echo == D8. Google: tokens fora do alcance da API
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.sem_acesso('google_conexoes', 'ninguém lê tokens do Google pela API');
select t.falha($q$ insert into public.google_conexoes (usuario_id, escritorio_id, refresh_token_enc) values (auth.uid(), (select v::uuid from t.ctx where k = 'escA'), 'x') $q$, 'permission denied', 'ninguém grava tokens pela API');
select t.falha($q$ insert into public.tarefa_google (tarefa_id, escritorio_id, usuario_id) values ('00000000-0000-0000-0000-0000000d0001', (select v::uuid from t.ctx where k = 'escA'), auth.uid()) $q$, 'permission denied', 'ninguém grava sincronização pela API');
select t.ok((google_status() ->> 'conectado') = 'false', 'sem conexão por padrão');
select t.admin_db();
insert into public.google_conexoes (usuario_id, escritorio_id, email_google, refresh_token_enc) values
  ((select v::uuid from t.ctx where k = 'adminA'), (select v::uuid from t.ctx where k = 'escA'), 'adm@gmail.test', 'cifrado');
insert into public.tarefa_google (tarefa_id, escritorio_id, usuario_id, event_id, sync_em) values
  ('00000000-0000-0000-0000-0000000d0001', (select v::uuid from t.ctx where k = 'escA'), (select v::uuid from t.ctx where k = 'adminA'), 'evt1', now());
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.ok((google_status() ->> 'conectado') = 'true', 'status mostra conectado');
select t.ok(not (google_status()::text like '%cifrado%'), 'status não expõe o token');
select t.ok(t.n('select 1 from public.tarefa_google') = 1, 'administrador vê a sincronização da própria tarefa');
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(t.n('select 1 from public.tarefa_google') = 0, 'B não vê sincronizações de A');
select t.ok((google_status() ->> 'conectado') = 'false', 'B não herda a conexão de A');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select google_desconectar();
select t.admin_db();
select t.ok((select count(*) from public.google_conexoes where usuario_id = (select v::uuid from t.ctx where k = 'adminA')) = 0, 'desconectar apaga o token');

\echo == D9. Funcionário com tarefa não é excluído; auditoria registra a delegação
do $$
begin
  begin
    delete from public.funcionarios where id = '00000000-0000-0000-0000-00000000a001';
    raise exception 'FALHOU: funcionário com tarefas foi excluído';
  exception when foreign_key_violation or raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok - funcionário com tarefas não é excluído (%)', left(sqlerrm, 40);
  end;
end $$;
select t.ok((select count(*) from public.auditoria where tabela = 'tarefas' and escritorio_id = (select v::uuid from t.ctx where k = 'escA')) >= 3, 'delegações ficam na auditoria');
select t.ok((select count(*) from public.auditoria where tabela = 'tarefas' and detalhe like '%Contestação%') >= 1, 'auditoria usa o título como rótulo');
select 'delegação ok' as msg;
