-- =====================================================================
-- GE ADVOCACIA · INSTALAÇÃO / ATUALIZAÇÃO DEFINITIVA (gerado por supabase/gerar_atualizacao.sh)
-- Rode no Supabase → SQL Editor → New query → Run. Seguro e repetível (idempotente):
-- não apaga dados, não mexe em PINs nem senhas. Contém todas as migrações em ordem.
-- =====================================================================

-- >>>>>>>>>> 0001_nucleo.sql <<<<<<<<<<
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

-- >>>>>>>>>> 0002_ponto.sql <<<<<<<<<<
-- =====================================================================
-- GE ADVOCACIA · 0002 · ponto por PIN (cerca de GPS, bloqueio de tentativas, marcações)
--  * a tela pública de ponto é por escritório: /ponto/<slug>
--  * toda função pública deriva o escritório do PRÓPRIO funcionário (nunca de um parâmetro solto)
--  * marcação duplicada impedida pelo banco (índice único) — duas abas/dois toques geram uma só linha
-- Idempotente.
-- =====================================================================

-- ---------- Marcações ----------
create table if not exists public.registros_ponto (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  funcionario_id uuid not null,
  data date not null,
  tipo text not null check (tipo in ('entrada', 'saida_intervalo', 'retorno_intervalo', 'saida')),
  horario_previsto text,
  horario_real timestamptz not null default now(),
  diferenca_minutos int,
  status text not null default 'no_horario'
    check (status in ('no_horario', 'tolerancia', 'atraso', 'saida_antecipada', 'extra', 'manual', 'pendente')),
  justificativa text,
  latitude double precision,
  longitude double precision,
  status_aprovacao text not null default 'aprovado' check (status_aprovacao in ('aprovado', 'pendente', 'rejeitado')),
  retroativo boolean not null default false,
  motivo_rejeicao text,
  aprovado_por uuid,
  aprovado_em timestamptz,
  -- análise do administrador sobre atraso / saída antecipada acima do limite
  analise text check (analise in ('pendente', 'aceita', 'recusada')),
  motivo_decisao text,
  decidido_por uuid,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  unique (escritorio_id, id),
  -- RESTRICT: apagar funcionário nunca leva o histórico junto (a regra completa está em 0003)
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete restrict
);
create index if not exists registros_func_data_idx on public.registros_ponto (funcionario_id, data);
create index if not exists registros_escritorio_data_idx on public.registros_ponto (escritorio_id, data);
create index if not exists registros_pendentes_idx on public.registros_ponto (status_aprovacao) where status_aprovacao = 'pendente';
create index if not exists registros_analise_idx on public.registros_ponto (analise) where analise = 'pendente';

-- 1.1 · Duplicidades que já existam (mesmo funcionário, dia e tipo, não rejeitadas): fica a mais antiga,
-- as demais viram "rejeitado" com motivo explícito. A migração nunca falha por causa de duplicatas antigas.
with dup as (
  select id, row_number() over (partition by funcionario_id, data, tipo order by horario_real, created_at, id) as n
    from public.registros_ponto where status_aprovacao <> 'rejeitado'
)
update public.registros_ponto r
   set status_aprovacao = 'rejeitado', motivo_rejeicao = 'Duplicidade removida na migração 0002'
  from dup where dup.id = r.id and dup.n > 1;

create unique index if not exists registros_ponto_unico_idx
  on public.registros_ponto (funcionario_id, data, tipo) where status_aprovacao <> 'rejeitado';

select public._aplicar_rls_tenant('registros_ponto', true, true, true, false);
select public._auditar_tabela('registros_ponto');

-- ---------- Feriados ----------
create table if not exists public.feriados (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  data date not null,
  nome text not null,
  tipo text not null check (tipo in ('nacional', 'estadual', 'municipal', 'facultativo', 'recesso')),
  unique (escritorio_id, data)
);
select public._aplicar_rls_tenant('feriados', true);
select public._auditar_tabela('feriados');

-- ---------- Funções de apoio ----------
create or replace function public._turno_previsto(p_dias jsonb, p_dow int, p_tipo text) returns text
language sql immutable as $$
  select case when coalesce((p_dias -> p_dow::text ->> 'ativo')::boolean, false)
              then nullif(p_dias -> p_dow::text ->> p_tipo, '') end
$$;

create or replace function public._distancia_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language plpgsql immutable as $$
declare a double precision;
begin
  a := sin(radians(lat2 - lat1) / 2) ^ 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) ^ 2;
  return 6371000 * 2 * atan2(sqrt(a), sqrt(1 - a));
end $$;

create or replace function public._hhmm_min(p text) returns int language sql immutable as $$
  select split_part(p, ':', 1)::int * 60 + split_part(p, ':', 2)::int
$$;

-- Classificação idêntica à do front (src/lib/ponto.ts). Casos de referência em src/lib/__fixtures__/casos-regra.json.
create or replace function public._classificar(p_tipo text, p_previsto text, p_real_min int, p_tol int, p_lim int, out diferenca int, out status text)
language plpgsql immutable as $$
declare entrando boolean := p_tipo in ('entrada', 'retorno_intervalo');
begin
  if p_previsto is null then diferenca := 0; status := 'extra'; return; end if;
  diferenca := p_real_min - public._hhmm_min(p_previsto);
  if abs(diferenca) <= p_tol then status := 'no_horario';
  elsif entrando and diferenca >= p_lim then status := 'atraso';
  elsif not entrando and diferenca <= -p_lim then status := 'saida_antecipada';
  elsif not entrando and diferenca > 0 then status := 'extra';
  else status := 'tolerancia';
  end if;
end $$;

create or replace function public._erro(p_codigo text, p_detalhe text default null) returns jsonb
language sql immutable as $$
  select jsonb_build_object('ok', false, 'erro', p_codigo, 'detalhe', p_detalhe)
$$;

