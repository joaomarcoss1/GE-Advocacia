-- =====================================================================
-- GE ADVOCACIA · 0013 · níveis de acesso, permissões e porta do ponto
--  * 8 níveis hierárquicos (sócio-administrador … colaborador) no lugar dos 3 anteriores
--  * permissões por nível (ajustáveis por escritório) + concessões/negações por pessoa
--  * login de funcionário: cada acesso pode ser ligado a um cadastro de funcionário
--  * porta do ponto: o acesso abre com a entrada e fecha com a saída; a gerência libera exceções
--  * hierarquia: ninguém cria, edita ou redefine a senha de quem tem nível igual ou maior
--  * trilha: registros de acesso (entrada, bloqueio por ponto, senha, liberações)
-- Quem já usa o sistema não perde nada: administrador, gerência e coordenação mantêm o que tinham.
-- Idempotente.
-- =====================================================================

-- ---------- Perfis: novos níveis e colunas ----------
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('admin', 'gerente', 'coordenador', 'advogado', 'financeiro', 'secretaria', 'estagiario', 'colaborador'));
alter table public.perfis add column if not exists funcionario_id uuid;
alter table public.perfis add column if not exists conceder text[] not null default '{}';
alter table public.perfis add column if not exists negar text[] not null default '{}';
alter table public.perfis add column if not exists exige_ponto boolean;
alter table public.perfis add column if not exists trocar_senha boolean not null default false;
alter table public.perfis add column if not exists ultimo_acesso timestamptz;
alter table public.perfis add column if not exists criado_por uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'perfis_funcionario_fk') then
    alter table public.perfis add constraint perfis_funcionario_fk
      foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete set null (funcionario_id);
  end if;
end $$;
create unique index if not exists perfis_funcionario_uq on public.perfis (funcionario_id) where funcionario_id is not null;

