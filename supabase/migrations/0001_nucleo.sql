-- =====================================================================
-- GE ADVOCACIA · 0001 · núcleo multiescritório
--
-- Modelo de isolamento: UM banco, VÁRIOS escritórios. Toda tabela de negócio carrega
-- `escritorio_id`, e o isolamento é imposto pelo próprio Postgres, em três camadas:
--   1) RLS: cada política compara `escritorio_id` com o escritório do usuário logado
--      (`meu_escritorio()`), então uma consulta nunca enxerga linhas de outro escritório;
--   2) chaves estrangeiras COMPOSTAS (escritorio_id, id): é impossível ligar um registro de um
--      escritório a um funcionário/cargo/escala de outro, mesmo por uma função com SECURITY DEFINER;
--   3) gatilho que proíbe trocar o `escritorio_id` de uma linha existente.
-- A "plataforma" (dono do GE Advocacia) cria e suspende escritórios, mas NÃO tem política de leitura
-- sobre nenhuma tabela de negócio: não vê funcionários, salários, ponto nem atestados.
--
-- Idempotente: pode ser executado mais de uma vez.
-- =====================================================================
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- Versão do esquema (a tela Diagnóstico compara com a versão esperada pelo app) ----------
create table if not exists public.schema_versao (
  versao int primary key,
  nome text not null,
  aplicada_em timestamptz not null default now()
);

-- ---------- Escritórios (tenants) e plataforma ----------
create table if not exists public.escritorios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) >= 2),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  ativo boolean not null default true,
  fuso text not null default 'America/Fortaleza',
  created_at timestamptz not null default now()
);

create or replace function public._trg_escritorio_valida() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.fuso) then raise exception 'FUSO_INVALIDO'; end if;
  return new;
end $$;
drop trigger if exists trg_valida on public.escritorios;
create trigger trg_valida before insert or update on public.escritorios for each row execute function public._trg_escritorio_valida();

create table if not exists public.plataforma_admins (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  ativo boolean not null default true
);

create table if not exists public.plataforma_auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario text not null,
  acao text not null,
  detalhe text not null default '',
  escritorio_id uuid,
  created_at timestamptz not null default now()
);

-- Usuários do painel de CADA escritório (administrador master e gerência).
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  escritorio_id uuid not null references public.escritorios(id) on delete restrict,
  nome text not null,
  email text not null,
  papel text not null check (papel in ('admin', 'gerente')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists perfis_escritorio_idx on public.perfis (escritorio_id);

-- ---------- Quem é quem ----------
create or replace function public.eh_plataforma() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from public.plataforma_admins where id = auth.uid() and ativo)
$$;

-- Escritório do usuário logado (nulo se não tem perfil ativo OU se o escritório está suspenso).
create or replace function public.meu_escritorio() returns uuid
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select p.escritorio_id from public.perfis p join public.escritorios e on e.id = p.escritorio_id
   where p.id = auth.uid() and p.ativo and e.ativo
$$;

create or replace function public.papel_atual() returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select p.papel from public.perfis p join public.escritorios e on e.id = p.escritorio_id
   where p.id = auth.uid() and p.ativo and e.ativo
$$;
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(public.papel_atual() = 'admin', false)
$$;
create or replace function public.eh_gestao() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(public.papel_atual() in ('admin', 'gerente'), false)
$$;

-- Fuso do escritório e "hoje" no relógio dele.
create or replace function public._fuso(p_esc uuid) returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce((select fuso from public.escritorios where id = p_esc), 'America/Fortaleza')
$$;
create or replace function public._hoje(p_esc uuid) returns date
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select (now() at time zone public._fuso(p_esc))::date
$$;

-- ---------- Cadastros ----------
create table if not exists public.cargos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  nome text not null,
  categoria text not null check (categoria in ('juridico', 'gerencia', 'administrativo', 'estagio', 'apoio')),
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (escritorio_id, id),
  unique (escritorio_id, nome)
);

-- dias: {"1": {"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"}, ... "6": {...}}
create table if not exists public.escalas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  nome text not null,
  dias jsonb not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (escritorio_id, id)
);

create table if not exists public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  nome text not null,
  cpf text,
  email text,
  telefone text,
  cargo_id uuid,
  escala_id uuid,
  vinculo text not null default 'clt' check (vinculo in ('clt', 'estagio', 'pj', 'socio')),
  salario_mensal numeric(12,2) not null default 0 check (salario_mensal >= 0),
  diaria_fixa numeric(12,2) check (diaria_fixa is null or diaria_fixa >= 0),
  data_admissao date not null default current_date,
  data_desligamento date,
  oab text,
  pix text,
  banco text,
  agencia text,
  conta text,
  tipo_conta text,
  tem_pin boolean not null default false,
  pin_curto boolean not null default false,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  unique (escritorio_id, id),
  foreign key (escritorio_id, cargo_id) references public.cargos (escritorio_id, id) on delete set null (cargo_id),
  foreign key (escritorio_id, escala_id) references public.escalas (escritorio_id, id) on delete set null (escala_id)
);
create index if not exists funcionarios_escritorio_idx on public.funcionarios (escritorio_id, nome);