-- Valida o PIN com bloqueio de 10 min. Devolve um código (não lança exceção: uma exceção desfaria a transação
-- e apagaria o registro da tentativa, anulando o bloqueio).
-- Bloqueios: 5 erros da mesma origem para a mesma pessoa; 15 erros da mesma origem em qualquer pessoa;
-- 25 erros de origens diferentes para a mesma pessoa. Um colega não consegue travar o outro.
-- O escritório precisa estar ativo (suspenso = ponto indisponível).
create or replace function public._validar_pin(p_id uuid, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_hash text; v_ok boolean; v_origem text := public._origem(); v_ult timestamptz; v_esc uuid; v_ativo boolean;
begin
  select f.escritorio_id, (f.ativo and e.ativo and (f.data_desligamento is null or f.data_desligamento >= public._hoje(f.escritorio_id)))
    into v_esc, v_ativo
    from public.funcionarios f join public.escritorios e on e.id = f.escritorio_id where f.id = p_id;
  if v_esc is not null and exists (select 1 from public.escritorios where id = v_esc and not ativo) then return 'ESCRITORIO_SUSPENSO'; end if;

  select coalesce(max(created_at), '-infinity') into v_ult from public.pin_tentativas
   where funcionario_id = p_id and sucesso and origem = v_origem;
  if (select count(*) from public.pin_tentativas where funcionario_id = p_id and origem = v_origem and not sucesso
        and created_at > now() - interval '10 minutes' and created_at > v_ult) >= 5 then return 'PIN_BLOQUEADO'; end if;
  if v_origem <> '' and (select count(*) from public.pin_tentativas where origem = v_origem and not sucesso
        and created_at > now() - interval '10 minutes') >= 15 then return 'PIN_BLOQUEADO'; end if;
  if (select count(*) from public.pin_tentativas where funcionario_id = p_id and not sucesso
        and created_at > now() - interval '10 minutes') >= 25 then return 'PIN_BLOQUEADO'; end if;

  select h.pin_hash into v_hash from public.funcionario_pins h where h.funcionario_id = p_id;
  v_ok := coalesce(v_ativo, false) and v_hash is not null and p_pin is not null and v_hash = crypt(p_pin, v_hash);
  if v_esc is not null then
    insert into public.pin_tentativas (funcionario_id, escritorio_id, sucesso, origem) values (p_id, v_esc, v_ok, v_origem);
  end if;
  return case when v_ok then 'ok' else 'PIN_INVALIDO' end;
end $$;

-- ---------- API pública do ponto (sem login, protegida por PIN) ----------
-- Devolve {"ok": false, "erro": "CODIGO"} para erros de negócio.

-- Busca no servidor: mínimo 3 letras, no máximo 5 resultados, só no escritório do endereço (/ponto/<slug>).
drop function if exists public.ponto_buscar(text);
create or replace function public.ponto_buscar(p_slug text, p_termo text)
returns table (id uuid, nome text, cargo_nome text, escala_id uuid)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  v text := replace(replace(replace(public._norm(trim(coalesce(p_termo, ''))), '\', ''), '%', ''), '_', '');
  v_esc uuid;
begin
  if length(v) < 3 then return; end if;
  select e.id into v_esc from public.escritorios e where e.slug = lower(trim(coalesce(p_slug, ''))) and e.ativo;
  if v_esc is null then return; end if;
  return query
    select f.id, f.nome, c.nome, f.escala_id
      from public.funcionarios f left join public.cargos c on c.escritorio_id = f.escritorio_id and c.id = f.cargo_id
     where f.escritorio_id = v_esc and f.ativo and f.tem_pin
       and (f.data_desligamento is null or f.data_desligamento >= public._hoje(v_esc))
       and public._norm(f.nome) like '%' || v || '%'
     order by f.nome limit 5;
end $$;

drop function if exists public.ponto_escala(uuid);
create or replace function public.ponto_escala(p_slug text, p_escala_id uuid) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object('id', s.id, 'nome', s.nome, 'dias', s.dias, 'ativo', s.ativo)
    from public.escalas s join public.escritorios e on e.id = s.escritorio_id
   where s.id = p_escala_id and e.slug = lower(trim(coalesce(p_slug, ''))) and e.ativo
$$;

drop function if exists public.ponto_contexto();
create or replace function public.ponto_contexto(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare e public.escritorios;
begin
  select * into e from public.escritorios where slug = lower(trim(coalesce(p_slug, '')));
  if not found then return public._erro('ESCRITORIO_NAO_ENCONTRADO'); end if;
  if not e.ativo then return public._erro('ESCRITORIO_SUSPENSO'); end if;
  return jsonb_build_object('ok', true,
    'ponto', coalesce((select dados -> 'ponto' from public.configuracoes where escritorio_id = e.id), '{}'::jsonb),
    'escritorio_nome', coalesce((select dados -> 'escritorio' ->> 'nome' from public.configuracoes where escritorio_id = e.id), e.nome),
    'fuso', e.fuso,
    'feriado', (select f.nome from public.feriados f where f.escritorio_id = e.id and f.data = (now() at time zone e.fuso)::date));
end $$;

create or replace function public.ponto_bater(
  p_func_id uuid, p_pin text, p_tipo text, p_justificativa text default null,
  p_lat double precision default null, p_lng double precision default null
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_pin text; v_esc uuid; v_pt jsonb; v_tz text; v_local timestamp; v_data date; v_min int; v_dias jsonb; v_prev text;
  v_c record; v_id uuid; v_dist double precision; v_raio int; v_analise text; v_agora timestamptz := now();
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  if p_tipo not in ('entrada', 'saida_intervalo', 'retorno_intervalo', 'saida') then return public._erro('TIPO_INVALIDO'); end if;
  select escritorio_id into v_esc from public.funcionarios where id = p_func_id;
  v_tz := public._fuso(v_esc);
  v_local := v_agora at time zone v_tz;
  v_data := v_local::date;
  v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  select coalesce(dados -> 'ponto', '{}'::jsonb) into v_pt from public.configuracoes where escritorio_id = v_esc;
  v_pt := coalesce(v_pt, '{}'::jsonb);

  -- Cerca de GPS: só registra dentro do raio do escritório. O servidor recalcula a distância (o navegador é só conveniência).
  if coalesce((v_pt ->> 'geofence_ativo')::boolean, false) then
    if (v_pt ->> 'geofence_lat') is null or (v_pt ->> 'geofence_lng') is null then return public._erro('LOCAL_NAO_CONFIGURADO'); end if;
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return public._erro('GPS_OBRIGATORIO'); end if;
    v_raio := coalesce(nullif((v_pt ->> 'geofence_raio_m')::int, 0), 900);
    v_dist := public._distancia_m(p_lat, p_lng, (v_pt ->> 'geofence_lat')::double precision, (v_pt ->> 'geofence_lng')::double precision);
    if v_dist > v_raio then return public._erro('FORA_DA_AREA', format('%s m (máx. %s m)', round(v_dist), v_raio)); end if;
  end if;

  if exists (select 1 from public.registros_ponto where funcionario_id = p_func_id and data = v_data
              and tipo = p_tipo and status_aprovacao <> 'rejeitado') then
    return public._erro('JA_REGISTRADO');
  end if;

  select e.dias into v_dias from public.escalas e join public.funcionarios f on f.escritorio_id = e.escritorio_id and f.escala_id = e.id where f.id = p_func_id;
  v_prev := public._turno_previsto(v_dias, extract(dow from v_data)::int, p_tipo);
  select * into v_c from public._classificar(p_tipo, v_prev, v_min,
      coalesce((v_pt ->> 'tolerancia_min')::int, 5), coalesce((v_pt ->> 'limite_atraso_min')::int, 30));

  if v_c.status in ('atraso', 'saida_antecipada') and length(trim(coalesce(p_justificativa, ''))) < 3 then
    return public._erro('JUSTIFICATIVA_OBRIGATORIA', v_c.status);
  end if;

  -- Atraso ou saída antecipada acima do limite vai para análise do administrador (aba Ocorrências).
  v_analise := case when v_c.status in ('atraso', 'saida_antecipada') then 'pendente' end;

  -- O índice único é a barreira final: duas chamadas simultâneas passam na checagem acima, mas só uma insere.
  begin
    insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, horario_previsto, horario_real, diferenca_minutos,
                                        status, justificativa, latitude, longitude, analise)
    values (v_esc, p_func_id, v_data, p_tipo, v_prev, v_agora, v_c.diferenca, v_c.status, nullif(trim(p_justificativa), ''), p_lat, p_lng, v_analise)
    returning id into v_id;
  exception when unique_violation then
    return public._erro('JA_REGISTRADO');
  end;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_c.status, 'diferenca_minutos', v_c.diferenca, 'horario_real', v_agora, 'analise', v_analise);
end $$;

-- ---------- Gestão ----------
create or replace function public.aprovar_ponto(p_id uuid, p_acao text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare r public.registros_ponto; v_c record; v_pt jsonb; v_tz text;
begin
  if not public.eh_gestao() then raise exception 'SEM_PERMISSAO'; end if;
  if p_acao not in ('aprovar', 'rejeitar') then raise exception 'ACAO_INVALIDA'; end if;
  if p_acao = 'rejeitar' and length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  select * into r from public.registros_ponto where id = p_id and escritorio_id = public.meu_escritorio();
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if p_acao = 'aprovar' then
    v_tz := public._fuso(r.escritorio_id);
    select coalesce(dados -> 'ponto', '{}'::jsonb) into v_pt from public.configuracoes where escritorio_id = r.escritorio_id;
    select * into v_c from public._classificar(r.tipo, r.horario_previsto,
       (extract(hour from r.horario_real at time zone v_tz)::int * 60 + extract(minute from r.horario_real at time zone v_tz)::int),
       coalesce((v_pt ->> 'tolerancia_min')::int, 5), coalesce((v_pt ->> 'limite_atraso_min')::int, 30));
    update public.registros_ponto set status_aprovacao = 'aprovado', status = v_c.status, diferenca_minutos = v_c.diferenca,
           aprovado_em = now(), aprovado_por = auth.uid(), motivo_rejeicao = null where id = p_id;
  else
    update public.registros_ponto set status_aprovacao = 'rejeitado', motivo_rejeicao = trim(p_motivo),
           aprovado_em = now(), aprovado_por = auth.uid() where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Equipe sem dados sensíveis (salário, CPF, banco) para a gerência
create or replace function public.equipe()
returns table (id uuid, nome text, cargo_id uuid, escala_id uuid, ativo boolean, data_admissao date,
               data_desligamento date, vinculo text, tem_pin boolean)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_gestao() then raise exception 'SEM_PERMISSAO'; end if;
  return query select f.id, f.nome, f.cargo_id, f.escala_id, f.ativo, f.data_admissao, f.data_desligamento, f.vinculo, f.tem_pin
                 from public.funcionarios f where f.escritorio_id = public.meu_escritorio() order by f.nome;
end $$;

create or replace function public.definir_pin(p_func_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_esc uuid := public.meu_escritorio();
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if not exists (select 1 from public.funcionarios where id = p_func_id and escritorio_id = v_esc) then raise exception 'NAO_ENCONTRADO'; end if;
  if p_pin !~ '^[0-9]{6,8}$' then raise exception 'PIN_FORMATO'; end if;
  if p_pin ~ '^(\d)\1+$' or position(p_pin in '01234567890123456789') > 0 or position(p_pin in '98765432109876543210') > 0
     or p_pin ~ '^(\d\d)\1+$' or p_pin ~ '^(\d\d\d)\1+$' or p_pin in ('123123', '112233', '121212', '654321') then
    raise exception 'PIN_FRACO';
  end if;
  insert into public.funcionario_pins (funcionario_id, escritorio_id, pin_hash) values (p_func_id, v_esc, crypt(p_pin, gen_salt('bf')))
  on conflict (funcionario_id) do update set pin_hash = excluded.pin_hash, atualizado_em = now();
  update public.funcionarios set tem_pin = true, pin_curto = false where id = p_func_id;
  delete from public.pin_tentativas where funcionario_id = p_func_id;
end $$;

-- ---------- Permissões ----------
revoke all on function public._validar_pin(uuid, text) from public, anon, authenticated;
revoke all on function public._erro(text, text) from public, anon, authenticated;
revoke all on function public.definir_pin(uuid, text) from public, anon;
revoke all on function public.aprovar_ponto(uuid, text, text) from public, anon;
revoke all on function public.equipe() from public, anon;
revoke all on function public.ponto_buscar(text, text) from public;
revoke all on function public.ponto_escala(text, uuid) from public;
revoke all on function public.ponto_contexto(text) from public;
revoke all on function public.ponto_bater(uuid, text, text, text, double precision, double precision) from public;
grant execute on function public.ponto_buscar(text, text) to anon, authenticated;
grant execute on function public.ponto_escala(text, uuid) to anon, authenticated;
grant execute on function public.ponto_contexto(text) to anon, authenticated;
grant execute on function public.ponto_bater(uuid, text, text, text, double precision, double precision) to anon, authenticated;
grant execute on function public.definir_pin(uuid, text) to authenticated;
grant execute on function public.aprovar_ponto(uuid, text, text) to authenticated;
grant execute on function public.equipe() to authenticated;

insert into public.schema_versao (versao, nome) values (2, 'ponto por PIN') on conflict (versao) do nothing;

-- >>>>>>>>>> 0003_folha_justificativas.sql <<<<<<<<<<
-- =====================================================================
-- GE ADVOCACIA · 0003 · ocorrências, atestados, ajustes, folha e integridade dos dados
--  1.2  funcionário com histórico não pode ser excluído (RESTRICT + gatilho com mensagem clara)
--  1.3  período com folha fechada/paga é congelado (marcações, ocorrências e ajustes); reabrir exige motivo
--  *    atestados/atrasos passam por análise do administrador (aceitar/recusar)
--  *    anexos ficam no Storage privado (aqui só metadados); documentos com selo de autenticidade
-- Idempotente.
-- =====================================================================

-- ---------- Ocorrências ----------
create table if not exists public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  funcionario_id uuid not null,
  data_inicio date not null,
  data_fim date not null,
  tipo text not null check (tipo in ('atestado', 'declaracao', 'audiencia_externa', 'folga_compensacao', 'ferias', 'licenca', 'outro')),
  remunerado boolean not null default true,
  observacao text,
  status_analise text not null default 'aceita' check (status_analise in ('pendente', 'aceita', 'recusada')),
  origem text not null default 'painel' check (origem in ('painel', 'funcionario')),
  motivo_decisao text,
  decidido_por uuid,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  check (data_fim >= data_inicio),
  unique (escritorio_id, id),
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete restrict
);
create index if not exists ocorrencias_func_idx on public.ocorrencias (funcionario_id, data_inicio);
create index if not exists ocorrencias_pendentes_idx on public.ocorrencias (status_analise) where status_analise = 'pendente';

-- ---------- Folha ----------
create table if not exists public.ajustes_folha (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  funcionario_id uuid not null,
  data date not null,
  tipo text not null check (tipo in ('adicional', 'hora_extra', 'desconto', 'adiantamento')),
  valor numeric(12,2) not null default 0 check (valor >= 0),
  quantidade_horas numeric(8,2),
  motivo text not null,
  observacao text,
  created_at timestamptz not null default now(),
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete restrict
);
create index if not exists ajustes_folha_func_idx on public.ajustes_folha (funcionario_id, data);

create table if not exists public.ajustes_dia (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  funcionario_id uuid not null,
  data date not null,
  situacao text not null check (situacao in ('presente', 'abonado', 'falta')),
  observacao text,
  created_at timestamptz not null default now(),
  unique (funcionario_id, data),
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete restrict
);

create table if not exists public.folhas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  funcionario_id uuid not null,
  periodo_inicio date not null,
  periodo_fim date not null,
  salario_mensal numeric(12,2) not null default 0,
  valor_diaria numeric(12,2) not null default 0,
  dias_previstos int not null default 0,
  dias_trabalhados int not null default 0,
  dias_abonados int not null default 0,
  faltas int not null default 0,
  atrasos int not null default 0,
  saidas_antecipadas int not null default 0,
  minutos_atraso int not null default 0,
  dias_extras int not null default 0,
  pendencias int not null default 0,
  horas_extras numeric(8,2) not null default 0,
  valor_bruto numeric(12,2) not null default 0,
  desconto_faltas numeric(12,2) not null default 0,
  desconto_atrasos numeric(12,2) not null default 0,
  adicionais numeric(12,2) not null default 0,
  descontos numeric(12,2) not null default 0,
  valor_final numeric(12,2) not null default 0,
  status text not null default 'aberta' check (status in ('aberta', 'fechada', 'paga')),
  detalhe jsonb not null default '[]',
  observacoes text,
  motivo_reabertura text,
  reaberta_em timestamptz,
  reaberta_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funcionario_id, periodo_inicio, periodo_fim),
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete restrict
);

-- ---------- Anexos (atestados): o arquivo fica no Storage privado; aqui só os metadados ----------
create table if not exists public.anexos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  funcionario_id uuid not null,
  ocorrencia_id uuid,
  registro_id uuid,
  nome text not null,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  tamanho int not null check (tamanho between 1 and 2097152),
  storage_path text,
  sha256 text,
  created_at timestamptz not null default now(),
  check ((ocorrencia_id is not null) <> (registro_id is not null)),
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete restrict,
  foreign key (escritorio_id, ocorrencia_id) references public.ocorrencias (escritorio_id, id) on delete cascade,
  foreign key (escritorio_id, registro_id) references public.registros_ponto (escritorio_id, id) on delete cascade
);
create index if not exists anexos_ocorrencia_idx on public.anexos (ocorrencia_id);
create index if not exists anexos_registro_idx on public.anexos (registro_id);

-- Arquivos cujo registro foi apagado: o caminho vai para a lixeira e o objeto é removido do Storage pela função de limpeza.
create table if not exists public.anexos_lixeira (
  id bigserial primary key,
  escritorio_id uuid not null references public.escritorios(id) on delete restrict,
  storage_path text not null,
  removido_em timestamptz not null default now()
);
alter table public.anexos_lixeira enable row level security;
revoke all on public.anexos_lixeira from anon, authenticated;
revoke all on sequence public.anexos_lixeira_id_seq from anon, authenticated;

create or replace function public._trg_anexo_lixeira() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if old.storage_path is not null then
    insert into public.anexos_lixeira (escritorio_id, storage_path) values (old.escritorio_id, old.storage_path);
  end if;
  return old;
end $$;
drop trigger if exists trg_lixeira on public.anexos;
create trigger trg_lixeira before delete on public.anexos for each row execute function public._trg_anexo_lixeira();

-- ---------- Documentos emitidos (selo de autenticidade dos PDFs) ----------
create table if not exists public.documentos_emitidos (
  codigo text primary key,
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  tipo text not null check (tipo in ('folha', 'holerite', 'frequencia', 'espelho')),
  titulo text not null,
  periodo text not null,
  resumo jsonb not null default '{}'::jsonb,
  hash text not null,
  emitido_por text not null,
  emitido_em timestamptz not null default now()
);

-- ---------- RLS ----------
select public._aplicar_rls_tenant('ocorrencias', true, true, true, true);
select public._aplicar_rls_tenant('ajustes_folha');
select public._aplicar_rls_tenant('ajustes_dia', true);
select public._aplicar_rls_tenant('folhas');
select public._aplicar_rls_tenant('documentos_emitidos', false, false, false, false, false);
select public._aplicar_rls_tenant('anexos', false, false, false, false, false);
-- anexos: o administrador lê os metadados e pode apagar; criar/alterar só pelo fluxo controlado (função de envio)
drop policy if exists "tenant admin remove" on public.anexos;
create policy "tenant admin remove" on public.anexos for delete to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_admin()));
revoke insert, update, truncate on public.anexos from anon, authenticated;
revoke insert, update, delete, truncate on public.documentos_emitidos from anon, authenticated;