-- ---------- Política do escritório, permissões por nível, liberações e registros de acesso ----------
create table if not exists public.acesso_config (
  escritorio_id uuid primary key default public.meu_escritorio() references public.escritorios(id) on delete cascade,
  exigir_ponto boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.papeis_permissoes (
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete cascade,
  papel text not null check (papel in ('gerente', 'coordenador', 'advogado', 'financeiro', 'secretaria', 'estagiario', 'colaborador')),
  permissoes text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (escritorio_id, papel)
);
create table if not exists public.liberacoes_acesso (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  ate timestamptz not null,
  motivo text not null check (length(btrim(motivo)) between 3 and 300),
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists liberacoes_perfil_idx on public.liberacoes_acesso (perfil_id, ate desc);
-- Sem chave estrangeira de propósito (como a auditoria): o registro sobrevive à exclusão do acesso.
create table if not exists public.acessos_log (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null,
  perfil_id uuid,
  nome text not null,
  evento text not null check (evento in ('login', 'logout', 'bloqueado_ponto', 'acesso_encerrado', 'senha_trocada', 'acesso_criado', 'acesso_alterado',
                                         'senha_redefinida', 'acesso_removido', 'liberacao', 'permissoes_nivel', 'politica_ponto')),
  detalhe text not null default '' check (length(detalhe) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists acessos_log_esc_idx on public.acessos_log (escritorio_id, created_at desc);

alter table public.acesso_config enable row level security;
alter table public.papeis_permissoes enable row level security;
alter table public.liberacoes_acesso enable row level security;
alter table public.acessos_log enable row level security;
revoke all on public.acesso_config, public.papeis_permissoes, public.liberacoes_acesso, public.acessos_log from anon;
revoke insert, update, delete, truncate on public.acesso_config, public.papeis_permissoes, public.liberacoes_acesso, public.acessos_log from authenticated;

-- ---------- Catálogo de permissões (espelho de src/lib/permissoes.ts; o teste de paridade confere) ----------
create or replace function public._permissoes_catalogo() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['tarefas.ver', 'tarefas.criar', 'tarefas.delegar', 'tarefas.editar_todas', 'casos.acessar', 'processos.ver', 'processos.ver_todos', 'processos.sigilosos', 'processos.editar', 'processos.excluir', 'clientes.ver', 'clientes.editar', 'documentos.ver', 'documentos.enviar', 'documentos.excluir', 'intimacoes.ver', 'intimacoes.tratar', 'modelos.usar', 'modelos.editar', 'honorarios.ver', 'honorarios.editar', 'honorarios.parametros', 'equipe.ver', 'ponto.gerir', 'relatorios.ver', 'acessos.gerenciar', 'folha.ver', 'funcionarios.gerir', 'config.editar', 'auditoria.ver', 'backup.gerir']
$$;
create or replace function public._permissoes_reservadas() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['folha.ver', 'funcionarios.gerir', 'config.editar', 'auditoria.ver', 'backup.gerir']
$$;
create or replace function public._permissoes_implicacoes() returns table (origem text, destino text)
language sql immutable set search_path = public, pg_temp as $$
  values ('tarefas.delegar', 'tarefas.criar'),
         ('tarefas.delegar', 'equipe.ver'),
         ('tarefas.editar_todas', 'tarefas.ver'),
         ('tarefas.editar_todas', 'tarefas.criar'),
         ('processos.ver', 'casos.acessar'),
         ('processos.ver_todos', 'processos.ver'),
         ('processos.sigilosos', 'processos.ver_todos'),
         ('processos.editar', 'processos.ver'),
         ('processos.excluir', 'processos.editar'),
         ('clientes.ver', 'casos.acessar'),
         ('clientes.editar', 'clientes.ver'),
         ('documentos.ver', 'casos.acessar'),
         ('documentos.enviar', 'documentos.ver'),
         ('documentos.excluir', 'documentos.ver'),
         ('intimacoes.ver', 'casos.acessar'),
         ('intimacoes.tratar', 'intimacoes.ver'),
         ('modelos.usar', 'casos.acessar'),
         ('modelos.editar', 'modelos.usar'),
         ('honorarios.editar', 'honorarios.ver'),
         ('honorarios.parametros', 'honorarios.ver'),
         ('ponto.gerir', 'equipe.ver'),
         ('relatorios.ver', 'equipe.ver')
$$;
create or replace function public._permissoes_padrao(p_papel text) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select case p_papel
    when 'admin' then public._permissoes_catalogo()
    when 'gerente' then array['tarefas.ver', 'tarefas.criar', 'tarefas.delegar', 'tarefas.editar_todas', 'casos.acessar', 'processos.ver_todos', 'processos.sigilosos', 'processos.editar', 'processos.excluir', 'clientes.ver', 'clientes.editar', 'documentos.ver', 'documentos.enviar', 'documentos.excluir', 'intimacoes.ver', 'intimacoes.tratar', 'modelos.usar', 'modelos.editar', 'equipe.ver', 'ponto.gerir', 'relatorios.ver']
    when 'coordenador' then array['tarefas.ver', 'tarefas.criar', 'tarefas.delegar', 'casos.acessar', 'processos.ver_todos', 'processos.sigilosos', 'processos.editar', 'clientes.ver', 'clientes.editar', 'documentos.ver', 'documentos.enviar', 'intimacoes.ver', 'intimacoes.tratar', 'modelos.usar', 'equipe.ver']
    when 'advogado' then array['tarefas.ver', 'tarefas.criar', 'tarefas.delegar', 'casos.acessar', 'processos.ver', 'processos.editar', 'clientes.ver', 'clientes.editar', 'documentos.ver', 'documentos.enviar', 'intimacoes.ver', 'intimacoes.tratar', 'modelos.usar', 'equipe.ver', 'honorarios.ver', 'honorarios.editar']
    when 'financeiro' then array['casos.acessar', 'clientes.ver', 'tarefas.criar', 'honorarios.ver', 'honorarios.editar', 'honorarios.parametros']
    when 'secretaria' then array['tarefas.ver', 'tarefas.criar', 'casos.acessar', 'processos.ver_todos', 'processos.editar', 'clientes.ver', 'clientes.editar', 'documentos.ver', 'documentos.enviar', 'intimacoes.ver', 'modelos.usar', 'equipe.ver']
    when 'estagiario' then array['tarefas.criar', 'casos.acessar', 'processos.ver', 'clientes.ver', 'documentos.ver', 'documentos.enviar', 'intimacoes.ver', 'modelos.usar']
    when 'colaborador' then array[]::text[]
    else array[]::text[] end
$$;


create or replace function public._expandir_permissoes(p text[]) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  with recursive r(id) as (
    select unnest(coalesce(p, '{}'::text[]))
    union
    select i.destino from r join public._permissoes_implicacoes() i on i.origem = r.id
  )
  select coalesce(array_agg(distinct id order by id), '{}'::text[]) from r where id = any (public._permissoes_catalogo())
$$;

create or replace function public._nivel(p_papel text) returns int
language sql immutable set search_path = public, pg_temp as $$
  select case p_papel when 'admin' then 100 when 'gerente' then 80 when 'coordenador' then 60 when 'advogado' then 50
                      when 'financeiro' then 40 when 'secretaria' then 30 when 'estagiario' then 20 when 'colaborador' then 10 else 0 end
$$;
create or replace function public._papel_exige_ponto(p_papel text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_papel in ('advogado', 'financeiro', 'secretaria', 'estagiario', 'colaborador')
$$;

-- ---------- Quem é quem (agora com permissões) ----------
create or replace function public._perfil_atual() returns public.perfis
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select p.* from public.perfis p join public.escritorios e on e.id = p.escritorio_id where p.id = auth.uid() and p.ativo and e.ativo
$$;
create or replace function public.meu_funcionario() returns uuid
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select p.funcionario_id from public.perfis p join public.escritorios e on e.id = p.escritorio_id where p.id = auth.uid() and p.ativo and e.ativo
$$;

-- Permissões do usuário logado: (padrão do nível, ou o ajuste do escritório, + concedidas) − negadas. Reservadas só o administrador tem.
create or replace function public._permissoes_do(p public.perfis) returns text[]
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare base text[]; v text[];
begin
  if p.id is null then return '{}'; end if;
  if p.papel = 'admin' then return public._permissoes_catalogo(); end if;
  select pp.permissoes into base from public.papeis_permissoes pp where pp.escritorio_id = p.escritorio_id and pp.papel = p.papel;
  v := public._expandir_permissoes(coalesce(base, public._permissoes_padrao(p.papel)) || p.conceder);
  return array(select x from unnest(v) x where x <> all (public._permissoes_reservadas()) and x <> all (p.negar) order by x);
end $$;
create or replace function public.permissoes_efetivas() returns text[]
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select public._permissoes_do(public._perfil_atual())
$$;

-- Porta do ponto: o acesso abre com a entrada do dia e fecha com a saída.
create or replace function public._estado_de(p public.perfis) returns text
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare v_pol boolean; v_exige boolean; v_hoje date;
begin
  if p.id is null then return 'sem_acesso'; end if;
  if p.papel = 'admin' then return 'liberado'; end if;     -- o administrador nunca fica trancado para fora (precisa poder desfazer qualquer regra)
  v_pol := coalesce((select exigir_ponto from public.acesso_config where escritorio_id = p.escritorio_id), true);
  v_exige := coalesce(p.exige_ponto, public._papel_exige_ponto(p.papel));
  if not v_pol or not v_exige then return 'liberado'; end if;
  if exists (select 1 from public.liberacoes_acesso l where l.perfil_id = p.id and l.ate > now()) then return 'liberado'; end if;
  if p.funcionario_id is null then return 'aguardando_ponto'; end if;
  v_hoje := public._hoje(p.escritorio_id);
  if exists (select 1 from public.registros_ponto r where r.funcionario_id = p.funcionario_id and r.data = v_hoje and r.tipo = 'saida' and r.status_aprovacao <> 'rejeitado') then return 'encerrado'; end if;
  if exists (select 1 from public.registros_ponto r where r.funcionario_id = p.funcionario_id and r.data = v_hoje and r.tipo = 'entrada' and r.status_aprovacao <> 'rejeitado') then return 'liberado'; end if;
  return 'aguardando_ponto';
end $$;
create or replace function public.estado_acesso() returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select public._estado_de(public._perfil_atual())
$$;
create or replace function public.acesso_ok() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select public.estado_acesso() = 'liberado'
$$;

create or replace function public.tem_permissao(p text) returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(p = any (public.permissoes_efetivas()) and public.estado_acesso() = 'liberado', false)
$$;

-- Os apelidos antigos passam a seguir as permissões (o padrão de cada nível preserva o que havia).
create or replace function public.eh_gestao() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select public.tem_permissao('ponto.gerir')
$$;
create or replace function public.eh_delegante() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select public.tem_permissao('casos.acessar')
$$;

-- Processo delegado: o usuário é responsável, revisor ou participante de uma tarefa daquele processo.
create or replace function public.processo_delegado(p_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (
    select 1 from public.tarefas t, public.perfis p
     where p.id = auth.uid() and p.funcionario_id is not null and t.processo_id = p_id and t.escritorio_id = p.escritorio_id and t.status <> 'cancelada'
       and (t.responsavel_id = p.funcionario_id or t.revisor_id = p.funcionario_id or p.funcionario_id = any (t.participantes)))
$$;
-- O processo que o usuário pode ver (mesma regra da política de leitura da tabela).
create or replace function public.processo_visivel(p_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(public.tem_permissao('processos.ver') and exists (
    select 1 from public.processos x
     where x.id = p_id and x.escritorio_id = public.meu_escritorio()
       and (public.tem_permissao('processos.ver_todos') or x.responsavel_id = public.meu_funcionario() or x.criado_por = auth.uid() or public.processo_delegado(x.id))
       and (not x.sigiloso or public.tem_permissao('processos.sigilosos') or x.responsavel_id = public.meu_funcionario())), false)
$$;

-- ---------- Políticas por permissão (restritivas: somam-se às de escritório já existentes) ----------
-- processos: ver os seus / todos / sigilosos; editar; excluir
drop policy if exists "perm le" on public.processos;
create policy "perm le" on public.processos as restrictive for select to authenticated
  using ((select public.tem_permissao('processos.ver'))
         and ((select public.tem_permissao('processos.ver_todos')) or responsavel_id = (select public.meu_funcionario()) or criado_por = auth.uid() or public.processo_delegado(id))
         and (not sigiloso or (select public.tem_permissao('processos.sigilosos')) or responsavel_id = (select public.meu_funcionario())));
drop policy if exists "perm ins" on public.processos;
create policy "perm ins" on public.processos as restrictive for insert to authenticated with check ((select public.tem_permissao('processos.editar')));
drop policy if exists "perm upd" on public.processos;
create policy "perm upd" on public.processos as restrictive for update to authenticated
  using ((select public.tem_permissao('processos.editar'))) with check ((select public.tem_permissao('processos.editar')));
drop policy if exists "perm del" on public.processos;
create policy "perm del" on public.processos as restrictive for delete to authenticated using ((select public.tem_permissao('processos.excluir')));

-- andamentos: seguem o processo
drop policy if exists "perm le" on public.processo_movimentos;
create policy "perm le" on public.processo_movimentos as restrictive for select to authenticated using (public.processo_visivel(processo_id));
drop policy if exists "perm ins" on public.processo_movimentos;
create policy "perm ins" on public.processo_movimentos as restrictive for insert to authenticated
  with check (public.processo_visivel(processo_id) and (select public.tem_permissao('processos.editar')));
drop policy if exists "perm upd" on public.processo_movimentos;
create policy "perm upd" on public.processo_movimentos as restrictive for update to authenticated
  using (public.processo_visivel(processo_id)) with check (public.processo_visivel(processo_id));

-- clientes
drop policy if exists "perm le" on public.clientes;
create policy "perm le" on public.clientes as restrictive for select to authenticated using ((select public.tem_permissao('clientes.ver')));
drop policy if exists "perm ins" on public.clientes;
create policy "perm ins" on public.clientes as restrictive for insert to authenticated with check ((select public.tem_permissao('clientes.editar')));
drop policy if exists "perm upd" on public.clientes;
create policy "perm upd" on public.clientes as restrictive for update to authenticated
  using ((select public.tem_permissao('clientes.editar'))) with check ((select public.tem_permissao('clientes.editar')));

-- documentos e listas de documentos
drop policy if exists "perm le" on public.documentos;
create policy "perm le" on public.documentos as restrictive for select to authenticated
  using ((select public.tem_permissao('documentos.ver')) and (processo_id is null or public.processo_visivel(processo_id)));
drop policy if exists "perm upd" on public.documentos;
create policy "perm upd" on public.documentos as restrictive for update to authenticated
  using ((select public.tem_permissao('documentos.enviar'))) with check ((select public.tem_permissao('documentos.enviar')));
drop policy if exists "perm del" on public.documentos;
create policy "perm del" on public.documentos as restrictive for delete to authenticated using ((select public.tem_permissao('documentos.excluir')));
drop policy if exists "perm le" on public.documento_links;
create policy "perm le" on public.documento_links as restrictive for select to authenticated using ((select public.tem_permissao('documentos.enviar')));
drop policy if exists "perm le" on public.checklist_itens;
create policy "perm le" on public.checklist_itens as restrictive for select to authenticated
  using ((select public.tem_permissao('documentos.ver')) and (processo_id is null or public.processo_visivel(processo_id)));
drop policy if exists "perm ins" on public.checklist_itens;
create policy "perm ins" on public.checklist_itens as restrictive for insert to authenticated with check ((select public.tem_permissao('documentos.enviar')));
drop policy if exists "perm upd" on public.checklist_itens;
create policy "perm upd" on public.checklist_itens as restrictive for update to authenticated
  using ((select public.tem_permissao('documentos.enviar'))) with check ((select public.tem_permissao('documentos.enviar')));

-- intimações
drop policy if exists "perm le" on public.intimacoes;
create policy "perm le" on public.intimacoes as restrictive for select to authenticated using ((select public.tem_permissao('intimacoes.ver')));
drop policy if exists "perm upd" on public.intimacoes;
create policy "perm upd" on public.intimacoes as restrictive for update to authenticated
  using ((select public.tem_permissao('intimacoes.tratar'))) with check ((select public.tem_permissao('intimacoes.tratar')));
drop policy if exists "perm le" on public.intimacoes_sync;
create policy "perm le" on public.intimacoes_sync as restrictive for select to authenticated using ((select public.tem_permissao('intimacoes.ver')));

-- modelos de peças
drop policy if exists "perm le" on public.modelos_documentos;
create policy "perm le" on public.modelos_documentos as restrictive for select to authenticated using ((select public.tem_permissao('modelos.usar')));
drop policy if exists "perm esc" on public.modelos_documentos;
create policy "perm esc" on public.modelos_documentos as restrictive for insert to authenticated with check ((select public.tem_permissao('modelos.editar')));
drop policy if exists "perm esc upd" on public.modelos_documentos;
create policy "perm esc upd" on public.modelos_documentos as restrictive for update to authenticated
  using ((select public.tem_permissao('modelos.editar'))) with check ((select public.tem_permissao('modelos.editar')));
drop policy if exists "perm esc del" on public.modelos_documentos;
create policy "perm esc del" on public.modelos_documentos as restrictive for delete to authenticated using ((select public.tem_permissao('modelos.editar')));

-- honorários: quem tem permissão (não só o administrador)
drop policy if exists "admin esc" on public.honorarios_propostas;
drop policy if exists "perm esc" on public.honorarios_propostas;
drop policy if exists "perm le" on public.honorarios_propostas;
drop policy if exists "perm ins" on public.honorarios_propostas;
drop policy if exists "perm upd" on public.honorarios_propostas;
drop policy if exists "perm del" on public.honorarios_propostas;
create policy "perm le" on public.honorarios_propostas for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.tem_permissao('honorarios.ver')));
create policy "perm ins" on public.honorarios_propostas for insert to authenticated
  with check (escritorio_id = (select public.meu_escritorio()) and (select public.tem_permissao('honorarios.editar')));
create policy "perm upd" on public.honorarios_propostas for update to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.tem_permissao('honorarios.editar')))
  with check (escritorio_id = (select public.meu_escritorio()) and (select public.tem_permissao('honorarios.editar')));
create policy "perm del" on public.honorarios_propostas for delete to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.tem_permissao('honorarios.editar')));
drop policy if exists "admin esc" on public.honorarios_parametros;
drop policy if exists "perm le" on public.honorarios_parametros;
create policy "perm le" on public.honorarios_parametros for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.tem_permissao('honorarios.ver')));
drop policy if exists "perm esc" on public.honorarios_parametros;
create policy "perm esc" on public.honorarios_parametros for all to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.tem_permissao('honorarios.parametros')))
  with check (escritorio_id = (select public.meu_escritorio()) and (select public.tem_permissao('honorarios.parametros')));

