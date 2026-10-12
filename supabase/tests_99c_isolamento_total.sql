-- Isolamento TOTAL entre escritórios: varredura DINÂMICA de todas as tabelas com escritorio_id.
-- Cada tabela nova que nascer sem política correta derruba esta suíte (não depende de lista escrita à mão).
\set ON_ERROR_STOP on
\echo == C1. Estrutura: RLS ligado, políticas presentes, nada aberto a anônimo, funções protegidas
select t.admin_db();

drop table if exists t.tabelas_esc, t.amostra_b, t.contagem_b;
create table t.tabelas_esc (tabela text primary key);
create table t.amostra_b (esc text not null, tabela text not null, linha jsonb not null, primary key (esc, tabela));
create table t.contagem_b (esc text not null, tabela text not null, n bigint not null, primary key (esc, tabela));
grant all on t.tabelas_esc, t.amostra_b, t.contagem_b to anon, authenticated, service_role;

insert into t.tabelas_esc
select c.table_name from information_schema.columns c join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
 where c.table_schema = 'public' and c.column_name = 'escritorio_id' and x.table_type = 'BASE TABLE';

do $$
declare r record; e text; v_e uuid; n bigint; l jsonb;
begin
  foreach e in array array['escA', 'escB'] loop
    v_e := (select v::uuid from t.ctx where k = e);
    for r in select tabela from t.tabelas_esc loop
      execute format('select count(*) from public.%I where escritorio_id = %L', r.tabela, v_e) into n;
      insert into t.contagem_b values (e, r.tabela, n);
      execute format('select to_jsonb(x) from public.%I x where escritorio_id = %L limit 1', r.tabela, v_e) into l;
      if l is not null then insert into t.amostra_b values (e, r.tabela, l); end if;
    end loop;
  end loop;
end $$;

select t.ok((select count(*) from t.tabelas_esc) >= 25, 'a varredura enxerga as tabelas de escritório (' || (select count(*) from t.tabelas_esc) || ')');
select t.ok((select count(*) from t.amostra_b where esc = 'escB') >= 8 and (select count(*) from t.amostra_b where esc = 'escA') >= 8, 'os dois escritórios têm dados em várias tabelas para o ataque (A: ' || (select count(*) from t.amostra_b where esc = 'escA') || ', B: ' || (select count(*) from t.amostra_b where esc = 'escB') || ')');

select t.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
            'TODA tabela do schema public tem RLS ligado: ' || coalesce((select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 'nenhuma sem'));
-- RLS ligado e SEM política = fechada para todo usuário (só funções do servidor acessam): PINs, tokens, lixeiras. Isso é o desejado.
-- O que não pode existir é tabela fechada com privilégio direto para anônimo (conferido mais abaixo) ou política aberta.
select t.ok(true, 'tabelas fechadas ao usuário (RLS sem política, só o servidor acessa): ' || coalesce((select string_agg(x.tabela, ', ' order by x.tabela) from t.tabelas_esc x where not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = x.tabela)), 'nenhuma'));
select t.ok(not exists (select 1 from t.tabelas_esc x where not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = x.tabela)
                          and x.tabela not in ('funcionario_pins', 'pin_tentativas', 'anexos_lixeira', 'documentos_lixeira', 'google_conexoes', 'drive_conexoes')),
            'só as tabelas de segredo/lixeira conhecidas ficam sem política; qualquer outra sem política derruba esta suíte: ' || coalesce((select string_agg(x.tabela, ', ') from t.tabelas_esc x where not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = x.tabela) and x.tabela not in ('funcionario_pins', 'pin_tentativas', 'anexos_lixeira', 'documentos_lixeira', 'google_conexoes', 'drive_conexoes')), 'ok'));
select t.ok(not exists (select 1 from t.tabelas_esc x join pg_attribute a on a.attrelid = ('public.' || x.tabela)::regclass and a.attname = 'escritorio_id' where not a.attnotnull and x.tabela not like 'plataforma\_%'),
            'escritorio_id é NOT NULL em toda tabela de escritório (nenhuma linha "sem dono"; o registro da plataforma pode ter ações globais): ' || coalesce((select string_agg(x.tabela, ', ') from t.tabelas_esc x join pg_attribute a on a.attrelid = ('public.' || x.tabela)::regclass and a.attname = 'escritorio_id' where not a.attnotnull and x.tabela not like 'plataforma\_%'), 'ok'));
select t.ok(not exists (select 1 from pg_policies p join t.tabelas_esc x on x.tabela = p.tablename where p.schemaname = 'public' and (p.roles && array['anon', 'public']::name[])),
            'nenhuma política de tabela de escritório vale para anônimo: ' || coalesce((select string_agg(distinct p.tablename, ', ') from pg_policies p join t.tabelas_esc x on x.tabela = p.tablename where p.schemaname = 'public' and (p.roles && array['anon', 'public']::name[])), 'ok'));
select t.ok(not exists (select 1 from pg_policies p join t.tabelas_esc x on x.tabela = p.tablename
                         where p.schemaname = 'public' and p.permissive = 'PERMISSIVE' and p.cmd in ('SELECT', 'ALL') and trim(coalesce(p.qual, '')) in ('true', '(true)')),
            'nenhuma política de leitura é "using (true)" em tabela de escritório');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
            'toda função SECURITY DEFINER fixa o search_path: ' || coalesce((select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 'ok'));