select public._auditar_tabela(t) from unnest(array['ocorrencias', 'ajustes_folha', 'ajustes_dia', 'folhas', 'anexos']) t;

-- ---------- 1.2 · Funcionário com histórico não pode ser excluído ----------
create or replace function public._trg_funcionario_historico() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if exists (select 1 from public.registros_ponto where funcionario_id = old.id)
     or exists (select 1 from public.ocorrencias where funcionario_id = old.id)
     or exists (select 1 from public.ajustes_folha where funcionario_id = old.id)
     or exists (select 1 from public.ajustes_dia where funcionario_id = old.id)
     or exists (select 1 from public.folhas where funcionario_id = old.id)
     or exists (select 1 from public.anexos where funcionario_id = old.id) then
    raise exception 'FUNCIONARIO_COM_HISTORICO';
  end if;
  return old;
end $$;
drop trigger if exists trg_historico on public.funcionarios;
create trigger trg_historico before delete on public.funcionarios for each row execute function public._trg_funcionario_historico();

-- ---------- 1.3 · Período fechado é congelado ----------
create or replace function public._periodo_fechado(p_func uuid, p_ini date, p_fim date default null) returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from public.folhas f
                  where f.funcionario_id = p_func and f.status in ('fechada', 'paga')
                    and f.periodo_inicio <= coalesce(p_fim, p_ini) and f.periodo_fim >= p_ini)