-- O hash do PIN fica isolado: sem nenhuma política => inacessível pela API; só as funções SECURITY DEFINER o leem.
create table if not exists public.funcionario_pins (
  funcionario_id uuid primary key,
  escritorio_id uuid not null,
  pin_hash text not null,
  atualizado_em timestamptz not null default now(),
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete cascade
);
create table if not exists public.pin_tentativas (
  id bigserial primary key,
  funcionario_id uuid not null,
  escritorio_id uuid not null,
  sucesso boolean not null,
  origem text not null default '',
  created_at timestamptz not null default now(),
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete cascade
);
create index if not exists pin_tentativas_func_idx on public.pin_tentativas (funcionario_id, created_at desc);
create index if not exists pin_tentativas_origem_idx on public.pin_tentativas (origem, created_at desc);

create table if not exists public.configuracoes (
  escritorio_id uuid primary key default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  dados jsonb not null
);

-- ---------- Auditoria (imutável) ----------
create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  -- sem FK de propósito: a trilha de auditoria sobrevive mesmo que o escritório seja excluído
  escritorio_id uuid not null default public.meu_escritorio(),
  usuario text not null,
  usuario_id uuid,
  acao text not null,
  detalhe text not null default '',
  tabela text,
  registro_id text,
  antes jsonb,
  depois jsonb,
  origem text,
  created_at timestamptz not null default now()
);
create index if not exists auditoria_escritorio_idx on public.auditoria (escritorio_id, created_at desc);

-- Registro de acessos a documentos sensíveis (atestados): só inserção, para ninguém editar ou apagar.
create table if not exists public.acessos_sensiveis (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio(),
  usuario_id uuid,
  usuario text not null,
  anexo_id uuid not null,
  funcionario_id uuid,
  acao text not null default 'abrir',
  origem text,
  created_at timestamptz not null default now()
);
create index if not exists acessos_sensiveis_idx on public.acessos_sensiveis (escritorio_id, created_at desc);

-- ---------- Tenancy: gatilho que impede mudar o escritório de uma linha ----------
create or replace function public._trg_escritorio_imutavel() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  if new.escritorio_id is distinct from old.escritorio_id then raise exception 'ESCRITORIO_IMUTAVEL'; end if;
  return new;
end $$;

-- O expurgo (retenção LGPD) é a única exceção às travas de período fechado. A permissão é uma linha numa tabela que
-- NINGUÉM além das funções SECURITY DEFINER consegue escrever (RLS sem política e sem GRANT), atrelada à transação atual:
-- um usuário comum não consegue forjá-la (um parâmetro de sessão, por exemplo, seria forjável).
create table if not exists public._expurgo_ativo (tx bigint primary key);
alter table public._expurgo_ativo enable row level security;
revoke all on public._expurgo_ativo from anon, authenticated;
create or replace function public._bypass_expurgo() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public._expurgo_ativo where tx = txid_current())
$$;

-- ---------- Origem da chamada (IP) ----------
create or replace function public._origem() returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare h json;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then return '';
  end;
  return left(trim(split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'x-real-ip', ''), ',', 1)), 64);
end $$;

