-- Stub mínimo do Supabase (roles, schema auth) + helpers de asserção para os testes SQL.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(), email text,
  instance_id uuid, aud text, role text, encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
  confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
create table auth.identities (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, identity_data jsonb,
  provider text, provider_id text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- ---- helpers de teste ----
create schema t;
grant usage on schema t to anon, authenticated, service_role;

create table t.resultado (ok boolean not null, rotulo text not null);
grant all on t.resultado to anon, authenticated, service_role;

create function t.ok(p_cond boolean, p_rotulo text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FALHOU: %', p_rotulo; end if;
  raise notice 'ok - %', p_rotulo;
end $$;

-- exige que a consulta lance uma exceção cuja mensagem contenha p_esperado
create function t.falha(p_sql text, p_esperado text, p_rotulo text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_esperado in sqlerrm) = 0 then raise exception 'FALHOU: % (esperava "%", veio "%")', p_rotulo, p_esperado, sqlerrm; end if;
    raise notice 'ok - %', p_rotulo;
    return;
  end;
  raise exception 'FALHOU: % (nada foi bloqueado)', p_rotulo;
end $$;

-- número de linhas que uma consulta devolve (executada com o papel atual)
create function t.n(p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin execute 'select count(*) from (' || p_sql || ') q' into v; return v; end $$;

-- escalar de uma consulta, como texto
create function t.v(p_sql text) returns text language plpgsql as $$
declare v text;
begin execute p_sql into v; return v; end $$;

-- passa se a tabela devolve 0 linhas OU se o acesso é negado
create function t.sem_acesso(p_tabela text, p_rotulo text) returns void language plpgsql as $$
declare v bigint;
begin
  begin
    execute format('select count(*) from public.%I', p_tabela) into v;
  exception when insufficient_privilege then
    raise notice 'ok - % (acesso negado)', p_rotulo; return;
  end;
  if v <> 0 then raise exception 'FALHOU: % (leu % linhas)', p_rotulo, v; end if;
  raise notice 'ok - % (0 linhas)', p_rotulo;
end $$;

-- passa se o comando DML não afeta nenhuma linha (RLS filtrou tudo)
create function t.sem_efeito(p_sql text, p_rotulo text) returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: % (afetou % linhas)', p_rotulo, n; end if;
  raise notice 'ok - %', p_rotulo;
end $$;

create function t.como(p_uid uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  execute 'set role authenticated';
end $$;
create function t.anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  execute 'set role anon';
end $$;
create function t.admin_db() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', false); end $$;
-- ids para os testes (ignoram RLS de propósito: são só fixtures)
create function t.id_esc(p_slug text) returns uuid language plpgsql security definer as $$ begin return (select id from public.escritorios where slug = p_slug); end $$;
create function t.id_perfil(p_email text) returns uuid language plpgsql security definer as $$ begin return (select id from public.perfis where email = p_email); end $$;
grant execute on all functions in schema t to anon, authenticated, service_role;