$$;

create or replace function public._trg_periodo_fechado() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_ini date; v_fim date; v_func uuid; r record;
begin
  if public._bypass_expurgo() then return coalesce(new, old); end if;
  for r in select * from (values (case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end),
                                 (case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end)) as x(j) where j is not null loop
    v_func := (r.j ->> 'funcionario_id')::uuid;
    if tg_table_name = 'ocorrencias' then
      v_ini := (r.j ->> 'data_inicio')::date; v_fim := (r.j ->> 'data_fim')::date;
    else
      v_ini := (r.j ->> 'data')::date; v_fim := v_ini;
    end if;
    if public._periodo_fechado(v_func, v_ini, v_fim) then raise exception 'PERIODO_FECHADO'; end if;
  end loop;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['registros_ponto', 'ocorrencias', 'ajustes_dia', 'ajustes_folha'] loop
    execute format('drop trigger if exists trg_periodo_fechado on public.%I', t);
    execute format('create trigger trg_periodo_fechado before insert or update or delete on public.%I for each row execute function public._trg_periodo_fechado()', t);
  end loop;
end $$;

-- A própria folha: fechada/paga só muda de status; reabrir exige motivo (e fica na auditoria).
create or replace function public._trg_folha_regras() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_fecha boolean;
begin
  if tg_op = 'DELETE' then
    if old.status in ('fechada', 'paga') and not public._bypass_expurgo() then raise exception 'PERIODO_FECHADO'; end if;
    return old;
  end if;

  v_fecha := new.status in ('fechada', 'paga') and (tg_op = 'INSERT' or old.status = 'aberta');
  if v_fecha then
    -- não fecha com atestado/atraso ainda em análise
    if exists (select 1 from public.ocorrencias o where o.funcionario_id = new.funcionario_id and o.status_analise = 'pendente'
                  and o.data_inicio <= new.periodo_fim and o.data_fim >= new.periodo_inicio)
       or exists (select 1 from public.registros_ponto r where r.funcionario_id = new.funcionario_id and r.analise = 'pendente'
                  and r.status_aprovacao <> 'rejeitado' and r.data between new.periodo_inicio and new.periodo_fim) then
      raise exception 'ANALISES_PENDENTES';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status in ('fechada', 'paga') then
    if new.status = 'aberta' then
      if not public.eh_admin() then raise exception 'SO_ADMINISTRADOR'; end if;
      if length(trim(coalesce(new.motivo_reabertura, ''))) < 5 or new.motivo_reabertura is not distinct from old.motivo_reabertura then
        raise exception 'MOTIVO_REABERTURA';
      end if;
      new.reaberta_em := now(); new.reaberta_por := auth.uid();
      insert into public.auditoria (escritorio_id, usuario, usuario_id, acao, detalhe, tabela, registro_id, origem)
      values (new.escritorio_id,
              coalesce((select nome || ' <' || email || '>' from public.perfis where id = auth.uid()), 'Sistema'), auth.uid(),
              'Folha reaberta', left(public._rotulo_registro('folhas', to_jsonb(new)) || ' · motivo: ' || trim(new.motivo_reabertura), 500),
              'folhas', new.id::text, nullif(public._origem(), ''));
    else
      -- continua fechada/paga: só o status pode mudar
      if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
        raise exception 'FOLHA_FECHADA';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_folha_regras on public.folhas;
create trigger trg_folha_regras before insert or update or delete on public.folhas for each row execute function public._trg_folha_regras();

-- ---------- Só o administrador decide atestados e atrasos ----------
create or replace function public._trg_decisao_ocorrencia() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if new.status_analise is distinct from old.status_analise then
    if not public.eh_admin() then raise exception 'SO_ADMINISTRADOR'; end if;
    new.decidido_por := auth.uid(); new.decidido_em := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_decisao on public.ocorrencias;
create trigger trg_decisao before update on public.ocorrencias for each row execute function public._trg_decisao_ocorrencia();

create or replace function public._trg_decisao_registro() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if new.analise is distinct from old.analise then
    if not public.eh_admin() then raise exception 'SO_ADMINISTRADOR'; end if;
    new.decidido_por := auth.uid(); new.decidido_em := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_decisao on public.registros_ponto;
create trigger trg_decisao before update on public.registros_ponto for each row execute function public._trg_decisao_registro();

-- ---------- API pública do ponto (continuação) ----------
create or replace function public.ponto_historico(p_func_id uuid, p_pin text, p_limite int default 12) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  return jsonb_build_object('ok', true,
    'registros', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.horario_real desc) from (
        select r.id, r.data, r.tipo, r.horario_previsto, r.horario_real, r.diferenca_minutos, r.status, r.justificativa,
               r.status_aprovacao, r.retroativo, r.motivo_rejeicao, r.analise, r.motivo_decisao
          from public.registros_ponto r where r.funcionario_id = p_func_id
         order by r.horario_real desc limit greatest(least(p_limite, 60), 1)) x), '[]'::jsonb),
    'justificativas', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at desc) from (
        select o.id, o.data_inicio, o.data_fim, o.tipo, o.status_analise, o.motivo_decisao, o.observacao, o.created_at,
               (select count(*) from public.anexos a where a.ocorrencia_id = o.id)::int as anexos
          from public.ocorrencias o where o.funcionario_id = p_func_id and o.origem = 'funcionario'
         order by o.created_at desc limit 10) o), '[]'::jsonb));
end $$;