-- ---------- RLS por escritório (helper reutilizado pelas outras migrações) ----------
--   admin: tudo no PRÓPRIO escritório · gestão (gerência): leitura e, onde indicado, escrita
create or replace function public._aplicar_rls_tenant(
  p_tabela text, p_gestao_le boolean default false, p_gestao_ins boolean default false,
  p_gestao_upd boolean default false, p_gestao_del boolean default false, p_admin_escreve boolean default true
) returns void language plpgsql set search_path = public, extensions, pg_temp as $$
declare mesmo text := 'escritorio_id = (select public.meu_escritorio())';
begin
  execute format('alter table public.%I enable row level security', p_tabela);
  execute format('drop trigger if exists trg_escritorio_imutavel on public.%I', p_tabela);
  execute format('create trigger trg_escritorio_imutavel before update on public.%I for each row execute function public._trg_escritorio_imutavel()', p_tabela);
  execute format('drop policy if exists "tenant admin" on public.%I', p_tabela);
  execute format('drop policy if exists "tenant admin le" on public.%I', p_tabela);
  execute format('drop policy if exists "tenant gestao le" on public.%I', p_tabela);
  execute format('drop policy if exists "tenant gestao ins" on public.%I', p_tabela);
  execute format('drop policy if exists "tenant gestao upd" on public.%I', p_tabela);
  execute format('drop policy if exists "tenant gestao del" on public.%I', p_tabela);
  if p_admin_escreve then
    execute format('create policy "tenant admin" on public.%I for all to authenticated using (%s and (select public.eh_admin())) with check (%s and (select public.eh_admin()))', p_tabela, mesmo, mesmo);
  else
    execute format('create policy "tenant admin le" on public.%I for select to authenticated using (%s and (select public.eh_admin()))', p_tabela, mesmo);
  end if;
  if p_gestao_le then
    execute format('create policy "tenant gestao le" on public.%I for select to authenticated using (%s and (select public.eh_gestao()))', p_tabela, mesmo);
  end if;
  if p_gestao_ins then
    execute format('create policy "tenant gestao ins" on public.%I for insert to authenticated with check (%s and (select public.eh_gestao()))', p_tabela, mesmo);
  end if;
  if p_gestao_upd then
    execute format('create policy "tenant gestao upd" on public.%I for update to authenticated using (%s and (select public.eh_gestao())) with check (%s and (select public.eh_gestao()))', p_tabela, mesmo, mesmo);
  end if;
  if p_gestao_del then
    execute format('create policy "tenant gestao del" on public.%I for delete to authenticated using (%s and (select public.eh_gestao()))', p_tabela, mesmo);
  end if;
end $$;
revoke all on function public._aplicar_rls_tenant(text, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;

select public._aplicar_rls_tenant('cargos', true);
select public._aplicar_rls_tenant('escalas', true);
select public._aplicar_rls_tenant('funcionarios');
select public._aplicar_rls_tenant('configuracoes', true);

-- PINs e tentativas: RLS ligado e NENHUMA política (nada pela API).
alter table public.funcionario_pins enable row level security;
alter table public.pin_tentativas enable row level security;
revoke all on public.funcionario_pins, public.pin_tentativas from anon, authenticated;
revoke all on sequence public.pin_tentativas_id_seq from anon, authenticated;

-- ---------- Escritórios, perfis e plataforma ----------
alter table public.escritorios enable row level security;
drop policy if exists "membro le o proprio escritorio" on public.escritorios;
create policy "membro le o proprio escritorio" on public.escritorios for select to authenticated
  using (id in (select escritorio_id from public.perfis where id = auth.uid()));
-- criação, edição e suspensão só por funções da plataforma (SECURITY DEFINER)
revoke insert, update, delete, truncate on public.escritorios from anon, authenticated;

alter table public.perfis enable row level security;
drop policy if exists "perfil proprio" on public.perfis;
create policy "perfil proprio" on public.perfis for select to authenticated using (id = auth.uid());
drop policy if exists "admin le perfis do escritorio" on public.perfis;
create policy "admin le perfis do escritorio" on public.perfis for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_admin()));
-- gravações só pelas funções criar/atualizar/remover usuário (garantem "sempre sobra um administrador")
revoke insert, update, delete, truncate on public.perfis from anon, authenticated;

alter table public.plataforma_admins enable row level security;
drop policy if exists "plataforma le a si" on public.plataforma_admins;
create policy "plataforma le a si" on public.plataforma_admins for select to authenticated using (id = auth.uid());
revoke insert, update, delete, truncate on public.plataforma_admins from anon, authenticated;

alter table public.plataforma_auditoria enable row level security;
drop policy if exists "plataforma le auditoria" on public.plataforma_auditoria;
create policy "plataforma le auditoria" on public.plataforma_auditoria for select to authenticated using ((select public.eh_plataforma()));
revoke insert, update, delete, truncate on public.plataforma_auditoria from anon, authenticated;

alter table public.schema_versao enable row level security;
drop policy if exists "autenticado le versao" on public.schema_versao;
create policy "autenticado le versao" on public.schema_versao for select to authenticated using (true);
revoke insert, update, delete, truncate on public.schema_versao from anon, authenticated;

-- ---------- Auditoria: gatilhos, imutabilidade e política ----------
alter table public.auditoria enable row level security;
drop policy if exists "admin le auditoria" on public.auditoria;
create policy "admin le auditoria" on public.auditoria for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_admin()));
drop policy if exists "gestao audita" on public.auditoria;
create policy "gestao audita" on public.auditoria for insert to authenticated
  with check (escritorio_id = (select public.meu_escritorio()) and (select public.eh_gestao()));
revoke update, delete, truncate on public.auditoria from anon, authenticated;

alter table public.acessos_sensiveis enable row level security;
drop policy if exists "admin le acessos sensiveis" on public.acessos_sensiveis;
create policy "admin le acessos sensiveis" on public.acessos_sensiveis for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_admin()));
revoke insert, update, delete, truncate on public.acessos_sensiveis from anon, authenticated;

