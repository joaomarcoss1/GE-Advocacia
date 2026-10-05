-- =====================================================================
-- 0006 · Delegação: tarefas, prazos, audiências e reuniões do escritório
--  * novo papel "coordenador" (delega e acompanha, sem acesso a folha/ponto/dados pessoais)
--  * tarefas com tipo jurídico (prazo, audiência, diligência...), número CNJ validado, andamentos
--  * funcionário vê e atualiza as suas tarefas pelo PIN (sem login)
--  * Google Agenda: tokens ficam em tabela SEM acesso pela API (só a Edge Function "google-agenda")
-- Idempotente. Toda tabela nova: escritorio_id + RLS por escritório + FKs compostas.
-- =====================================================================

-- ---------- Papel coordenador ----------
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('admin', 'gerente', 'coordenador'));

create or replace function public.eh_delegante() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(public.papel_atual() in ('admin', 'gerente', 'coordenador'), false)
$$;
revoke all on function public.eh_delegante() from public, anon;
grant execute on function public.eh_delegante() to authenticated;

create or replace function public.criar_usuario(p_email text, p_senha text, p_nome text, p_papel text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id uuid; v_email text; v_esc uuid := public.meu_escritorio();
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_papel not in ('admin', 'gerente', 'coordenador') then raise exception 'PAPEL_INVALIDO'; end if;
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
  if p_papel not in ('admin', 'gerente', 'coordenador') then raise exception 'PAPEL_INVALIDO'; end if;
  update public.perfis set nome = coalesce(nullif(trim(p_nome), ''), nome), papel = p_papel, ativo = p_ativo
   where id = p_id and escritorio_id = v_esc;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if public._admins_ativos(v_esc) < 1 then raise exception 'ULTIMO_ADMIN'; end if;   -- desfaz a transação
  return jsonb_build_object('ok', true);
end $$;

-- A equipe (sem salário/CPF/banco) também é visível para quem delega.
create or replace function public.equipe()
returns table (id uuid, nome text, cargo_id uuid, escala_id uuid, ativo boolean, data_admissao date,
               data_desligamento date, vinculo text, tem_pin boolean)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_delegante() then raise exception 'SEM_PERMISSAO'; end if;
  return query select f.id, f.nome, f.cargo_id, f.escala_id, f.ativo, f.data_admissao, f.data_desligamento, f.vinculo, f.tem_pin
                 from public.funcionarios f where f.escritorio_id = public.meu_escritorio() order by f.nome;
end $$;

create or replace function public._rotulo_registro(p_tabela text, p_row jsonb) returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select case p_tabela
    when 'registros_ponto' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'tipo', '') || ' ' || coalesce(p_row ->> 'data', '')
    when 'ajustes_dia' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'data', '')
    when 'ajustes_folha' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'tipo', '')
    when 'folhas' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'periodo_inicio', '')
    when 'ocorrencias' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'tipo', '')
    when 'anexos' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'nome', '')
    when 'tarefas' then coalesce(p_row ->> 'titulo', '')
    when 'configuracoes' then 'Configurações do escritório'
    else coalesce(p_row ->> 'nome', p_row ->> 'email', p_row ->> 'data', p_row ->> 'id', '')
  end
$$;

