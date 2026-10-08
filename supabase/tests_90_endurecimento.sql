-- Endurecimento (0008): sem acesso direto do "anon" a tabelas; funções internas fechadas; funções públicas intactas; fluxos de quem tem login seguem.
\set ON_ERROR_STOP on
select t.admin_db();

\echo == E1. Sem login não há acesso direto a nenhuma tabela
select t.ok((select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public') = 0, 'anon não tem privilégio em nenhuma tabela de public');
select t.ok((select count(*) from information_schema.role_usage_grants where grantee = 'anon' and object_schema = 'public' and object_type = 'SEQUENCE') = 0, 'nem em sequências');
select t.anon();
select t.falha($q$ select count(*) from public.clientes $q$, 'permission denied', 'anon é barrado por permissão (e não só por RLS) em clientes');
select t.falha($q$ select count(*) from public.processos $q$, 'permission denied', 'e em processos');
select t.falha($q$ select count(*) from public.registros_ponto $q$, 'permission denied', 'e nos registros de ponto');
select t.falha($q$ select public._hhmm_min('08:00') $q$, 'permission denied', 'anon não chama função interna');
select t.admin_db();

\echo == E2. Funções internas não são chamáveis pela API
select t.ok((select count(*) from information_schema.routine_privileges r where r.routine_schema = 'public' and r.routine_name like '\_%' and r.grantee in ('anon', 'authenticated', 'PUBLIC')) = 0, 'nenhuma função interna (_*) é executável por anon, authenticated ou public');

\echo == E3. As funções públicas continuam disponíveis a quem não fez login
select t.ok((select count(*) from information_schema.routine_privileges r where r.routine_schema = 'public' and r.grantee = 'anon' and r.routine_name in ('ponto_bater', 'ponto_buscar', 'ponto_contexto', 'ponto_escala', 'ponto_historico', 'verificar_documento')) >= 6, 'ponto e verificação de documento seguem públicos');

\echo == E4. Quem tem login segue trabalhando (gatilhos e regras intactos)
select t.como((select v::uuid from t.ctx where k = 'adminA'));
insert into public.clientes (id, nome) values ('00000000-0000-0000-0000-00000000c901', 'Cliente do endurecimento');
select t.ok((select count(*) from public.clientes where id = '00000000-0000-0000-0000-00000000c901') = 1, 'administrador cria cliente (gatilhos e RLS funcionam)');
insert into public.tarefas (titulo) values ('Tarefa pós-endurecimento');
select t.ok((select count(*) from public.tarefas where titulo = 'Tarefa pós-endurecimento') = 1, 'e cria tarefa (gatilho de regras)');
select t.admin_db();
select t.ok((select max(versao) from public.schema_versao) >= 8, 'versão do esquema registrada');
select 'endurecimento ok' as msg;