create or replace function public.ponto_retroativo(
  p_func_id uuid, p_pin text, p_data date, p_tipo text, p_hora text, p_justificativa text
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text; v_esc uuid; v_dias jsonb; v_prev text; v_id uuid; v_diff int; v_hoje date;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  select escritorio_id into v_esc from public.funcionarios where id = p_func_id;
  v_hoje := public._hoje(v_esc);
  if p_tipo not in ('entrada', 'saida_intervalo', 'retorno_intervalo', 'saida') then return public._erro('TIPO_INVALIDO'); end if;
  if p_hora is null or p_hora !~ '^[0-2][0-9]:[0-5][0-9]$' or substr(p_hora, 1, 2)::int > 23 then return public._erro('HORA_INVALIDA'); end if;
  if p_data is null or p_data >= v_hoje then return public._erro('USE_PONTO_NORMAL'); end if;
  if p_data < v_hoje - 45 then return public._erro('DATA_MUITO_ANTIGA'); end if;
  if length(trim(coalesce(p_justificativa, ''))) < 5 then return public._erro('JUSTIFICATIVA_OBRIGATORIA'); end if;
  if public._periodo_fechado(p_func_id, p_data) then return public._erro('PERIODO_FECHADO'); end if;
  if exists (select 1 from public.registros_ponto where funcionario_id = p_func_id and data = p_data
              and tipo = p_tipo and status_aprovacao <> 'rejeitado') then
    return public._erro('JA_REGISTRADO');
  end if;
  select e.dias into v_dias from public.escalas e join public.funcionarios f on f.escritorio_id = e.escritorio_id and f.escala_id = e.id where f.id = p_func_id;
  v_prev := public._turno_previsto(v_dias, extract(dow from p_data)::int, p_tipo);
  v_diff := case when v_prev is null then 0 else public._hhmm_min(p_hora) - public._hhmm_min(v_prev) end;
  begin
    insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, horario_previsto, horario_real, diferenca_minutos,
                                        status, justificativa, status_aprovacao, retroativo)
    values (v_esc, p_func_id, p_data, p_tipo, v_prev, ((p_data::text || ' ' || p_hora || ':00')::timestamp at time zone public._fuso(v_esc)), v_diff,
            'pendente', trim(p_justificativa), 'pendente', true)
    returning id into v_id;
  exception when unique_violation then
    return public._erro('JA_REGISTRADO');
  end;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Funcionário envia justificativa de ausência (atestado etc.). Fica pendente até o administrador decidir.