-- ---------- Funções que passam a conferir a permissão específica ----------
create or replace function public.equipe()
returns table (id uuid, nome text, cargo_id uuid, escala_id uuid, ativo boolean, data_admissao date,
               data_desligamento date, vinculo text, tem_pin boolean)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.tem_permissao('equipe.ver') then raise exception 'SEM_PERMISSAO'; end if;
  return query select f.id, f.nome, f.cargo_id, f.escala_id, f.ativo, f.data_admissao, f.data_desligamento, f.vinculo, f.tem_pin
                 from public.funcionarios f where f.escritorio_id = public.meu_escritorio() order by f.nome;
end $$;

create or replace function public.checklist_aplicar(p_modelo uuid, p_processo uuid default null, p_cliente uuid default null) returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare m public.checklist_modelos; v_esc uuid := public.meu_escritorio(); v_cli uuid := p_cliente; i jsonb; n int := 0; ord int;
begin
  if not public.tem_permissao('documentos.enviar') then raise exception 'SEM_PERMISSAO'; end if;
  select * into m from public.checklist_modelos where id = p_modelo and escritorio_id = v_esc;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if p_processo is not null then
    select cliente_id into v_cli from public.processos where id = p_processo and escritorio_id = v_esc and public.processo_visivel(id);
    if not found then raise exception 'NAO_ENCONTRADO'; end if;
  elsif p_cliente is null or not exists (select 1 from public.clientes where id = p_cliente and escritorio_id = v_esc) then raise exception 'NAO_ENCONTRADO'; end if;
  select coalesce(max(ordem), 0) into ord from public.checklist_itens
   where escritorio_id = v_esc and (processo_id is not distinct from p_processo) and (p_processo is not null or cliente_id = p_cliente);
  for i in select * from jsonb_array_elements(m.itens) loop
    if exists (select 1 from public.checklist_itens x where x.escritorio_id = v_esc and lower(x.nome) = lower(i ->> 'nome')
                and (x.processo_id is not distinct from p_processo) and (p_processo is not null or x.cliente_id = p_cliente)) then continue; end if;
    ord := ord + 1;
    insert into public.checklist_itens (escritorio_id, cliente_id, processo_id, nome, obrigatorio, ordem)
    values (v_esc, v_cli, p_processo, i ->> 'nome', coalesce((i ->> 'obrigatorio')::boolean, true), ord);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.link_criar(p_cliente uuid, p_processo uuid default null, p_dias int default 14, p_rotulo text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_esc uuid := public.meu_escritorio(); v_token text; v_id uuid;
begin
  if not public.tem_permissao('documentos.enviar') then raise exception 'SEM_PERMISSAO'; end if;
  if not exists (select 1 from public.clientes where id = p_cliente and escritorio_id = v_esc) then raise exception 'NAO_ENCONTRADO'; end if;
  if p_processo is not null and not exists (select 1 from public.processos where id = p_processo and escritorio_id = v_esc and cliente_id = p_cliente and public.processo_visivel(id)) then raise exception 'NAO_ENCONTRADO'; end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.documento_links (escritorio_id, cliente_id, processo_id, token_hash, rotulo, expira_em)
  values (v_esc, p_cliente, p_processo, encode(digest(v_token, 'sha256'), 'hex'), left(p_rotulo, 120), now() + make_interval(days => greatest(least(coalesce(p_dias, 14), 60), 1)))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'token', v_token, 'expira_em', (select expira_em from public.documento_links where id = v_id));