select t.ok(not exists (select 1 from information_schema.role_table_grants g join t.tabelas_esc x on x.tabela = g.table_name
                         where g.table_schema = 'public' and g.grantee = 'anon'),
            'o visitante anônimo não tem privilégio direto em nenhuma tabela de escritório: ' || coalesce((select string_agg(distinct g.table_name, ', ') from information_schema.role_table_grants g join t.tabelas_esc x on x.tabela = g.table_name where g.table_schema = 'public' and g.grantee = 'anon'), 'ok'));

\echo == C2. Ataque em todas as tabelas: A tenta ler, alterar, apagar e inserir no escritório B
create or replace function t.atacar(p_meu text, p_alvo text) returns text language plpgsql as $$
declare r record; v_a uuid := (select v::uuid from t.ctx where k = p_meu); v_b uuid := (select v::uuid from t.ctx where k = p_alvo);
        n bigint; falhas text := ''; testadas int := 0; inconclusivas text := ''; l jsonb;
begin
  for r in select tabela from t.tabelas_esc order by 1 loop
    testadas := testadas + 1;
    -- leitura: nenhuma linha de outro escritório
    begin
      execute format('select count(*) from public.%I where escritorio_id <> %L', r.tabela, v_a) into n;
      if n > 0 then falhas := falhas || format(' LEU(%s:%s)', r.tabela, n); end if;
    exception when insufficient_privilege then null; end;
    -- alteração
    begin
      execute format('update public.%I set escritorio_id = escritorio_id where escritorio_id = %L', r.tabela, v_b);
      get diagnostics n = row_count;
      if n > 0 then falhas := falhas || format(' ALTEROU(%s:%s)', r.tabela, n); end if;
    exception when others then null; end;
    -- remoção
    begin
      execute format('delete from public.%I where escritorio_id = %L', r.tabela, v_b);
      get diagnostics n = row_count;
      if n > 0 then falhas := falhas || format(' APAGOU(%s:%s)', r.tabela, n); end if;
    exception when others then null; end;
    -- inserção clonando uma linha real de B (com id novo): só 42501 (RLS/privilégio) vale como bloqueio
    select linha into l from t.amostra_b where esc = p_alvo and tabela = r.tabela;
    if l is not null then
      if l ? 'id' then l := jsonb_set(l, '{id}', to_jsonb(gen_random_uuid()::text)); end if;
      begin
        execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, %L::jsonb)', r.tabela, r.tabela, l::text);
        falhas := falhas || format(' INSERIU(%s)', r.tabela);
      exception
        when insufficient_privilege then null;
        when others then inconclusivas := inconclusivas || ' ' || r.tabela;
      end;
    end if;
  end loop;
  if falhas <> '' then return 'FALHAS:' || falhas; end if;
  return format('ok (%s tabelas%s)', testadas, case when inconclusivas <> '' then ', inserção inconclusiva em:' || inconclusivas else '' end);
end $$;
grant execute on function t.atacar(text, text) to anon, authenticated, service_role;

select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.ok(left(t.atacar('escA', 'escB'), 2) = 'ok', 'administrador de A não lê, altera, apaga nem insere em B: ' || t.atacar('escA', 'escB'));
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.ok(left(t.atacar('escA', 'escB'), 2) = 'ok', 'gerente de A não lê, altera, apaga nem insere em B: ' || t.atacar('escA', 'escB'));
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(left(t.atacar('escB', 'escA'), 2) = 'ok', 'administrador de B não lê, altera, apaga nem insere em A: ' || t.atacar('escB', 'escA'));

\echo == C3. Anônimo e plataforma não leem tabela nenhuma de escritório
select t.anon();
do $$
declare r record; n bigint; vazados text := '';
begin
  for r in select tabela from t.tabelas_esc loop
    begin
      execute format('select count(*) from public.%I', r.tabela) into n;
      if n > 0 then vazados := vazados || ' ' || r.tabela; end if;
    exception when insufficient_privilege then null; end;
  end loop;
  perform t.ok(vazados = '', 'anônimo não lê nenhuma tabela de escritório' || case when vazados <> '' then ':' || vazados else '' end);
end $$;

select t.como('00000000-0000-0000-0000-0000000000f1');
do $$
declare r record; n bigint; vazados text := '';
begin
  for r in select tabela from t.tabelas_esc where tabela not in ('escritorios', 'plataforma_auditoria') loop   -- o registro de ações da própria plataforma é dela
    begin
      execute format('select count(*) from public.%I', r.tabela) into n;
      if n > 0 then vazados := vazados || ' ' || r.tabela || ':' || n; end if;
    exception when insufficient_privilege then null; end;
  end loop;
  perform t.ok(vazados = '', 'a plataforma (suporte do sistema) não lê dados de nenhum escritório' || case when vazados <> '' then ':' || vazados else '' end);
end $$;

\echo == C4. Conferência final: nada mudou em nenhum dos dois escritórios
select t.admin_db();
do $$
declare r record; qtd bigint; mudou text := '';
begin
  for r in select c.esc, c.tabela, c.n as antes from t.contagem_b c loop
    execute format('select count(*) from public.%I where escritorio_id = (select v::uuid from t.ctx where k = %L)', r.tabela, r.esc) into qtd;
    if qtd <> r.antes then mudou := mudou || format(' %s.%s(%s→%s)', r.esc, r.tabela, r.antes, qtd); end if;
  end loop;
  perform t.ok(mudou = '', 'os escritórios A e B continuam com exatamente os mesmos dados' || case when mudou <> '' then ':' || mudou else '' end);
end $$;
