-- Reaplicar TODO o banco por cima de um banco COM DADOS (acessos de todos os níveis, pontos, tarefas...) não pode falhar nem mudar nada.
-- É o que acontece quando o fluxo "Supabase — aplicar banco e funções" ou o SQL Editor rodam de novo em produção.
\set ON_ERROR_STOP on
select t.admin_db();
create temp table antes as
select 'perfis' t, count(*) n from public.perfis union all select 'funcionarios', count(*) from public.funcionarios
 union all select 'registros_ponto', count(*) from public.registros_ponto union all select 'escritorios', count(*) from public.escritorios
 union all select 'papeis_distintos', count(distinct papel) from public.perfis;
select t.ok((select n from antes where t = 'papeis_distintos') >= 3, 'o banco de teste tem pessoas com vários níveis (' || (select n from antes where t = 'papeis_distintos') || ' papéis)');
\echo == reaplicando atualizacao_definitiva.sql por cima dos dados
\i atualizacao_definitiva.sql
create temp table depois as
select 'perfis' t, count(*) n from public.perfis union all select 'funcionarios', count(*) from public.funcionarios
 union all select 'registros_ponto', count(*) from public.registros_ponto union all select 'escritorios', count(*) from public.escritorios
 union all select 'papeis_distintos', count(distinct papel) from public.perfis;
select t.ok(not exists (select 1 from antes a join depois d using (t) where a.n <> d.n), 'a reaplicação não perdeu nem criou dado: ' || (select string_agg(t || '=' || n, ' ') from depois));
select t.ok(coalesce((select max(versao) from public.schema_versao), 0) >= 15, 'versão do esquema chega a 15 depois de reaplicar');
select t.ok((select pg_get_constraintdef(oid) from pg_constraint where conname = 'perfis_papel_check' and conrelid = 'public.perfis'::regclass) like '%secretaria%', 'a restrição de papéis continua com os 8 níveis');