end $$;

create or replace function public.link_revogar(p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.tem_permissao('documentos.enviar') then raise exception 'SEM_PERMISSAO'; end if;
  update public.documento_links set ativo = false where id = p_id and escritorio_id = public.meu_escritorio();
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
end $$;

create or replace function public.documento_abrir(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare d public.documentos; v_nome text;
begin
  if not public.tem_permissao('documentos.ver') then raise exception 'SEM_PERMISSAO'; end if;
  select * into d from public.documentos where id = p_id and escritorio_id = public.meu_escritorio();
  if not found or d.storage_path is null then raise exception 'NAO_ENCONTRADO'; end if;
  if d.processo_id is not null and not public.processo_visivel(d.processo_id) then raise exception 'NAO_ENCONTRADO'; end if;
  select nome || ' <' || email || '>' into v_nome from public.perfis where id = auth.uid();
  insert into public.documentos_acessos (escritorio_id, documento_id, usuario_id, usuario, acao) values (d.escritorio_id, d.id, auth.uid(), coalesce(v_nome, '?'), 'abrir');
  return jsonb_build_object('ok', true, 'storage_path', d.storage_path, 'nome', d.nome, 'mime', d.mime);
end $$;

create or replace function public.documentos_resumo() returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select case when public.tem_permissao('documentos.ver') then jsonb_build_object(
    'total', (select count(*) from public.documentos where escritorio_id = public.meu_escritorio()),
    'sem_conferir', (select count(*) from public.documentos where escritorio_id = public.meu_escritorio() and not conferido),
    'drive_pendente', (select count(*) from public.documentos where escritorio_id = public.meu_escritorio() and drive_status in ('pendente', 'erro')))
  else '{}'::jsonb end
$$;

-- ---------- Tarefas: cada um vê as suas; "ver todas", criar e delegar dependem de permissão ----------
drop policy if exists "tarefas le" on public.tarefas;
drop policy if exists "tarefas ins" on public.tarefas;
drop policy if exists "tarefas upd" on public.tarefas;
drop policy if exists "tarefas del" on public.tarefas;
create policy "tarefas le" on public.tarefas for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.acesso_ok())
         and ((select public.tem_permissao('tarefas.ver')) or criado_por = auth.uid()
              or responsavel_id = (select public.meu_funcionario()) or revisor_id = (select public.meu_funcionario())
              or (select public.meu_funcionario()) = any (participantes)));
-- Delegar (responsável, revisor ou participantes que não sejam a própria pessoa) exige a permissão de delegar.
create policy "tarefas ins" on public.tarefas for insert to authenticated
  with check (escritorio_id = (select public.meu_escritorio()) and (select public.tem_permissao('tarefas.criar'))
              and ((select public.tem_permissao('tarefas.delegar'))
                   or ((responsavel_id is null or responsavel_id = (select public.meu_funcionario())) and revisor_id is null and participantes = '{}')));