create or replace function public.ponto_justificar_ausencia(p_func_id uuid, p_pin text, p_inicio date, p_fim date, p_tipo text, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text; v_esc uuid; v_hoje date; v_id uuid;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  select escritorio_id into v_esc from public.funcionarios where id = p_func_id;
  v_hoje := public._hoje(v_esc);
  if p_tipo not in ('atestado', 'declaracao', 'audiencia_externa', 'outro') then return public._erro('TIPO_INVALIDO'); end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 30 then return public._erro('PERIODO_INVALIDO'); end if;
  if p_inicio < v_hoje - 45 then return public._erro('DATA_MUITO_ANTIGA'); end if;
  if p_fim > v_hoje + 30 then return public._erro('PERIODO_INVALIDO'); end if;
  if length(coalesce(p_obs, '')) > 600 then return public._erro('PERIODO_INVALIDO'); end if;
  if public._periodo_fechado(p_func_id, p_inicio, p_fim) then return public._erro('PERIODO_FECHADO'); end if;
  if exists (select 1 from public.ocorrencias where funcionario_id = p_func_id and status_analise <> 'recusada'
               and data_inicio <= p_fim and data_fim >= p_inicio) then
    return public._erro('JA_REGISTRADO');
  end if;
  insert into public.ocorrencias (escritorio_id, funcionario_id, data_inicio, data_fim, tipo, remunerado, observacao, origem, status_analise)
  values (v_esc, p_func_id, p_inicio, p_fim, p_tipo, true, nullif(trim(p_obs), ''), 'funcionario', 'pendente')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Anexos: o ARQUIVO só entra pela Edge Function "anexos" (service_role), que valida tipo real e tamanho e grava no
-- Storage privado. Esta função autoriza e registra os metadados; devolve o caminho onde o arquivo deve ser gravado.
create or replace function public.ponto_anexo_preparar(
  p_func_id uuid, p_pin text, p_registro_id uuid, p_ocorrencia_id uuid, p_nome text, p_mime text, p_tamanho int, p_sha256 text
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text; v_esc uuid; v_ok boolean := false; v_n int; v_id uuid := gen_random_uuid(); v_path text;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  select escritorio_id into v_esc from public.funcionarios where id = p_func_id;
  if (p_registro_id is null) = (p_ocorrencia_id is null) then return public._erro('NAO_ENCONTRADO'); end if;
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') or coalesce(p_tamanho, 0) not between 1 and 2097152 then
    return public._erro('ARQUIVO_INVALIDO', 'Envie PDF ou foto (JPG, PNG) de até 2 MB');
  end if;
  if p_ocorrencia_id is not null then
    select true into v_ok from public.ocorrencias where id = p_ocorrencia_id and funcionario_id = p_func_id and origem = 'funcionario' and status_analise = 'pendente';
    select count(*) into v_n from public.anexos where ocorrencia_id = p_ocorrencia_id;
  else
    select true into v_ok from public.registros_ponto where id = p_registro_id and funcionario_id = p_func_id
       and analise = 'pendente' and created_at > now() - interval '48 hours';
    select count(*) into v_n from public.anexos where registro_id = p_registro_id;
  end if;
  if not coalesce(v_ok, false) then return public._erro('NAO_ENCONTRADO'); end if;
  if v_n >= 4 then return public._erro('LIMITE_ANEXOS'); end if;
  v_path := v_esc::text || '/' || p_func_id::text || '/' || v_id::text;
  insert into public.anexos (id, escritorio_id, funcionario_id, ocorrencia_id, registro_id, nome, mime, tamanho, storage_path, sha256)
  values (v_id, v_esc, p_func_id, p_ocorrencia_id, p_registro_id,
          left(regexp_replace(coalesce(p_nome, 'arquivo'), '[^A-Za-z0-9._ ()-]', '_', 'g'), 120), p_mime, p_tamanho, v_path, p_sha256);
  return jsonb_build_object('ok', true, 'id', v_id, 'path', v_path);
end $$;

-- Se o envio ao Storage falhar, a Edge Function desfaz o registro.
create or replace function public.ponto_anexo_cancelar(p_id uuid) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  delete from public.anexos where id = p_id
$$;

-- ---------- Autenticidade dos documentos ----------
drop function if exists public.registrar_documento(text, text, text, jsonb, text);
create or replace function public.registrar_documento(p_tipo text, p_titulo text, p_periodo text, p_resumo jsonb, p_hash text, p_codigo text default null)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_codigo text := upper(trim(coalesce(p_codigo, ''))); v_papel text := public.papel_atual(); v_hash text; v_esc uuid := public.meu_escritorio();
begin
  if v_papel is null then raise exception 'SEM_PERMISSAO'; end if;
  if p_hash !~ '^[0-9a-f]{64}$' then raise exception 'HASH_INVALIDO'; end if;
  if v_codigo <> '' then
    if v_codigo !~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' then raise exception 'CODIGO_INVALIDO'; end if;
    select hash into v_hash from public.documentos_emitidos where codigo = v_codigo and escritorio_id = v_esc;
    if found then
      if v_hash = p_hash then return v_codigo; end if;       -- repetição idempotente
      raise exception 'CODIGO_EXISTE';
    end if;
    if exists (select 1 from public.documentos_emitidos where codigo = v_codigo) then raise exception 'CODIGO_EXISTE'; end if;
  else
    loop
      v_codigo := upper(encode(gen_random_bytes(6), 'hex'));
      v_codigo := substr(v_codigo, 1, 4) || '-' || substr(v_codigo, 5, 4) || '-' || substr(v_codigo, 9, 4);
      exit when not exists (select 1 from public.documentos_emitidos where codigo = v_codigo);
    end loop;
  end if;
  insert into public.documentos_emitidos (codigo, escritorio_id, tipo, titulo, periodo, resumo, hash, emitido_por)
  values (v_codigo, v_esc, p_tipo, left(p_titulo, 160), left(p_periodo, 160), coalesce(p_resumo, '{}'::jsonb), p_hash,
          case v_papel when 'admin' then 'Administração' else 'Gerência' end);
  return v_codigo;
end $$;

-- Consulta pública por código (sem login): só o necessário para conferir o documento, sem dados pessoais.
create or replace function public.verificar_documento(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare d public.documentos_emitidos; v_nome text;
begin
  select * into d from public.documentos_emitidos where codigo = upper(trim(coalesce(p_codigo, '')));
  if not found then return jsonb_build_object('ok', false); end if;
  select e.nome into v_nome from public.escritorios e where e.id = d.escritorio_id;
  return jsonb_build_object('ok', true, 'codigo', d.codigo, 'tipo', d.tipo, 'titulo', d.titulo, 'periodo', d.periodo,
                            'resumo', d.resumo, 'hash', d.hash, 'emitido_por', d.emitido_por, 'emitido_em', d.emitido_em, 'escritorio', v_nome);
end $$;

-- Períodos fechados do escritório (a gerência não lê `folhas`, mas precisa saber o que está congelado para desabilitar botões).
create or replace function public.periodos_fechados()
returns table (funcionario_id uuid, periodo_inicio date, periodo_fim date, status text)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_gestao() then raise exception 'SEM_PERMISSAO'; end if;
  return query select f.funcionario_id, f.periodo_inicio, f.periodo_fim, f.status
                 from public.folhas f where f.escritorio_id = public.meu_escritorio() and f.status in ('fechada', 'paga');
end $$;

-- ---------- Permissões ----------
revoke all on function public.periodos_fechados() from public, anon;
grant execute on function public.periodos_fechados() to authenticated;
revoke all on function public._trg_periodo_fechado() from public, anon, authenticated;
revoke all on function public._trg_folha_regras() from public, anon, authenticated;
revoke all on function public._trg_funcionario_historico() from public, anon, authenticated;
revoke all on function public._trg_anexo_lixeira() from public, anon, authenticated;
revoke all on function public._trg_decisao_ocorrencia() from public, anon, authenticated;
revoke all on function public._trg_decisao_registro() from public, anon, authenticated;
revoke all on function public._periodo_fechado(uuid, date, date) from public, anon, authenticated;
revoke all on function public.ponto_historico(uuid, text, int) from public;
revoke all on function public.ponto_retroativo(uuid, text, date, text, text, text) from public;
revoke all on function public.ponto_justificar_ausencia(uuid, text, date, date, text, text) from public;
revoke all on function public.ponto_anexo_preparar(uuid, text, uuid, uuid, text, text, int, text) from public, anon, authenticated;
revoke all on function public.ponto_anexo_cancelar(uuid) from public, anon, authenticated;
revoke all on function public.registrar_documento(text, text, text, jsonb, text, text) from public, anon;
revoke all on function public.verificar_documento(text) from public;
grant execute on function public.ponto_historico(uuid, text, int) to anon, authenticated;
grant execute on function public.ponto_retroativo(uuid, text, date, text, text, text) to anon, authenticated;
grant execute on function public.ponto_justificar_ausencia(uuid, text, date, date, text, text) to anon, authenticated;
grant execute on function public.registrar_documento(text, text, text, jsonb, text, text) to authenticated;
grant execute on function public.verificar_documento(text) to anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ponto_anexo_preparar(uuid, text, uuid, uuid, text, text, int, text) to service_role;
    grant execute on function public.ponto_anexo_cancelar(uuid) to service_role;
  end if;
end $$;

insert into public.schema_versao (versao, nome) values (3, 'folha, atestados e integridade') on conflict (versao) do nothing;

-- >>>>>>>>>> 0004_acessos_plataforma.sql <<<<<<<<<<
-- =====================================================================
-- GE ADVOCACIA · 0004 · acessos ao painel e área da plataforma
--  * escritório (admin): cria/edita/remove usuários SÓ do próprio escritório
--  * plataforma (dono do GE Advocacia): cria, suspende e atende escritórios — sem ver os dados deles
-- As funções gravam em auth.users, por isso rodam como SECURITY DEFINER.
-- Idempotente.
-- =====================================================================

-- ---------- Validações e criação de usuário no Auth ----------
create or replace function public._validar_acesso(p_email text, p_senha text, p_nome text) returns text
language plpgsql immutable set search_path = public, extensions, pg_temp as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'EMAIL_INVALIDO'; end if;
  if length(coalesce(p_senha, '')) < 10 then raise exception 'SENHA_CURTA'; end if;
  if p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then raise exception 'SENHA_FRACA'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'NOME_OBRIGATORIO'; end if;
  return v_email;
end $$;

create or replace function public._criar_auth_user(p_email text, p_senha text) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where lower(email) = p_email) then raise exception 'EMAIL_EXISTE'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email, crypt(p_senha, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), 'email', v_id::text, now(), now(), now());
  return v_id;
end $$;

create or replace function public._nome_logado() returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce((select nome from public.perfis where id = auth.uid()), (select nome from public.plataforma_admins where id = auth.uid()), 'admin')
$$;

create or replace function public._plat_auditar(p_acao text, p_detalhe text, p_esc uuid default null) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.plataforma_auditoria (usuario, acao, detalhe, escritorio_id) values (public._nome_logado(), p_acao, left(p_detalhe, 500), p_esc)
$$;

create or replace function public._admins_ativos(p_esc uuid) returns int
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select count(*)::int from public.perfis where escritorio_id = p_esc and papel = 'admin' and ativo
$$;

-- ---------- Sessão ----------
create or replace function public.minha_sessao() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare p public.perfis; e public.escritorios; a public.plataforma_admins;
begin
  if auth.uid() is null then return public._erro('SEM_SESSAO'); end if;
  select * into p from public.perfis where id = auth.uid();
  if found then
    select * into e from public.escritorios where id = p.escritorio_id;
    if not p.ativo then return public._erro('ACESSO_INATIVO'); end if;
    if not e.ativo then return public._erro('ESCRITORIO_SUSPENSO'); end if;
    return jsonb_build_object('ok', true, 'tipo', 'escritorio', 'id', p.id, 'nome', p.nome, 'email', p.email, 'papel', p.papel,
      'escritorio', jsonb_build_object('id', e.id, 'nome', e.nome, 'slug', e.slug, 'fuso', e.fuso));
  end if;
  select * into a from public.plataforma_admins where id = auth.uid() and ativo;
  if found then
    return jsonb_build_object('ok', true, 'tipo', 'plataforma', 'id', a.id, 'nome', a.nome, 'email', a.email, 'papel', 'plataforma');
  end if;
  return public._erro('SEM_PERFIL');
end $$;

-- ---------- Usuários do escritório (só admin, só do próprio escritório) ----------
create or replace function public.criar_usuario(p_email text, p_senha text, p_nome text, p_papel text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id uuid; v_email text; v_esc uuid := public.meu_escritorio();
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_papel not in ('admin', 'gerente') then raise exception 'PAPEL_INVALIDO'; end if;
  v_email := public._validar_acesso(p_email, p_senha, p_nome);
  v_id := public._criar_auth_user(v_email, p_senha);
  insert into public.perfis (id, escritorio_id, nome, email, papel) values (v_id, v_esc, trim(p_nome), v_email, p_papel);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.atualizar_usuario(p_id uuid, p_nome text, p_papel text, p_ativo boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_esc uuid := public.meu_escritorio();
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_papel not in ('admin', 'gerente') then raise exception 'PAPEL_INVALIDO'; end if;
  update public.perfis set nome = coalesce(nullif(trim(p_nome), ''), nome), papel = p_papel, ativo = p_ativo
   where id = p_id and escritorio_id = v_esc;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if public._admins_ativos(v_esc) < 1 then raise exception 'ULTIMO_ADMIN'; end if;   -- desfaz a transação
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.redefinir_senha_usuario(p_id uuid, p_senha text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if length(coalesce(p_senha, '')) < 10 then raise exception 'SENHA_CURTA'; end if;
  if p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then raise exception 'SENHA_FRACA'; end if;
  if not exists (select 1 from public.perfis where id = p_id and escritorio_id = public.meu_escritorio()) then raise exception 'NAO_ENCONTRADO'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now() where id = p_id;
  insert into public.auditoria (escritorio_id, usuario, usuario_id, acao, detalhe)
  values (public.meu_escritorio(), public._nome_logado(), auth.uid(), 'Senha redefinida', (select email from public.perfis where id = p_id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.remover_usuario(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_esc uuid := public.meu_escritorio(); v_email text;
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_id = auth.uid() then raise exception 'NAO_REMOVER_A_SI'; end if;
  select email into v_email from public.perfis where id = p_id and escritorio_id = v_esc;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  delete from auth.users where id = p_id;      -- o perfil sai por cascata
  if public._admins_ativos(v_esc) < 1 then raise exception 'ULTIMO_ADMIN'; end if;
  insert into public.auditoria (escritorio_id, usuario, usuario_id, acao, detalhe)
  values (v_esc, public._nome_logado(), auth.uid(), 'Acesso removido', v_email);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Plataforma: escritórios ----------
-- Dados iniciais de um escritório novo (cargos, escalas e configurações). O escritório edita tudo depois.
create or replace function public._semear_escritorio(p_esc uuid, p_nome text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  insert into public.cargos (escritorio_id, nome, categoria, descricao) values
    (p_esc, 'Sócio(a) Administrador(a)', 'gerencia', 'Direção do escritório'),
    (p_esc, 'Gerente Administrativo(a)', 'gerencia', 'Gestão de equipe, escalas, aprovação de ponto e rotinas internas'),
    (p_esc, 'Gerente Jurídico(a)', 'gerencia', 'Coordenação técnica da equipe de advogados'),
    (p_esc, 'Advogado(a) Associado(a)', 'juridico', 'Atuação contenciosa e consultiva'),
    (p_esc, 'Estagiário(a) de Direito', 'estagio', 'Apoio jurídico, protocolo e acompanhamento processual'),
    (p_esc, 'Assistente Jurídico(a)', 'juridico', 'Elaboração de peças, cálculos e organização de processos'),
    (p_esc, 'Secretário(a) / Recepcionista', 'administrativo', 'Atendimento a clientes, agenda e recepção'),
    (p_esc, 'Auxiliar Administrativo(a)', 'administrativo', 'Rotinas financeiras, arquivo e documentos'),
    (p_esc, 'Serviços Gerais', 'apoio', 'Limpeza, copa e apoio operacional')
  on conflict (escritorio_id, nome) do nothing;

  if not exists (select 1 from public.escalas where escritorio_id = p_esc) then
    insert into public.escalas (escritorio_id, nome, dias) values
      (p_esc, 'Comercial · Seg–Sex 08h–18h, Sáb 08h–12h',
       '{"1":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
         "2":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
         "3":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
         "4":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
         "5":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
         "6":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"12:00"}}'),
      (p_esc, 'Estágio · Seg–Sex 08h–14h',
       '{"1":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
         "2":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
         "3":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
         "4":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
         "5":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
         "6":{"ativo":false,"entrada":"","saida_intervalo":"","retorno_intervalo":"","saida":""}}'),
      (p_esc, 'Apoio · Seg–Sáb 07h–13h',
       '{"1":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
         "2":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
         "3":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
         "4":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
         "5":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
         "6":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"}}');
  end if;

  insert into public.configuracoes (escritorio_id, dados) values (p_esc, jsonb_build_object(
    'escritorio', jsonb_build_object('nome', p_nome, 'cnpj', '', 'endereco', '', 'cidade', '', 'telefone', '', 'email', '', 'oab_sociedade', ''),
    'ponto', jsonb_build_object('tolerancia_min', 5, 'limite_atraso_min', 30, 'geofence_ativo', false, 'geofence_lat', null,
                                'geofence_lng', null, 'geofence_raio_m', 300, 'geofence_endereco', ''),
    'folha', jsonb_build_object('periodicidade', 'mensal', 'descontar_atrasos', false, 'hora_extra_pct', 50)))
  on conflict (escritorio_id) do nothing;
end $$;

create or replace function public.plataforma_criar_escritorio(
  p_nome text, p_slug text, p_admin_nome text, p_admin_email text, p_admin_senha text, p_fuso text default 'America/Fortaleza'
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_esc uuid; v_email text; v_uid uuid; v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'NOME_OBRIGATORIO'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'SLUG_INVALIDO'; end if;
  if exists (select 1 from public.escritorios where slug = v_slug) then raise exception 'SLUG_EXISTE'; end if;
  v_email := public._validar_acesso(p_admin_email, p_admin_senha, p_admin_nome);
  insert into public.escritorios (nome, slug, fuso) values (trim(p_nome), v_slug, coalesce(nullif(trim(p_fuso), ''), 'America/Fortaleza'))
  returning id into v_esc;
  v_uid := public._criar_auth_user(v_email, p_admin_senha);
  insert into public.perfis (id, escritorio_id, nome, email, papel) values (v_uid, v_esc, trim(p_admin_nome), v_email, 'admin');
  perform public._semear_escritorio(v_esc, trim(p_nome));
  perform public._plat_auditar('Escritório criado', trim(p_nome) || ' (' || v_slug || ') · admin ' || v_email, v_esc);
  return jsonb_build_object('ok', true, 'id', v_esc, 'slug', v_slug, 'admin_id', v_uid);
end $$;

-- Lista os escritórios com CONTAGENS (nunca dados de pessoas, salários ou ponto).
create or replace function public.plataforma_listar_escritorios() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'slug', e.slug, 'ativo', e.ativo, 'fuso', e.fuso, 'created_at', e.created_at,
      'usuarios', (select count(*) from public.perfis p where p.escritorio_id = e.id),
      'admins', (select count(*) from public.perfis p where p.escritorio_id = e.id and p.papel = 'admin' and p.ativo),
      'funcionarios', (select count(*) from public.funcionarios f where f.escritorio_id = e.id and f.ativo)
    ) order by e.nome) from public.escritorios e), '[]'::jsonb);
end $$;

create or replace function public.plataforma_atualizar_escritorio(p_id uuid, p_nome text, p_ativo boolean, p_fuso text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'NOME_OBRIGATORIO'; end if;
  update public.escritorios set nome = trim(p_nome), ativo = p_ativo, fuso = coalesce(nullif(trim(p_fuso), ''), fuso) where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  perform public._plat_auditar(case when p_ativo then 'Escritório atualizado' else 'Escritório suspenso' end, trim(p_nome), p_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.plataforma_listar_usuarios(p_escritorio_id uuid)
returns table (id uuid, nome text, email text, papel text, ativo boolean)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  return query select p.id, p.nome, p.email, p.papel, p.ativo from public.perfis p where p.escritorio_id = p_escritorio_id order by p.papel, p.nome;
end $$;

create or replace function public.plataforma_criar_admin(p_escritorio_id uuid, p_nome text, p_email text, p_senha text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_email text; v_uid uuid;
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  if not exists (select 1 from public.escritorios where id = p_escritorio_id) then raise exception 'NAO_ENCONTRADO'; end if;
  v_email := public._validar_acesso(p_email, p_senha, p_nome);
  v_uid := public._criar_auth_user(v_email, p_senha);
  insert into public.perfis (id, escritorio_id, nome, email, papel) values (v_uid, p_escritorio_id, trim(p_nome), v_email, 'admin');
  perform public._plat_auditar('Administrador criado', v_email, p_escritorio_id);
  return jsonb_build_object('ok', true, 'id', v_uid);
end $$;

-- Suporte: redefine a senha de um acesso (a plataforma nunca vê a senha atual, só define uma nova).
create or replace function public.plataforma_redefinir_senha(p_usuario_id uuid, p_senha text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare p public.perfis;
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  if length(coalesce(p_senha, '')) < 10 then raise exception 'SENHA_CURTA'; end if;
  if p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then raise exception 'SENHA_FRACA'; end if;
  select * into p from public.perfis where id = p_usuario_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now() where id = p_usuario_id;
  perform public._plat_auditar('Senha redefinida pela plataforma', p.email, p.escritorio_id);
  return jsonb_build_object('ok', true);
end $$;

-- Só escritórios SEM funcionários cadastrados (por exemplo, criados por engano) podem ser excluídos.
create or replace function public.plataforma_excluir_escritorio(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare e public.escritorios;
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  select * into e from public.escritorios where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if exists (select 1 from public.funcionarios where escritorio_id = p_id) then raise exception 'ESCRITORIO_COM_DADOS'; end if;
  delete from auth.users where id in (select id from public.perfis where escritorio_id = p_id);
  delete from public.configuracoes where escritorio_id = p_id;
  delete from public.escalas where escritorio_id = p_id;
  delete from public.cargos where escritorio_id = p_id;
  delete from public.feriados where escritorio_id = p_id;
  delete from public.escritorios where id = p_id;
  perform public._plat_auditar('Escritório excluído', e.nome || ' (' || e.slug || ')', null);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Permissões ----------
revoke all on function public._validar_acesso(text, text, text) from public, anon, authenticated;
revoke all on function public._criar_auth_user(text, text) from public, anon, authenticated;
revoke all on function public._nome_logado() from public, anon, authenticated;
revoke all on function public._plat_auditar(text, text, uuid) from public, anon, authenticated;
revoke all on function public._admins_ativos(uuid) from public, anon, authenticated;
revoke all on function public._semear_escritorio(uuid, text) from public, anon, authenticated;
revoke all on function public.minha_sessao() from public, anon;
revoke all on function public.criar_usuario(text, text, text, text) from public, anon;
revoke all on function public.atualizar_usuario(uuid, text, text, boolean) from public, anon;
revoke all on function public.redefinir_senha_usuario(uuid, text) from public, anon;
revoke all on function public.remover_usuario(uuid) from public, anon;
revoke all on function public.plataforma_criar_escritorio(text, text, text, text, text, text) from public, anon;
revoke all on function public.plataforma_listar_escritorios() from public, anon;
revoke all on function public.plataforma_atualizar_escritorio(uuid, text, boolean, text) from public, anon;
revoke all on function public.plataforma_listar_usuarios(uuid) from public, anon;
revoke all on function public.plataforma_criar_admin(uuid, text, text, text) from public, anon;
revoke all on function public.plataforma_redefinir_senha(uuid, text) from public, anon;
revoke all on function public.plataforma_excluir_escritorio(uuid) from public, anon;
grant execute on function public.minha_sessao() to authenticated;
grant execute on function public.criar_usuario(text, text, text, text) to authenticated;
grant execute on function public.atualizar_usuario(uuid, text, text, boolean) to authenticated;
grant execute on function public.redefinir_senha_usuario(uuid, text) to authenticated;
grant execute on function public.remover_usuario(uuid) to authenticated;
grant execute on function public.plataforma_criar_escritorio(text, text, text, text, text, text) to authenticated;
grant execute on function public.plataforma_listar_escritorios() to authenticated;
grant execute on function public.plataforma_atualizar_escritorio(uuid, text, boolean, text) to authenticated;
grant execute on function public.plataforma_listar_usuarios(uuid) to authenticated;
grant execute on function public.plataforma_criar_admin(uuid, text, text, text) to authenticated;
grant execute on function public.plataforma_redefinir_senha(uuid, text) to authenticated;
grant execute on function public.plataforma_excluir_escritorio(uuid) to authenticated;

insert into public.schema_versao (versao, nome) values (4, 'acessos e plataforma') on conflict (versao) do nothing;

-- >>>>>>>>>> 0005_privacidade.sql <<<<<<<<<<
-- =====================================================================
-- GE ADVOCACIA · 0005 · atestados no Storage privado, rastro de acessos e retenção (LGPD)
--  2.1  bucket PRIVADO "anexos": sem política pública; só a Edge Function (service_role) grava e assina URLs de 60 s
--  2.2  cada abertura de atestado é registrada em acessos_sensiveis (somente inserção)
--  2.3  prazos de guarda por escritório + expurgo com prévia e trilha de auditoria
-- Os prazos padrão são ponto de partida: CONFIRMAR COM O JURÍDICO/CONTABILIDADE de cada escritório.
-- Idempotente.
-- =====================================================================

-- ---------- 2.1 · Bucket privado ----------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('anexos', 'anexos', false, 2097152, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = 2097152,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    -- Nenhuma política em storage.objects para anon/authenticated: o acesso é só pela Edge Function "anexos".
  end if;
end $$;

-- ---------- 2.2 · Abrir um anexo: só administrador, do próprio escritório, e fica registrado ----------
create or replace function public.anexo_abrir(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.anexos;
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  select * into a from public.anexos where id = p_id and escritorio_id = public.meu_escritorio();
  if not found or a.storage_path is null then raise exception 'NAO_ENCONTRADO'; end if;
  insert into public.acessos_sensiveis (escritorio_id, usuario_id, usuario, anexo_id, funcionario_id, acao, origem)
  values (a.escritorio_id, auth.uid(),
          coalesce((select nome || ' <' || email || '>' from public.perfis where id = auth.uid()), auth.uid()::text),
          a.id, a.funcionario_id, 'abrir', nullif(public._origem(), ''));
  return jsonb_build_object('ok', true, 'path', a.storage_path, 'nome', a.nome, 'mime', a.mime);
end $$;

-- ---------- 2.3 · Retenção e minimização ----------
create or replace function public._retencao(p_esc uuid) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object(
    'anexos_meses', coalesce((c.dados -> 'privacidade' ->> 'anexos_meses')::int, 60),
    'geolocalizacao_meses', coalesce((c.dados -> 'privacidade' ->> 'geolocalizacao_meses')::int, 12),
    'tentativas_dias', 90)
  from (select 1) x left join public.configuracoes c on c.escritorio_id = p_esc
$$;

-- Quanto seria apagado agora (prévia) e, com p_confirmar = true, apaga e registra na auditoria.
create or replace function public.expurgo_executar(p_confirmar boolean default false) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_esc uuid := public.meu_escritorio(); r jsonb; v_anexos int; v_geo int; v_tent int; v_lixeira int;
  v_corte_anexos timestamptz; v_corte_geo date; v_corte_tent timestamptz;
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  r := public._retencao(v_esc);
  v_corte_anexos := now() - make_interval(months => (r ->> 'anexos_meses')::int);
  v_corte_geo := public._hoje(v_esc) - ((r ->> 'geolocalizacao_meses')::int * 30);
  v_corte_tent := now() - make_interval(days => (r ->> 'tentativas_dias')::int);

  select count(*) into v_anexos from public.anexos where escritorio_id = v_esc and created_at < v_corte_anexos;
  select count(*) into v_geo from public.registros_ponto where escritorio_id = v_esc and data < v_corte_geo and (latitude is not null or longitude is not null);
  select count(*) into v_tent from public.pin_tentativas where escritorio_id = v_esc and created_at < v_corte_tent;

  if p_confirmar then
    insert into public._expurgo_ativo (tx) values (txid_current()) on conflict do nothing;
    delete from public.anexos where escritorio_id = v_esc and created_at < v_corte_anexos;
    update public.registros_ponto set latitude = null, longitude = null
     where escritorio_id = v_esc and data < v_corte_geo and (latitude is not null or longitude is not null);
    delete from public.pin_tentativas where escritorio_id = v_esc and created_at < v_corte_tent;
    delete from public._expurgo_ativo where tx = txid_current();
    insert into public.auditoria (escritorio_id, usuario, usuario_id, acao, detalhe, tabela, origem)
    values (v_esc, public._nome_logado(), auth.uid(), 'Expurgo de retenção',
            format('anexos: %s · geolocalização de marcações: %s · tentativas de PIN: %s', v_anexos, v_geo, v_tent), 'retencao', nullif(public._origem(), ''));
  end if;
  select count(*) into v_lixeira from public.anexos_lixeira where escritorio_id = v_esc;
  return jsonb_build_object('ok', true, 'executado', p_confirmar, 'anexos', v_anexos, 'geolocalizacao', v_geo, 'tentativas_pin', v_tent,
                            'arquivos_a_remover_do_storage', v_lixeira, 'regras', r);
end $$;

-- Rotina automática (todos os escritórios): só tentativas de PIN com mais de 90 dias. Dados de saúde e geolocalização
-- só saem por decisão do administrador do escritório (expurgo_executar).
create or replace function public.expurgar_tentativas_antigas() returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int;
begin
  delete from public.pin_tentativas where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ge-expurgo-tentativas', '15 6 * * *', 'select public.expurgar_tentativas_antigas()');
  end if;
exception when others then null;   -- agendamento é opcional; o botão manual continua disponível
end $$;

-- ---------- Backup externo: o workflow de backup registra cada sucesso (3.4 · alerta se passar de 48 h) ----------
create table if not exists public.backup_status (
  id int primary key default 1 check (id = 1),
  ultimo_sucesso timestamptz,
  detalhe text
);
alter table public.backup_status enable row level security;
revoke all on public.backup_status from anon, authenticated;
insert into public.backup_status (id) values (1) on conflict (id) do nothing;

-- Chamada pelo workflow de backup, com a conexão direta do banco (SUPABASE_DB_URL), nunca pela API.
create or replace function public.backup_registrar(p_detalhe text default null) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  update public.backup_status set ultimo_sucesso = now(), detalhe = left(p_detalhe, 300) where id = 1
$$;
-- Administradores (de escritório ou da plataforma) veem só a DATA do último backup (tela Diagnóstico).
create or replace function public.backup_ultimo() returns timestamptz
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select ultimo_sucesso from public.backup_status where id = 1 and (public.eh_admin() or public.eh_plataforma())
$$;

-- ---------- Permissões ----------
revoke all on function public.backup_registrar(text) from public, anon, authenticated;
revoke all on function public.backup_ultimo() from public, anon;
grant execute on function public.backup_ultimo() to authenticated;
revoke all on function public.anexo_abrir(uuid) from public, anon;
revoke all on function public._retencao(uuid) from public, anon, authenticated;
revoke all on function public.expurgo_executar(boolean) from public, anon;
revoke all on function public.expurgar_tentativas_antigas() from public, anon, authenticated;
grant execute on function public.anexo_abrir(uuid) to authenticated;
grant execute on function public.expurgo_executar(boolean) to authenticated;

insert into public.schema_versao (versao, nome) values (5, 'privacidade e retencao') on conflict (versao) do nothing;

-- Atualiza o cache da API do Supabase para reconhecer as novas funções/tabelas
notify pgrst, 'reload schema';
select versao, nome, aplicada_em from public.schema_versao order by versao;