create or replace function public._bloqueia_alteracao() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'REGISTRO_IMUTAVEL'; end $$;
drop trigger if exists auditoria_imutavel on public.auditoria;
create trigger auditoria_imutavel before update or delete on public.auditoria for each row execute function public._bloqueia_alteracao();
drop trigger if exists acessos_imutavel on public.acessos_sensiveis;
create trigger acessos_imutavel before update or delete on public.acessos_sensiveis for each row execute function public._bloqueia_alteracao();
drop trigger if exists plat_auditoria_imutavel on public.plataforma_auditoria;
create trigger plat_auditoria_imutavel before update or delete on public.plataforma_auditoria for each row execute function public._bloqueia_alteracao();

create or replace function public._norm(p text) returns text
language sql immutable as $$
  select lower(translate(coalesce(p, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'))
$$;

create or replace function public._rotulo_registro(p_tabela text, p_row jsonb) returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select case p_tabela
    when 'registros_ponto' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'tipo', '') || ' ' || coalesce(p_row ->> 'data', '')
    when 'ajustes_dia' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'data', '')
    when 'ajustes_folha' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'tipo', '')
    when 'folhas' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'periodo_inicio', '')
    when 'ocorrencias' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'tipo', '')
    when 'anexos' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'nome', '')
    when 'configuracoes' then 'Configurações do escritório'
    else coalesce(p_row ->> 'nome', p_row ->> 'email', p_row ->> 'data', p_row ->> 'id', '')
  end
$$;

-- Dados volumosos ou sensíveis não vão para o "antes/depois" da auditoria.
create or replace function public._trg_auditar() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_antes jsonb; v_depois jsonb; v_campos text; v_usuario text; v_acao text; v_ref jsonb := coalesce(v_new, v_old);
  v_uid uuid := auth.uid();
begin
  if public._bypass_expurgo() then return coalesce(new, old); end if;   -- o expurgo grava um resumo próprio
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, v_old -> k), jsonb_object_agg(k, v_new -> k), string_agg(k, ', ' order by k)
      into v_antes, v_depois, v_campos
      from jsonb_object_keys(v_new) k where k not in ('detalhe') and v_new -> k is distinct from v_old -> k;
    if v_campos is null then return new; end if;                -- nada mudou
  elsif tg_op = 'INSERT' then v_depois := v_new - 'detalhe';
  else v_antes := v_old - 'detalhe'; end if;

  select nome || ' <' || email || '>' into v_usuario from public.perfis where id = v_uid;
  v_usuario := coalesce(v_usuario, case when v_uid is null then 'Sistema (PIN / painel)' else v_uid::text end);
  v_acao := case tg_op when 'INSERT' then 'Criado' when 'UPDATE' then 'Alterado' else 'Excluído' end || ' · ' || tg_table_name;
  insert into public.auditoria (escritorio_id, usuario, usuario_id, acao, detalhe, tabela, registro_id, antes, depois, origem)
  values ((v_ref ->> 'escritorio_id')::uuid, v_usuario, v_uid, v_acao,
          left(public._rotulo_registro(tg_table_name, v_ref) || coalesce(' · campos: ' || v_campos, ''), 500),
          tg_table_name, coalesce(v_ref ->> 'id', v_ref ->> 'escritorio_id'), v_antes, v_depois, nullif(public._origem(), ''));
  return coalesce(new, old);
end $$;

create or replace function public._auditar_tabela(p_tabela text) returns void
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  execute format('drop trigger if exists trg_auditar on public.%I', p_tabela);
  execute format('create trigger trg_auditar after insert or update or delete on public.%I for each row execute function public._trg_auditar()', p_tabela);
end $$;
revoke all on function public._auditar_tabela(text) from public, anon, authenticated;
select public._auditar_tabela(t) from unnest(array['cargos', 'escalas', 'funcionarios', 'configuracoes', 'perfis']) t;

-- ---------- Permissões das funções internas ----------
revoke all on function public._trg_auditar() from public, anon, authenticated;
revoke all on function public._rotulo_registro(text, jsonb) from public, anon, authenticated;
revoke all on function public._origem() from public, anon, authenticated;
revoke all on function public._bypass_expurgo() from public, anon, authenticated;
revoke all on function public._fuso(uuid) from public, anon, authenticated;
revoke all on function public._hoje(uuid) from public, anon, authenticated;
grant execute on function public.eh_plataforma(), public.meu_escritorio(), public.papel_atual(), public.eh_admin(), public.eh_gestao() to authenticated;

insert into public.schema_versao (versao, nome) values (1, 'nucleo multiescritorio') on conflict (versao) do nothing;