create policy "tarefas upd" on public.tarefas for update to authenticated
  using (escritorio_id = (select public.meu_escritorio())
         and ((select public.tem_permissao('tarefas.editar_todas')) or (criado_por = auth.uid() and (select public.tem_permissao('tarefas.criar')))))
  with check (escritorio_id = (select public.meu_escritorio())
              and ((select public.tem_permissao('tarefas.editar_todas')) or (criado_por = auth.uid() and (select public.tem_permissao('tarefas.criar'))))
              and ((select public.tem_permissao('tarefas.delegar'))
                   or ((responsavel_id is null or responsavel_id = (select public.meu_funcionario())) and revisor_id is null and participantes = '{}')));
create policy "tarefas del" on public.tarefas for delete to authenticated
  using (escritorio_id = (select public.meu_escritorio())
         and ((select public.tem_permissao('tarefas.editar_todas')) or (criado_por = auth.uid() and (select public.tem_permissao('tarefas.criar')))));

drop policy if exists "andamentos le" on public.tarefa_andamentos;
drop policy if exists "andamentos ins" on public.tarefa_andamentos;
create policy "andamentos le" on public.tarefa_andamentos for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and exists (select 1 from public.tarefas t where t.id = tarefa_id));
create policy "andamentos ins" on public.tarefa_andamentos for insert to authenticated
  with check (escritorio_id = (select public.meu_escritorio()) and autor_usuario = auth.uid() and autor_funcionario is null
              and exists (select 1 from public.tarefas t where t.id = tarefa_id));

-- ---------- Visão do funcionário logado (sem PIN): suas tarefas e o seu dia ----------
create or replace function public.minhas_tarefas() returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_func uuid := public.meu_funcionario(); v_esc uuid := public.meu_escritorio();
begin
  if v_esc is null or not public.acesso_ok() then raise exception 'SEM_PERMISSAO'; end if;
  if v_func is null then return jsonb_build_object('ok', true, 'tarefas', '[]'::jsonb); end if;
  return jsonb_build_object('ok', true, 'tarefas', coalesce((
    select jsonb_agg(public._tarefa_json(t, v_func) order by (t.status in ('concluida')), coalesce(t.inicio, t.created_at))
      from public.tarefas t
     where t.escritorio_id = v_esc and t.status <> 'cancelada'
       and (t.responsavel_id = v_func or t.revisor_id = v_func or v_func = any (t.participantes))
       and (t.status <> 'concluida' or t.concluida_em > now() - interval '14 days')), '[]'::jsonb));
end $$;

create or replace function public.minha_tarefa_atualizar(p_id uuid, p_status text, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_func uuid := public.meu_funcionario(); t public.tarefas; v_nome text;
begin
  if public.meu_escritorio() is null or not public.acesso_ok() then raise exception 'SEM_PERMISSAO'; end if;
  if v_func is null then return public._erro('NAO_ENCONTRADO'); end if;
  if p_status not in ('a_fazer', 'em_andamento', 'em_revisao', 'concluida') then return public._erro('STATUS_INVALIDO'); end if;
  select * into t from public.tarefas where id = p_id and responsavel_id = v_func and escritorio_id = public.meu_escritorio() and status <> 'cancelada';
  if not found then return public._erro('NAO_ENCONTRADO'); end if;
  select nome into v_nome from public.funcionarios where id = v_func;
  perform set_config('ge.sem_andamento', '1', true);
  update public.tarefas set status = p_status where id = p_id;
  perform set_config('ge.sem_andamento', '0', true);
  insert into public.tarefa_andamentos (escritorio_id, tarefa_id, tipo, texto, autor_nome, autor_funcionario)
  values (t.escritorio_id, t.id, 'status',
          'Status: ' || replace(t.status, '_', ' ') || ' → ' || replace(p_status, '_', ' ') || coalesce(' · ' || nullif(btrim(left(p_nota, 1500)), ''), ''),
          v_nome, v_func);
  return jsonb_build_object('ok', true);
end $$;

-- O dia de ponto de quem está logado (para o "Meu espaço"; funciona mesmo com o acesso aguardando o ponto).
create or replace function public.meu_ponto_hoje() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare p public.perfis := public._perfil_atual();
begin
  if p.id is null then raise exception 'SEM_PERMISSAO'; end if;
  return jsonb_build_object('ok', true, 'funcionario_id', p.funcionario_id, 'estado', public._estado_de(p), 'marcacoes', coalesce((
    select jsonb_agg(jsonb_build_object('tipo', r.tipo, 'horario', r.horario_real, 'status_aprovacao', r.status_aprovacao) order by r.horario_real)
      from public.registros_ponto r where r.funcionario_id = p.funcionario_id and r.data = public._hoje(p.escritorio_id) and r.status_aprovacao <> 'rejeitado'), '[]'::jsonb));
end $$;

-- ---------- Registros de acesso ----------
create or replace function public._log_acesso(p_esc uuid, p_perfil uuid, p_nome text, p_evento text, p_detalhe text default '') returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.acessos_log (escritorio_id, perfil_id, nome, evento, detalhe) values (p_esc, p_perfil, coalesce(nullif(btrim(p_nome), ''), '?'), p_evento, left(coalesce(p_detalhe, ''), 500))
$$;

create or replace function public.registrar_evento_acesso(p_evento text, p_detalhe text default null) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare p public.perfis := public._perfil_atual();
begin
  if p.id is null then return; end if;
  if p_evento not in ('login', 'logout', 'bloqueado_ponto', 'acesso_encerrado') then raise exception 'EVENTO_INVALIDO'; end if;
  if p_evento = 'login' then update public.perfis set ultimo_acesso = now() where id = p.id; end if;
  -- o mesmo evento não se repete em menos de 10 minutos (o painel confere o estado de tempos em tempos)
  if exists (select 1 from public.acessos_log l where l.perfil_id = p.id and l.evento = p_evento and l.created_at > now() - interval '10 minutes') then return; end if;
  perform public._log_acesso(p.escritorio_id, p.id, p.nome, p_evento, coalesce(p_detalhe, ''));
end $$;

create or replace function public.senha_trocada() returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare p public.perfis := public._perfil_atual();
begin
  if p.id is null then raise exception 'SEM_PERMISSAO'; end if;
  update public.perfis set trocar_senha = false where id = p.id;
  perform public._log_acesso(p.escritorio_id, p.id, p.nome, 'senha_trocada', '');
end $$;

drop policy if exists "admin le acessos" on public.acessos_log;
create policy "admin le acessos" on public.acessos_log for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_admin()));
drop policy if exists "politica le" on public.acesso_config;
create policy "politica le" on public.acesso_config for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_admin()));
drop policy if exists "liberacoes le" on public.liberacoes_acesso;
create policy "liberacoes le" on public.liberacoes_acesso for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and ((select public.tem_permissao('ponto.gerir')) or (select public.tem_permissao('acessos.gerenciar'))));
drop policy if exists "papeis le" on public.papeis_permissoes;
create policy "papeis le" on public.papeis_permissoes for select to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and ((select public.tem_permissao('acessos.gerenciar')) or (select public.tem_permissao('ponto.gerir'))));