-- O escritório só pode ser excluído se estiver vazio; tarefas e conexões do Google saem junto.
create or replace function public.plataforma_excluir_escritorio(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare e public.escritorios;
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  select * into e from public.escritorios where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if exists (select 1 from public.funcionarios where escritorio_id = p_id) then raise exception 'ESCRITORIO_COM_DADOS'; end if;
  delete from auth.users where id in (select id from public.perfis where escritorio_id = p_id);
  delete from public.google_conexoes where escritorio_id = p_id;
  delete from public.tarefas where escritorio_id = p_id;
  delete from public.configuracoes where escritorio_id = p_id;
  delete from public.escalas where escritorio_id = p_id;
  delete from public.cargos where escritorio_id = p_id;
  delete from public.feriados where escritorio_id = p_id;
  delete from public.escritorios where id = p_id;
  perform public._plat_auditar('Escritório excluído', e.nome || ' (' || e.slug || ')', null);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Número de processo (CNJ) ----------
-- Formato NNNNNNN-DD.AAAA.J.TR.OOOO; o dígito verificador (mod 97) é conferido.
create or replace function public.cnj_normalizar(p text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); v numeric;
begin
  if length(d) <> 20 then return null; end if;
  v := (substr(d, 1, 7) || substr(d, 10, 4) || substr(d, 14, 3) || substr(d, 17, 4) || substr(d, 8, 2))::numeric;
  if v % 97 <> 1 then return null; end if;
  return substr(d, 1, 7) || '-' || substr(d, 8, 2) || '.' || substr(d, 10, 4) || '.' || substr(d, 14, 1) || '.' || substr(d, 15, 2) || '.' || substr(d, 17, 4);
end $$;

-- ---------- Tarefas ----------
create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  tipo text not null default 'tarefa' check (tipo in ('tarefa', 'prazo', 'audiencia', 'reuniao', 'diligencia', 'protocolo', 'atendimento')),
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  descricao text check (descricao is null or length(descricao) <= 4000),
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  status text not null default 'a_fazer' check (status in ('a_fazer', 'em_andamento', 'em_revisao', 'concluida', 'cancelada')),
  area text check (area is null or area in ('civel', 'trabalhista', 'tributario', 'criminal', 'familia', 'empresarial', 'previdenciario', 'administrativo', 'outro')),
  processo_numero text,
  cliente text check (cliente is null or length(cliente) <= 200),
  inicio timestamptz,
  fim timestamptz,
  dia_inteiro boolean not null default false,
  prazo_fatal boolean not null default false,
  lembrete_min int not null default 60 check (lembrete_min between 0 and 40320),
  local text check (local is null or length(local) <= 300),
  responsavel_id uuid,
  revisor_id uuid,
  participantes uuid[] not null default '{}',
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (escritorio_id, id),
  foreign key (escritorio_id, responsavel_id) references public.funcionarios (escritorio_id, id) on delete restrict,
  foreign key (escritorio_id, revisor_id) references public.funcionarios (escritorio_id, id) on delete restrict,
  check (fim is null or inicio is null or fim >= inicio),
  check (tipo = 'tarefa' or inicio is not null)
);
create index if not exists tarefas_esc_status_idx on public.tarefas (escritorio_id, status, inicio);
create index if not exists tarefas_resp_idx on public.tarefas (responsavel_id);
create index if not exists tarefas_processo_idx on public.tarefas (escritorio_id, processo_numero);

create table if not exists public.tarefa_andamentos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  tarefa_id uuid not null,
  tipo text not null default 'comentario' check (tipo in ('comentario', 'status', 'sistema')),
  texto text not null check (length(btrim(texto)) between 1 and 2000),
  autor_nome text not null,
  autor_usuario uuid,
  autor_funcionario uuid,
  created_at timestamptz not null default now(),
  foreign key (escritorio_id, tarefa_id) references public.tarefas (escritorio_id, id) on delete cascade
);
create index if not exists tarefa_andamentos_idx on public.tarefa_andamentos (tarefa_id, created_at);

-- Sincronização com o Google Agenda (escrita só pela Edge Function; leitura pela equipe que delega).
create table if not exists public.tarefa_google (
  tarefa_id uuid primary key,
  escritorio_id uuid not null references public.escritorios(id) on delete restrict,
  usuario_id uuid not null,
  calendario_id text not null default 'primary',
  event_id text,
  sync_em timestamptz,
  erro text,
  foreign key (escritorio_id, tarefa_id) references public.tarefas (escritorio_id, id) on delete cascade
);

