-- Segurança do banco (0014): superfície pública mínima, RLS em tudo, funções com search_path fixo, entradas hostis,
-- limite de taxa, entrada automática (ponto_acesso) e retenção do registro de acessos.
\set ON_ERROR_STOP on
select t.admin_db();

\echo == X1. Superfície: RLS em todas as tabelas, search_path nas funções privilegiadas, anon só no que é público
select t.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 'toda tabela de public tem RLS ligado');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef
                          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 'toda função SECURITY DEFINER fixa o search_path');
select t.ok((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute'))
            = array['ponto_bater', 'ponto_buscar', 'ponto_contexto', 'ponto_escala', 'ponto_historico', 'ponto_justificar_ausencia', 'ponto_retroativo', 'ponto_tarefa_atualizar', 'ponto_tarefas', 'verificar_documento'],
            'o visitante anônimo só chama as funções públicas do ponto e a verificação de documento');
select t.ok(not has_function_privilege('authenticated', 'public.ponto_acesso(uuid, text, text)', 'execute') and not has_function_privilege('anon', 'public.ponto_acesso(uuid, text, text)', 'execute')
            and has_function_privilege('service_role', 'public.ponto_acesso(uuid, text, text)', 'execute'), 'ponto_acesso só é executável pela service_role (Edge Function)');
select t.ok(not has_function_privilege('authenticated', 'public._limitar(text, int, int)', 'execute') and not has_function_privilege('anon', 'public._limitar(text, int, int)', 'execute'), 'o limitador não é chamável pela API');
select t.ok(not has_table_privilege('authenticated', 'public.limite_taxa', 'select') and not has_table_privilege('anon', 'public.limite_taxa', 'select'), 'o contador de limite não é legível pela API');
select t.ok(not has_table_privilege('authenticated', 'public.pin_tentativas', 'select'), 'tentativas de PIN não são legíveis pela API');
select t.ok(not has_table_privilege('authenticated', 'public.funcionario_pins', 'select'), 'hashes de PIN não são legíveis pela API');

\echo == X2. Entradas hostis nas funções públicas (injeção, curingas, tamanhos)
select t.anon();
select t.ok((select count(*) from ponto_buscar('almeida-t', $q$'; drop table public.funcionarios; --$q$)) = 0, 'injeção SQL no termo da busca é inerte');
select t.ok((select count(*) from ponto_buscar('almeida-t', '%%%')) = 0 and (select count(*) from ponto_buscar('almeida-t', '___')) = 0, 'curingas % e _ não listam a equipe');
select t.ok((select count(*) from ponto_buscar($q$almeida-t' or '1'='1$q$, 'ana')) = 0, 'injeção SQL no endereço do escritório é inerte');
select t.ok((ponto_contexto($q$x'; select pg_sleep(5); --$q$) ->> 'erro') = 'ESCRITORIO_NAO_ENCONTRADO', 'injeção no contexto é inerte');
select t.ok((verificar_documento($q$' or true --$q$) ->> 'ok') = 'false', 'injeção na verificação de documento é inerte');
select t.ok((verificar_documento(repeat('A', 100000)) ->> 'ok') = 'false', 'código gigante não derruba a verificação');
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a001', repeat('9', 5000), 'entrada') ->> 'erro') in ('PIN_INVALIDO', 'PIN_BLOQUEADO'), 'PIN gigante é recusado');
select t.admin_db();
select t.ok(exists (select 1 from public.funcionarios), 'as tabelas continuam intactas');

\echo == X3. Limite de taxa por origem
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.7"}', false);
select t.anon();
do $$
declare i int; n int := 0;
begin
  for i in 1..70 loop
    if exists (select 1 from ponto_buscar('almeida-t', 'ana')) then n := n + 1; end if;
  end loop;
  perform t.ok(n = 60, 'a busca de nomes aceita 60 consultas por minuto por origem (aceitou ' || n || ')');
end $$;
select t.ok(not exists (select 1 from ponto_buscar('almeida-t', 'ana')), 'passado o limite, a origem recebe lista vazia');
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.8"}', false);
select t.ok(exists (select 1 from ponto_buscar('almeida-t', 'ana')), 'outra origem não é afetada');
do $$
declare i int; n int := 0;
begin
  for i in 1..40 loop
    if (verificar_documento('CODIGO-INEXISTENTE-' || i) ->> 'erro') = 'LIMITE' then n := n + 1; end if;
  end loop;
  perform t.ok(n = 10, 'a verificação de documento limita em 30 por minuto (bloqueou ' || n || ' de 40)');
end $$;
select set_config('request.headers', '', false);
select t.admin_db();
select t.ok(public._limitar('teste:', 1, 60) and public._limitar('teste:', 1, 60), 'sem origem conhecida, não limita (chamadas internas e testes)');

\echo == X4. Entrada automática (ponto_acesso): só com PIN, nível que depende do ponto, entrada de hoje e senha já trocada
-- Ana Advogada (ac07) tem login (criado em 99_acessos) e entrada hoje; use um funcionário novo para controlar o cenário
insert into public.funcionarios (id, escritorio_id, nome, salario_mensal, vinculo, data_admissao) values
 ('00000000-0000-0000-0000-00000000ad01', (select v::uuid from t.ctx where k = 'escA'), 'Bruno Auto', 2500, 'clt', current_date - 90);
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select definir_pin('00000000-0000-0000-0000-00000000ad01', '315795');
select criar_acesso('bruno.a@t.com', 'segredo123', 'Bruno Auto', 'secretaria', '00000000-0000-0000-0000-00000000ad01');
select t.admin_db();
set role service_role;
select t.ok((ponto_acesso('00000000-0000-0000-0000-00000000ad01', '000000', '198.51.100.1') ->> 'erro') = 'PIN_INVALIDO', 'PIN errado não abre sessão');
select t.ok((ponto_acesso('00000000-0000-0000-0000-00000000ad01', '315795', '198.51.100.1') ->> 'erro') = 'TROCAR_SENHA', 'senha provisória: precisa trocar antes');
reset role;
update public.perfis set trocar_senha = false where email = 'bruno.a@t.com';
set role service_role;
select t.ok((ponto_acesso('00000000-0000-0000-0000-00000000ad01', '315795', '198.51.100.1') ->> 'erro') = 'SEM_PONTO', 'sem entrada hoje, não abre');
reset role;
insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, horario_real, status)
values ((select v::uuid from t.ctx where k = 'escA'), '00000000-0000-0000-0000-00000000ad01', public._hoje((select v::uuid from t.ctx where k = 'escA')), 'entrada', now(), 'no_horario');
set role service_role;
select t.ok((ponto_acesso('00000000-0000-0000-0000-00000000ad01', '315795', '198.51.100.1') ->> 'email') = 'bruno.a@t.com', 'com o ponto confirmado e a senha trocada, libera a entrada');
reset role;
select t.ok(exists (select 1 from public.acessos_log where evento = 'login' and detalhe = 'entrada automática pelo ponto' and nome = 'Bruno Auto'), 'a entrada fica no registro de acessos');
select definir_entrada_automatica(false) from (select t.como((select v::uuid from t.ctx where k = 'adminA'))) x;
select t.admin_db();
set role service_role;
select t.ok((ponto_acesso('00000000-0000-0000-0000-00000000ad01', '315795', '198.51.100.1') ->> 'erro') = 'ENTRADA_MANUAL', 'o administrador pode desligar a entrada automática');
reset role;
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select definir_entrada_automatica(true);
select t.falha($q$ select definir_entrada_automatica(false) $q$, 'SEM_PERMISSAO', 'só o administrador mexe nisso') from (select t.como((select v::uuid from t.ctx where k = 'gerenteA'))) x;
select t.admin_db();
-- administrador e gerência nunca entram por PIN
select definir_pin_direto from (select 1 as definir_pin_direto) z where false;
update public.perfis set funcionario_id = '00000000-0000-0000-0000-00000000a002' where email = 'gerente.a@t.com';
set role service_role;
select t.ok((ponto_acesso('00000000-0000-0000-0000-00000000a002', '739105', '198.51.100.2') ->> 'erro') = 'ENTRADA_MANUAL', 'gerência entra com senha, nunca só por PIN');
reset role;
update public.perfis set funcionario_id = null where email = 'gerente.a@t.com';
select t.falha($q$ select ponto_acesso('00000000-0000-0000-0000-00000000ad01', '315795', 'x') $q$, 'permission denied', 'usuário comum não chama ponto_acesso') from (select t.como((select v::uuid from t.ctx where k = 'advA'))) x;
select t.anon();
select t.falha($q$ select ponto_acesso('00000000-0000-0000-0000-00000000ad01', '315795', 'x') $q$, 'permission denied', 'anônimo também não');
select t.admin_db();
set role service_role;
do $$
declare i int; n int := 0;
begin
  for i in 1..30 loop
    if (ponto_acesso('00000000-0000-0000-0000-00000000ad01', '111111', '198.51.100.99') ->> 'erro') = 'LIMITE' then n := n + 1; end if;
  end loop;
  perform t.ok(n >= 10, 'tentativas em massa na mesma origem batem no limite (' || n || ' barradas)');
end $$;
reset role;

\echo == X5. Retenção do registro de acessos
insert into public.acessos_log (escritorio_id, nome, evento, detalhe, created_at) values ((select v::uuid from t.ctx where k = 'escA'), 'Antigo', 'login', '', now() - interval '13 months');
select public.expurgar_acessos_antigos();
select t.ok(not exists (select 1 from public.acessos_log where nome = 'Antigo'), 'registros de acesso com mais de 12 meses são apagados');
select t.ok((select max(versao) from public.schema_versao) >= 14, 'versão do esquema 14 registrada');
select 'seguranca ok' as msg;