-- ---------- Sessão: nível, permissões, estado do acesso ----------
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
      'nivel', public._nivel(p.papel), 'permissoes', to_jsonb(public._permissoes_do(p)), 'acesso', public._estado_de(p),
      'funcionario_id', p.funcionario_id, 'trocar_senha', p.trocar_senha,
      'liberado_ate', (select max(l.ate) from public.liberacoes_acesso l where l.perfil_id = p.id and l.ate > now()),
      'escritorio', jsonb_build_object('id', e.id, 'nome', e.nome, 'slug', e.slug, 'fuso', e.fuso));
  end if;
  select * into a from public.plataforma_admins where id = auth.uid() and ativo;
  if found then
    return jsonb_build_object('ok', true, 'tipo', 'plataforma', 'id', a.id, 'nome', a.nome, 'email', a.email, 'papel', 'plataforma');
  end if;
  return public._erro('SEM_PERFIL');
end $$;

-- ---------- Acessos: criar, alterar, redefinir senha, remover (com hierarquia) ----------
create or replace function public._conferir_permissoes_dadas(p_ator public.perfis, p_perms text[], p_dar boolean) returns void
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare x text; v_do_ator text[] := public._permissoes_do(p_ator);
begin
  foreach x in array coalesce(p_perms, '{}') loop
    if not (x = any (public._permissoes_catalogo())) then raise exception 'PERMISSAO_INVALIDA'; end if;
    if p_dar and (x = any (public._permissoes_reservadas()) or (p_ator.papel <> 'admin' and not (x = any (v_do_ator)))) then raise exception 'PERMISSAO_ACIMA_DA_SUA'; end if;
  end loop;
end $$;