-- Tokens do Google: RLS ligado, NENHUMA política, nenhum privilégio. Só a service_role (Edge Function) acessa.
create table if not exists public.google_conexoes (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  escritorio_id uuid not null references public.escritorios(id) on delete restrict,
  email_google text,
  calendario_id text not null default 'primary',
  refresh_token_enc text not null,
  created_at timestamptz not null default now()
);
alter table public.google_conexoes enable row level security;
revoke all on public.google_conexoes from anon, authenticated;

-- ---------- Regras de negócio (gatilhos) ----------
create or replace function public._trg_tarefa_regras() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare p uuid; n text;
begin
  new.titulo := btrim(new.titulo);
  if new.processo_numero is not null and btrim(new.processo_numero) <> '' then
    n := public.cnj_normalizar(new.processo_numero);
    if n is null then raise exception 'PROCESSO_INVALIDO'; end if;
    new.processo_numero := n;
  else new.processo_numero := null; end if;
  if new.dia_inteiro and new.inicio is not null and new.fim is null then new.fim := new.inicio; end if;
  if new.responsavel_id is not null and not exists (select 1 from public.funcionarios f where f.id = new.responsavel_id and f.escritorio_id = new.escritorio_id) then
    raise exception 'RESPONSAVEL_INVALIDO'; end if;
  foreach p in array coalesce(new.participantes, '{}') loop
    if not exists (select 1 from public.funcionarios f where f.id = p and f.escritorio_id = new.escritorio_id) then
      raise exception 'PARTICIPANTE_INVALIDO'; end if;
  end loop;
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
    new.criado_por_nome := coalesce(new.criado_por_nome, (select nome from public.perfis where id = auth.uid()));
  else
    new.updated_at := now();
    -- campos de autoria não mudam
    new.criado_por := old.criado_por; new.criado_por_nome := old.criado_por_nome;
  end if;
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then new.concluida_em := now();
  elsif new.status <> 'concluida' then new.concluida_em := null; end if;
  return new;
end $$;
drop trigger if exists trg_tarefa_regras on public.tarefas;
create trigger trg_tarefa_regras before insert or update on public.tarefas for each row execute function public._trg_tarefa_regras();

-- Mudanças de status e de responsável viram andamentos automáticos.
create or replace function public._trg_tarefa_andamento() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_nome text; v_rot text[] := array['a fazer', 'em andamento', 'em revisão', 'concluída', 'cancelada'];
        v_chv text[] := array['a_fazer', 'em_andamento', 'em_revisao', 'concluida', 'cancelada'];
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status and coalesce(current_setting('ge.sem_andamento', true), '') <> '1' then
    v_nome := coalesce((select nome from public.perfis where id = auth.uid()), 'Sistema');
    insert into public.tarefa_andamentos (escritorio_id, tarefa_id, tipo, texto, autor_nome, autor_usuario)
    values (new.escritorio_id, new.id, 'status',
            'Status: ' || v_rot[array_position(v_chv, old.status)] || ' → ' || v_rot[array_position(v_chv, new.status)], v_nome, auth.uid());
  elsif tg_op = 'UPDATE' and new.responsavel_id is distinct from old.responsavel_id then
    v_nome := coalesce((select nome from public.perfis where id = auth.uid()), 'Sistema');
    insert into public.tarefa_andamentos (escritorio_id, tarefa_id, tipo, texto, autor_nome, autor_usuario)
    values (new.escritorio_id, new.id, 'sistema',
            'Responsável: ' || coalesce((select nome from public.funcionarios where id = old.responsavel_id), 'ninguém') || ' → ' || coalesce((select nome from public.funcionarios where id = new.responsavel_id), 'ninguém'),
            v_nome, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_tarefa_andamento on public.tarefas;
create trigger trg_tarefa_andamento after update on public.tarefas for each row execute function public._trg_tarefa_andamento();

-- Andamentos não se alteram nem se apagam (somente a exclusão da própria tarefa leva junto).
create or replace function public._trg_andamento_imutavel() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then raise exception 'ANDAMENTO_IMUTAVEL'; end if;
  if tg_op = 'DELETE' and exists (select 1 from public.tarefas t where t.id = old.tarefa_id) then raise exception 'ANDAMENTO_IMUTAVEL'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_andamento_imutavel on public.tarefa_andamentos;
create trigger trg_andamento_imutavel before update or delete on public.tarefa_andamentos for each row execute function public._trg_andamento_imutavel();

-- ---------- RLS ----------
alter table public.tarefas enable row level security;
alter table public.tarefa_andamentos enable row level security;
alter table public.tarefa_google enable row level security;

drop trigger if exists trg_escritorio_imutavel on public.tarefas;
create trigger trg_escritorio_imutavel before update on public.tarefas for each row execute function public._trg_escritorio_imutavel();
drop trigger if exists trg_escritorio_imutavel on public.tarefa_andamentos;
create trigger trg_escritorio_imutavel before update on public.tarefa_andamentos for each row execute function public._trg_escritorio_imutavel();

drop policy if exists "tarefas le" on public.tarefas;
drop policy if exists "tarefas ins" on public.tarefas;
drop policy if exists "tarefas upd" on public.tarefas;
drop policy if exists "tarefas del" on public.tarefas;
-- Quem delega enxerga as tarefas do PRÓPRIO escritório.
create policy "tarefas le" on public.tarefas for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()));
create policy "tarefas ins" on public.tarefas for insert to authenticated
  with check (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()));
-- Administrador e gerência alteram qualquer tarefa; coordenador, somente as que ele mesmo criou.
create policy "tarefas upd" on public.tarefas for update to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and ((select public.eh_gestao()) or (select public.eh_delegante()) and criado_por = auth.uid()))
  with check (escritorio_id = (select public.meu_escritorio()) and ((select public.eh_gestao()) or (select public.eh_delegante()) and criado_por = auth.uid()));
create policy "tarefas del" on public.tarefas for delete to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and ((select public.eh_gestao()) or (select public.eh_delegante()) and criado_por = auth.uid()));

drop policy if exists "andamentos le" on public.tarefa_andamentos;
drop policy if exists "andamentos ins" on public.tarefa_andamentos;
create policy "andamentos le" on public.tarefa_andamentos for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()));
create policy "andamentos ins" on public.tarefa_andamentos for insert to authenticated
  with check (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante())
              and autor_usuario = auth.uid() and autor_funcionario is null);

drop policy if exists "tarefa_google le" on public.tarefa_google;
create policy "tarefa_google le" on public.tarefa_google for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()));
revoke insert, update, delete on public.tarefa_google from anon, authenticated;
revoke all on public.tarefa_google from anon;

select public._auditar_tabela('tarefas');

-- ---------- Google: estado da conexão do usuário logado ----------
create or replace function public.google_status() returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select case when public.eh_delegante() then
    coalesce((select jsonb_build_object('conectado', true, 'email', g.email_google, 'calendario', g.calendario_id)
                from public.google_conexoes g where g.usuario_id = auth.uid()), jsonb_build_object('conectado', false))
  else jsonb_build_object('conectado', false) end
$$;
create or replace function public.google_desconectar() returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_delegante() then raise exception 'SEM_PERMISSAO'; end if;
  delete from public.google_conexoes where usuario_id = auth.uid();
end $$;

-- ---------- Visão do funcionário (PIN) ----------
create or replace function public._tarefa_json(t public.tarefas, p_func uuid) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object('id', t.id, 'tipo', t.tipo, 'titulo', t.titulo, 'descricao', t.descricao, 'prioridade', t.prioridade,
    'status', t.status, 'area', t.area, 'processo_numero', t.processo_numero, 'cliente', t.cliente, 'inicio', t.inicio, 'fim', t.fim,
    'dia_inteiro', t.dia_inteiro, 'prazo_fatal', t.prazo_fatal, 'local', t.local, 'delegado_por', t.criado_por_nome,
    'papel', case when t.responsavel_id = p_func then 'responsavel' when t.revisor_id = p_func then 'revisor' else 'participante' end,
    'andamentos', coalesce((select jsonb_agg(jsonb_build_object('texto', a.texto, 'autor', a.autor_nome, 'em', a.created_at, 'tipo', a.tipo) order by a.created_at desc)
                              from (select * from public.tarefa_andamentos x where x.tarefa_id = t.id order by x.created_at desc limit 10) a), '[]'::jsonb))