create or replace function public.criar_acesso(p_email text, p_senha text, p_nome text, p_papel text, p_funcionario uuid default null,
    p_conceder text[] default '{}', p_negar text[] default '{}', p_exige_ponto boolean default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.perfis := public._perfil_atual(); v_id uuid; v_email text; v_esc uuid := public.meu_escritorio(); v_pol boolean; v_exige boolean;
begin
  if a.id is null or not public.tem_permissao('acessos.gerenciar') then raise exception 'SEM_PERMISSAO'; end if;
  if p_papel not in ('admin', 'gerente', 'coordenador', 'advogado', 'financeiro', 'secretaria', 'estagiario', 'colaborador') then raise exception 'PAPEL_INVALIDO'; end if;
  if a.papel <> 'admin' and public._nivel(p_papel) >= public._nivel(a.papel) then raise exception 'NIVEL_ACIMA_DO_SEU'; end if;
  perform public._conferir_permissoes_dadas(a, p_conceder, true);
  perform public._conferir_permissoes_dadas(a, p_negar, false);
  if p_funcionario is not null then
    if not exists (select 1 from public.funcionarios f where f.id = p_funcionario and f.escritorio_id = v_esc and f.ativo) then raise exception 'FUNCIONARIO_INVALIDO'; end if;
    if exists (select 1 from public.perfis x where x.funcionario_id = p_funcionario) then raise exception 'FUNCIONARIO_JA_TEM_ACESSO'; end if;
  end if;
  v_pol := coalesce((select exigir_ponto from public.acesso_config where escritorio_id = v_esc), true);
  v_exige := coalesce(p_exige_ponto, public._papel_exige_ponto(p_papel));
  if v_pol and v_exige and p_funcionario is null then raise exception 'FUNCIONARIO_OBRIGATORIO'; end if;
  v_email := public._validar_acesso(p_email, p_senha, p_nome);
  v_id := public._criar_auth_user(v_email, p_senha);
  insert into public.perfis (id, escritorio_id, nome, email, papel, funcionario_id, conceder, negar, exige_ponto, trocar_senha, criado_por)
  values (v_id, v_esc, trim(p_nome), v_email, p_papel, p_funcionario, coalesce(p_conceder, '{}'), coalesce(p_negar, '{}'), p_exige_ponto, true, auth.uid());
  perform public._log_acesso(v_esc, v_id, trim(p_nome), 'acesso_criado', v_email || ' · ' || p_papel);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.atualizar_acesso(p_id uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.perfis := public._perfil_atual(); t public.perfis; v_esc uuid := public.meu_escritorio();
        v_papel text; v_func uuid; v_conceder text[]; v_negar text[]; v_exige boolean;
begin
  if a.id is null or not public.tem_permissao('acessos.gerenciar') then raise exception 'SEM_PERMISSAO'; end if;
  select * into t from public.perfis where id = p_id and escritorio_id = v_esc;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if t.id = a.id then
    if a.papel <> 'admin' then raise exception 'NAO_ALTERAR_A_SI'; end if;
  elsif a.papel <> 'admin' and public._nivel(t.papel) >= public._nivel(a.papel) then raise exception 'NIVEL_ACIMA_DO_SEU';
  end if;
  v_papel := coalesce(p_dados ->> 'papel', t.papel);
  if v_papel not in ('admin', 'gerente', 'coordenador', 'advogado', 'financeiro', 'secretaria', 'estagiario', 'colaborador') then raise exception 'PAPEL_INVALIDO'; end if;
  if a.papel <> 'admin' and public._nivel(v_papel) >= public._nivel(a.papel) then raise exception 'NIVEL_ACIMA_DO_SEU'; end if;
  if p_dados ? 'conceder' then
    v_conceder := array(select jsonb_array_elements_text(p_dados -> 'conceder'));
    perform public._conferir_permissoes_dadas(a, v_conceder, true);
  end if;
  if p_dados ? 'negar' then
    v_negar := array(select jsonb_array_elements_text(p_dados -> 'negar'));
    perform public._conferir_permissoes_dadas(a, v_negar, false);
  end if;
  if p_dados ? 'funcionario_id' then
    v_func := nullif(p_dados ->> 'funcionario_id', '')::uuid;
    if v_func is not null then
      if not exists (select 1 from public.funcionarios f where f.id = v_func and f.escritorio_id = v_esc and f.ativo) then raise exception 'FUNCIONARIO_INVALIDO'; end if;
      if exists (select 1 from public.perfis x where x.funcionario_id = v_func and x.id <> p_id) then raise exception 'FUNCIONARIO_JA_TEM_ACESSO'; end if;
    end if;
  end if;
  update public.perfis set
    nome = coalesce(nullif(trim(p_dados ->> 'nome'), ''), nome),
    papel = v_papel,
    ativo = coalesce((p_dados ->> 'ativo')::boolean, ativo),
    funcionario_id = case when p_dados ? 'funcionario_id' then v_func else funcionario_id end,
    conceder = coalesce(v_conceder, conceder),
    negar = coalesce(v_negar, negar),
    exige_ponto = case when p_dados ? 'exige_ponto' then (p_dados ->> 'exige_ponto')::boolean else exige_ponto end
   where id = p_id;
  if public._admins_ativos(v_esc) < 1 then raise exception 'ULTIMO_ADMIN'; end if;   -- desfaz a transação
  perform public._log_acesso(v_esc, p_id, t.nome, 'acesso_alterado', t.email || ' · ' || v_papel || case when (p_dados ->> 'ativo') = 'false' then ' (inativo)' else '' end);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.atualizar_usuario(p_id uuid, p_nome text, p_papel text, p_ativo boolean) returns jsonb
language sql security definer set search_path = public, extensions, pg_temp as $$
  select public.atualizar_acesso(p_id, jsonb_build_object('nome', p_nome, 'papel', p_papel, 'ativo', p_ativo))
$$;
create or replace function public.criar_usuario(p_email text, p_senha text, p_nome text, p_papel text) returns jsonb
language sql security definer set search_path = public, extensions, pg_temp as $$
  select public.criar_acesso(p_email, p_senha, p_nome, p_papel)
$$;

create or replace function public.redefinir_senha_usuario(p_id uuid, p_senha text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.perfis := public._perfil_atual(); t public.perfis;
begin
  if a.id is null or not public.tem_permissao('acessos.gerenciar') then raise exception 'SEM_PERMISSAO'; end if;
  if length(coalesce(p_senha, '')) < 10 then raise exception 'SENHA_CURTA'; end if;
  if p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then raise exception 'SENHA_FRACA'; end if;
  select * into t from public.perfis where id = p_id and escritorio_id = a.escritorio_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if t.id <> a.id and a.papel <> 'admin' and public._nivel(t.papel) >= public._nivel(a.papel) then raise exception 'NIVEL_ACIMA_DO_SEU'; end if;
  if t.id = a.id and a.papel <> 'admin' then raise exception 'NAO_ALTERAR_A_SI'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now() where id = p_id;
  update public.perfis set trocar_senha = (p_id <> auth.uid()) where id = p_id;
  insert into public.auditoria (escritorio_id, usuario, usuario_id, acao, detalhe)
  values (a.escritorio_id, public._nome_logado(), auth.uid(), 'Senha redefinida', t.email);
  perform public._log_acesso(a.escritorio_id, p_id, t.nome, 'senha_redefinida', t.email);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.remover_usuario(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.perfis := public._perfil_atual(); t public.perfis; v_esc uuid := public.meu_escritorio();
begin
  if a.id is null or not public.tem_permissao('acessos.gerenciar') then raise exception 'SEM_PERMISSAO'; end if;
  if p_id = auth.uid() then raise exception 'NAO_REMOVER_A_SI'; end if;
  select * into t from public.perfis where id = p_id and escritorio_id = v_esc;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if a.papel <> 'admin' and public._nivel(t.papel) >= public._nivel(a.papel) then raise exception 'NIVEL_ACIMA_DO_SEU'; end if;
  delete from auth.users where id = p_id;      -- o perfil sai por cascata
  if public._admins_ativos(v_esc) < 1 then raise exception 'ULTIMO_ADMIN'; end if;
  insert into public.auditoria (escritorio_id, usuario, usuario_id, acao, detalhe)
  values (v_esc, public._nome_logado(), auth.uid(), 'Acesso removido', t.email);
  perform public._log_acesso(v_esc, null, t.nome, 'acesso_removido', t.email);
  return jsonb_build_object('ok', true);
end $$;

-- Lista para a tela de acessos: quem o usuário pode gerenciar vem com pode_gerir = true.
create or replace function public.acessos_lista()
returns table (id uuid, nome text, email text, papel text, ativo boolean, funcionario_id uuid, funcionario_nome text, conceder text[], negar text[],
               exige_ponto boolean, exige_ponto_efetivo boolean, estado text, ultimo_acesso timestamptz, trocar_senha boolean, pode_gerir boolean, pode_liberar boolean)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare a public.perfis := public._perfil_atual(); v_gere boolean := public.tem_permissao('acessos.gerenciar'); v_libera boolean := public.tem_permissao('ponto.gerir');
begin
  -- quem gerencia acessos e quem gerencia o ponto (a gerência libera acessos fora do horário) enxergam a lista
  if a.id is null or not (v_gere or v_libera) then raise exception 'SEM_PERMISSAO'; end if;
  return query
    select p.id, p.nome, p.email, p.papel, p.ativo, p.funcionario_id, f.nome, p.conceder, p.negar, p.exige_ponto,
           coalesce(p.exige_ponto, public._papel_exige_ponto(p.papel)), public._estado_de(p), p.ultimo_acesso, p.trocar_senha,
           v_gere and ((p.id = a.id and a.papel = 'admin') or (p.id <> a.id and (a.papel = 'admin' or public._nivel(p.papel) < public._nivel(a.papel)))),
           v_libera and p.id <> a.id and (a.papel = 'admin' or public._nivel(p.papel) < public._nivel(a.papel))
      from public.perfis p left join public.funcionarios f on f.id = p.funcionario_id and f.escritorio_id = p.escritorio_id
     where p.escritorio_id = a.escritorio_id
     order by public._nivel(p.papel) desc, p.nome;
end $$;

-- ---------- Política do escritório e permissões por nível ----------
create or replace function public.acesso_politica() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not (public.tem_permissao('acessos.gerenciar') or public.tem_permissao('ponto.gerir')) then raise exception 'SEM_PERMISSAO'; end if;
  return jsonb_build_object('exigir_ponto', coalesce((select exigir_ponto from public.acesso_config where escritorio_id = public.meu_escritorio()), true),
    'papeis', (select jsonb_object_agg(r.papel, jsonb_build_object('permissoes', to_jsonb(coalesce(pp.permissoes, public._permissoes_padrao(r.papel))), 'personalizado', pp.papel is not null))
                 from (values ('gerente'), ('coordenador'), ('advogado'), ('financeiro'), ('secretaria'), ('estagiario'), ('colaborador')) r (papel)
                 left join public.papeis_permissoes pp on pp.escritorio_id = public.meu_escritorio() and pp.papel = r.papel));
end $$;

create or replace function public.definir_exigir_ponto(p_valor boolean) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.perfis := public._perfil_atual();
begin
  if a.id is null or not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  insert into public.acesso_config (escritorio_id, exigir_ponto) values (a.escritorio_id, coalesce(p_valor, true))
  on conflict (escritorio_id) do update set exigir_ponto = excluded.exigir_ponto, updated_at = now();
  perform public._log_acesso(a.escritorio_id, a.id, a.nome, 'politica_ponto', case when coalesce(p_valor, true) then 'acesso só depois do ponto' else 'acesso sem exigir ponto' end);
end $$;

create or replace function public.definir_permissoes_papel(p_papel text, p_permissoes text[]) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.perfis := public._perfil_atual(); x text; v text[] := '{}';
begin
  if a.id is null or not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_papel not in ('gerente', 'coordenador', 'advogado', 'financeiro', 'secretaria', 'estagiario', 'colaborador') then raise exception 'PAPEL_INVALIDO'; end if;
  foreach x in array coalesce(p_permissoes, '{}') loop
    if not (x = any (public._permissoes_catalogo())) then raise exception 'PERMISSAO_INVALIDA'; end if;
    if x = any (public._permissoes_reservadas()) then raise exception 'PERMISSAO_RESERVADA'; end if;
    v := v || x;
  end loop;
  insert into public.papeis_permissoes (escritorio_id, papel, permissoes) values (a.escritorio_id, p_papel, v)
  on conflict (escritorio_id, papel) do update set permissoes = excluded.permissoes, updated_at = now();
  perform public._log_acesso(a.escritorio_id, a.id, a.nome, 'permissoes_nivel', p_papel || ': ' || cardinality(v) || ' permissões');
end $$;

create or replace function public.restaurar_permissoes_papel(p_papel text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.perfis := public._perfil_atual();
begin
  if a.id is null or not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  delete from public.papeis_permissoes where escritorio_id = a.escritorio_id and papel = p_papel;
  perform public._log_acesso(a.escritorio_id, a.id, a.nome, 'permissoes_nivel', p_papel || ': padrão restaurado');
end $$;

-- ---------- Liberação de acesso fora do ponto (audiência externa, plantão, hora extra) ----------
create or replace function public.liberar_acesso(p_perfil uuid, p_minutos int, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.perfis := public._perfil_atual(); t public.perfis; v_ate timestamptz;
begin
  if a.id is null or not public.tem_permissao('ponto.gerir') then raise exception 'SEM_PERMISSAO'; end if;
  select * into t from public.perfis where id = p_perfil and escritorio_id = a.escritorio_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if t.id <> a.id and a.papel <> 'admin' and public._nivel(t.papel) >= public._nivel(a.papel) then raise exception 'NIVEL_ACIMA_DO_SEU'; end if;
  if t.id = a.id then raise exception 'NAO_ALTERAR_A_SI'; end if;
  if p_minutos is null or p_minutos < 5 or p_minutos > 720 then raise exception 'TEMPO_INVALIDO'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  v_ate := now() + make_interval(mins => p_minutos);
  insert into public.liberacoes_acesso (escritorio_id, perfil_id, ate, motivo, criado_por_nome) values (a.escritorio_id, t.id, v_ate, btrim(p_motivo), a.nome);
  perform public._log_acesso(a.escritorio_id, t.id, t.nome, 'liberacao', p_minutos || ' min · ' || btrim(p_motivo) || ' · por ' || a.nome);
  return jsonb_build_object('ok', true, 'ate', v_ate);
end $$;

create or replace function public.encerrar_liberacao(p_perfil uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.perfis := public._perfil_atual();
begin
  if a.id is null or not public.tem_permissao('ponto.gerir') then raise exception 'SEM_PERMISSAO'; end if;
  update public.liberacoes_acesso set ate = now() where perfil_id = p_perfil and escritorio_id = a.escritorio_id and ate > now();
end $$;

-- ---------- Permissões de execução ----------
revoke all on function public._expandir_permissoes(text[]), public._nivel(text), public._papel_exige_ponto(text), public._permissoes_catalogo(),
  public._permissoes_reservadas(), public._permissoes_implicacoes(), public._permissoes_padrao(text), public._perfil_atual(),
  public._permissoes_do(public.perfis), public._estado_de(public.perfis), public._conferir_permissoes_dadas(public.perfis, text[], boolean),
  public._log_acesso(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.meu_funcionario(), public.permissoes_efetivas(), public.estado_acesso(), public.acesso_ok(), public.tem_permissao(text),
  public.processo_delegado(uuid), public.processo_visivel(uuid) from public, anon;
grant execute on function public.meu_funcionario(), public.permissoes_efetivas(), public.estado_acesso(), public.acesso_ok(), public.tem_permissao(text),
  public.processo_delegado(uuid), public.processo_visivel(uuid) to authenticated;
revoke all on function public.minhas_tarefas(), public.minha_tarefa_atualizar(uuid, text, text), public.meu_ponto_hoje(),
  public.registrar_evento_acesso(text, text), public.senha_trocada(), public.criar_acesso(text, text, text, text, uuid, text[], text[], boolean),
  public.atualizar_acesso(uuid, jsonb), public.acessos_lista(), public.acesso_politica(), public.definir_exigir_ponto(boolean),
  public.definir_permissoes_papel(text, text[]), public.restaurar_permissoes_papel(text), public.liberar_acesso(uuid, int, text),
  public.encerrar_liberacao(uuid) from public, anon;
grant execute on function public.minhas_tarefas(), public.minha_tarefa_atualizar(uuid, text, text), public.meu_ponto_hoje(),
  public.registrar_evento_acesso(text, text), public.senha_trocada(), public.criar_acesso(text, text, text, text, uuid, text[], text[], boolean),
  public.atualizar_acesso(uuid, jsonb), public.acessos_lista(), public.acesso_politica(), public.definir_exigir_ponto(boolean),
  public.definir_permissoes_papel(text, text[]), public.restaurar_permissoes_papel(text), public.liberar_acesso(uuid, int, text),
  public.encerrar_liberacao(uuid) to authenticated;
revoke all on function public.criar_usuario(text, text, text, text), public.atualizar_usuario(uuid, text, text, boolean), public.equipe(),
  public.checklist_aplicar(uuid, uuid, uuid), public.link_criar(uuid, uuid, int, text), public.link_revogar(uuid), public.documento_abrir(uuid),
  public.documentos_resumo() from public, anon;
grant execute on function public.criar_usuario(text, text, text, text), public.atualizar_usuario(uuid, text, text, boolean), public.equipe(),
  public.checklist_aplicar(uuid, uuid, uuid), public.link_criar(uuid, uuid, int, text), public.link_revogar(uuid), public.documento_abrir(uuid),
  public.documentos_resumo() to authenticated;
grant execute on function public.eh_gestao(), public.eh_delegante() to authenticated;

select public._auditar_tabela('papeis_permissoes');
select public._auditar_tabela('acesso_config');

insert into public.schema_versao (versao, nome) values (13, 'niveis de acesso, permissoes e porta do ponto') on conflict (versao) do nothing;