$$;

create or replace function public.ponto_tarefas(p_func_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text; v_esc uuid;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  select escritorio_id into v_esc from public.funcionarios where id = p_func_id;
  return jsonb_build_object('ok', true, 'tarefas', coalesce((
    select jsonb_agg(public._tarefa_json(t, p_func_id) order by (t.status in ('concluida')), coalesce(t.inicio, t.created_at))
      from public.tarefas t
     where t.escritorio_id = v_esc and t.status <> 'cancelada'
       and (t.responsavel_id = p_func_id or t.revisor_id = p_func_id or p_func_id = any (t.participantes))
       and (t.status <> 'concluida' or t.concluida_em > now() - interval '14 days')), '[]'::jsonb));
end $$;

-- O funcionário responsável atualiza o andamento; revisor e participantes só consultam.
create or replace function public.ponto_tarefa_atualizar(p_func_id uuid, p_pin text, p_id uuid, p_status text, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text; t public.tarefas; v_nome text;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  if p_status not in ('a_fazer', 'em_andamento', 'em_revisao', 'concluida') then return public._erro('STATUS_INVALIDO'); end if;
  select * into t from public.tarefas
   where id = p_id and responsavel_id = p_func_id and escritorio_id = (select escritorio_id from public.funcionarios where id = p_func_id) and status <> 'cancelada';
  if not found then return public._erro('NAO_ENCONTRADO'); end if;
  select nome into v_nome from public.funcionarios where id = p_func_id;
  perform set_config('ge.sem_andamento', '1', true);
  update public.tarefas set status = p_status where id = p_id;
  perform set_config('ge.sem_andamento', '0', true);
  insert into public.tarefa_andamentos (escritorio_id, tarefa_id, tipo, texto, autor_nome, autor_funcionario)
  values (t.escritorio_id, t.id, 'status',
          'Status: ' || replace(t.status, '_', ' ') || ' → ' || replace(p_status, '_', ' ') || coalesce(' · ' || nullif(btrim(left(p_nota, 1500)), ''), ''),
          v_nome, p_func_id);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Permissões ----------
revoke all on function public._trg_tarefa_regras() from public, anon, authenticated;
revoke all on function public._trg_tarefa_andamento() from public, anon, authenticated;
revoke all on function public._trg_andamento_imutavel() from public, anon, authenticated;
revoke all on function public._tarefa_json(public.tarefas, uuid) from public, anon, authenticated;
revoke all on function public.cnj_normalizar(text) from public;
grant execute on function public.cnj_normalizar(text) to authenticated;
revoke all on function public.google_status() from public, anon;
revoke all on function public.google_desconectar() from public, anon;
grant execute on function public.google_status() to authenticated;
grant execute on function public.google_desconectar() to authenticated;
revoke all on function public.ponto_tarefas(uuid, text) from public;
revoke all on function public.ponto_tarefa_atualizar(uuid, text, uuid, text, text) from public;
grant execute on function public.ponto_tarefas(uuid, text) to anon, authenticated;
grant execute on function public.ponto_tarefa_atualizar(uuid, text, uuid, text, text) to anon, authenticated;
revoke all on function public.criar_usuario(text, text, text, text) from public, anon;
revoke all on function public.atualizar_usuario(uuid, text, text, boolean) from public, anon;
revoke all on function public.plataforma_excluir_escritorio(uuid) from public, anon;
revoke all on function public.equipe() from public, anon;
grant execute on function public.equipe() to authenticated;

insert into public.schema_versao (versao, nome) values (6, 'delegacao e agenda') on conflict (versao) do nothing;
