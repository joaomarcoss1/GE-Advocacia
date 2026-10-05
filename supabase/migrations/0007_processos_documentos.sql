-- =====================================================================
-- 0007 · Processos (acompanhamento), clientes e documentos
--  * clientes e processos por escritório; andamentos do tribunal (DataJud) imutáveis, classificados e com prazo sugerido
--  * checklist de documentos por processo/cliente (modelos por área), arquivos no Storage PRIVADO
--  * link seguro para o cliente enviar documentos (só o HASH do token fica no banco; expira; revogável)
--  * pastas e arquivos organizados no Google Drive do escritório (token cifrado, só a Edge Function acessa)
-- Idempotente. Toda tabela nova: escritorio_id + RLS por escritório + FKs compostas.
-- =====================================================================

-- ---------- Trilha de auditoria sem valores sensíveis ----------
create or replace function public._trg_auditar() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_antes jsonb; v_depois jsonb; v_campos text; v_usuario text; v_acao text; v_ref jsonb := coalesce(v_new, v_old);
  v_uid uuid := auth.uid();
  -- valores sensíveis nunca vão para a trilha: fica só o NOME do campo alterado
  v_sens text[] := array['detalhe', 'documento', 'cpf', 'pix', 'banco', 'agencia', 'conta', 'tipo_conta', 'telefone', 'email', 'salario_mensal', 'pin_hash', 'token_hash', 'refresh_token_enc'];
begin
  if public._bypass_expurgo() then return coalesce(new, old); end if;   -- o expurgo grava um resumo próprio
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, v_old -> k), jsonb_object_agg(k, v_new -> k), string_agg(k, ', ' order by k)
      into v_antes, v_depois, v_campos
      from jsonb_object_keys(v_new) k where k not in ('detalhe') and v_new -> k is distinct from v_old -> k;
    if v_campos is null then return new; end if;                -- nada mudou
  elsif tg_op = 'INSERT' then v_depois := v_new;
  else v_antes := v_old; end if;
  v_antes := v_antes - v_sens; v_depois := v_depois - v_sens;

  select nome || ' <' || email || '>' into v_usuario from public.perfis where id = v_uid;
  v_usuario := coalesce(v_usuario, case when v_uid is null then 'Sistema (PIN / painel)' else v_uid::text end);
  v_acao := case tg_op when 'INSERT' then 'Criado' when 'UPDATE' then 'Alterado' else 'Excluído' end || ' · ' || tg_table_name;
  insert into public.auditoria (escritorio_id, usuario, usuario_id, acao, detalhe, tabela, registro_id, antes, depois, origem)
  values ((v_ref ->> 'escritorio_id')::uuid, v_usuario, v_uid, v_acao,
          left(public._rotulo_registro(tg_table_name, v_ref) || coalesce(' · campos: ' || v_campos, ''), 500),
          tg_table_name, coalesce(v_ref ->> 'id', v_ref ->> 'escritorio_id'), v_antes, v_depois, nullif(public._origem(), ''));
  return coalesce(new, old);
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
    when 'processos' then coalesce(p_row ->> 'numero', '')
    when 'documentos' then coalesce(p_row ->> 'nome', '')
    when 'checklist_itens' then coalesce(p_row ->> 'nome', '')
    when 'configuracoes' then 'Configurações do escritório'
    else coalesce(p_row ->> 'nome', p_row ->> 'email', p_row ->> 'data', p_row ->> 'id', '')
  end
$$;

-- ---------- Clientes ----------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  nome text not null check (length(btrim(nome)) between 2 and 200),
  tipo text not null default 'pf' check (tipo in ('pf', 'pj')),
  documento text check (documento is null or length(documento) <= 32),
  email text check (email is null or length(email) <= 200),
  telefone text check (telefone is null or length(telefone) <= 40),
  observacoes text check (observacoes is null or length(observacoes) <= 2000),
  ativo boolean not null default true,
  drive_folder_id text,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (escritorio_id, id)
);
create index if not exists clientes_nome_idx on public.clientes (escritorio_id, lower(nome));

-- ---------- Processos ----------
create table if not exists public.processos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  numero text not null,
  cliente_id uuid,
  titulo text check (titulo is null or length(titulo) <= 200),
  polo text not null default 'ativo' check (polo in ('ativo', 'passivo', 'terceiro')),
  parte_contraria text check (parte_contraria is null or length(parte_contraria) <= 200),
  area text check (area is null or area in ('civel', 'trabalhista', 'tributario', 'criminal', 'familia', 'empresarial', 'previdenciario', 'administrativo', 'outro')),
  classe text, assunto text, orgao_julgador text,
  tribunal text check (tribunal is null or tribunal ~ '^[a-z0-9-]{2,20}$'),
  grau text,
  data_ajuizamento date,
  valor_causa numeric(14, 2) check (valor_causa is null or valor_causa >= 0),
  situacao text not null default 'ativo' check (situacao in ('ativo', 'suspenso', 'arquivado', 'encerrado')),
  fase text not null default 'conhecimento' check (fase in ('conhecimento', 'recursal', 'execucao', 'encerramento')),
  responsavel_id uuid,
  monitorar boolean not null default true,
  sigiloso boolean not null default false,
  ultima_consulta timestamptz,
  ultima_consulta_erro text,
  ultima_movimentacao_em timestamptz,
  drive_folder_id text,
  observacoes text check (observacoes is null or length(observacoes) <= 2000),
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (escritorio_id, id),
  unique (escritorio_id, numero),
  foreign key (escritorio_id, cliente_id) references public.clientes (escritorio_id, id) on delete restrict,
  foreign key (escritorio_id, responsavel_id) references public.funcionarios (escritorio_id, id) on delete restrict
);
create index if not exists processos_cliente_idx on public.processos (escritorio_id, cliente_id);
create index if not exists processos_monitor_idx on public.processos (escritorio_id, monitorar, ultima_consulta);

-- ---------- Andamentos do processo (do tribunal ou registrados à mão) ----------
create table if not exists public.processo_movimentos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  processo_id uuid not null,
  origem text not null default 'manual' check (origem in ('datajud', 'manual', 'simulada')),
  codigo int,
  nome text not null check (length(btrim(nome)) between 1 and 300),
  complemento text check (complemento is null or length(complemento) <= 2000),
  data_hora timestamptz not null,
  categoria text not null default 'outros' check (categoria in ('sentenca', 'decisao', 'despacho', 'intimacao', 'citacao', 'audiencia', 'juntada', 'peticao', 'recurso', 'transito', 'arquivamento', 'distribuicao', 'conclusao', 'outros')),
  exige_acao boolean not null default false,
  prazo_sugerido_dias int check (prazo_sugerido_dias is null or prazo_sugerido_dias between 1 and 365),
  lido boolean not null default false,
  tarefa_id uuid,
  chave text not null,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  unique (escritorio_id, id),
  unique (processo_id, chave),
  foreign key (escritorio_id, processo_id) references public.processos (escritorio_id, id) on delete cascade
);
create index if not exists movimentos_processo_idx on public.processo_movimentos (processo_id, data_hora desc);
create index if not exists movimentos_novos_idx on public.processo_movimentos (escritorio_id, lido) where not lido;

-- Tarefas/prazos ligados a processo e a um andamento (a criação automática nunca duplica).
alter table public.tarefas add column if not exists processo_id uuid;
alter table public.tarefas add column if not exists origem_movimento_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tarefas_processo_fk') then
    alter table public.tarefas add constraint tarefas_processo_fk foreign key (escritorio_id, processo_id) references public.processos (escritorio_id, id) on delete restrict;
  end if;
end $$;
create unique index if not exists tarefas_origem_mov_idx on public.tarefas (origem_movimento_id) where origem_movimento_id is not null;
create index if not exists tarefas_processo_id_idx on public.tarefas (processo_id);

create or replace function public._trg_tarefa_regras() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare p uuid; n text; pr public.processos; cl text;
begin
  new.titulo := btrim(new.titulo);
  -- tarefa ligada a um processo cadastrado: número e cliente vêm do cadastro
  if new.processo_id is not null then
    select * into pr from public.processos where id = new.processo_id and escritorio_id = new.escritorio_id;
    if not found then raise exception 'PROCESSO_INVALIDO'; end if;
    new.processo_numero := pr.numero;
    if new.cliente is null and pr.cliente_id is not null then
      select nome into cl from public.clientes where id = pr.cliente_id; new.cliente := cl;
    end if;
    if new.area is null then new.area := pr.area; end if;
  end if;
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

-- ---------- Modelos e itens de checklist ----------
create table if not exists public.checklist_modelos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  nome text not null check (length(btrim(nome)) between 2 and 120),
  area text check (area is null or area in ('civel', 'trabalhista', 'tributario', 'criminal', 'familia', 'empresarial', 'previdenciario', 'administrativo', 'outro')),
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) <= 80),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (escritorio_id, id),
  unique (escritorio_id, nome)
);

create table if not exists public.checklist_itens (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  cliente_id uuid,
  processo_id uuid,
  nome text not null check (length(btrim(nome)) between 1 and 160),
  obrigatorio boolean not null default true,
  status text not null default 'pendente' check (status in ('pendente', 'recebido', 'conferido', 'dispensado')),
  observacao text check (observacao is null or length(observacao) <= 500),
  ordem int not null default 0,
  recebido_em timestamptz,
  created_at timestamptz not null default now(),
  unique (escritorio_id, id),
  check (cliente_id is not null or processo_id is not null),
  foreign key (escritorio_id, cliente_id) references public.clientes (escritorio_id, id) on delete cascade,
  foreign key (escritorio_id, processo_id) references public.processos (escritorio_id, id) on delete cascade
);
create index if not exists checklist_processo_idx on public.checklist_itens (processo_id, ordem);
create index if not exists checklist_cliente_idx on public.checklist_itens (cliente_id, ordem);

-- ---------- Documentos (o arquivo vive no Storage privado; aqui os metadados) ----------
create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  cliente_id uuid not null,
  processo_id uuid,
  item_id uuid,
  nome text not null check (length(btrim(nome)) between 1 and 200),
  mime text not null,
  tamanho int not null check (tamanho between 1 and 20971520),
  sha256 text,
  storage_path text unique,
  origem text not null default 'painel' check (origem in ('painel', 'link_cliente')),
  enviado_por uuid,
  enviado_por_nome text,
  conferido boolean not null default false,
  conferido_por uuid,
  conferido_em timestamptz,
  drive_status text not null default 'desligado' check (drive_status in ('desligado', 'pendente', 'enviado', 'erro')),
  drive_file_id text,
  drive_link text,
  drive_erro text,
  drive_tentativas int not null default 0,
  created_at timestamptz not null default now(),
  unique (escritorio_id, id),
  foreign key (escritorio_id, cliente_id) references public.clientes (escritorio_id, id) on delete restrict,
  foreign key (escritorio_id, processo_id) references public.processos (escritorio_id, id) on delete restrict,
  foreign key (escritorio_id, item_id) references public.checklist_itens (escritorio_id, id) on delete set null (item_id)
);
create index if not exists documentos_cliente_idx on public.documentos (cliente_id, created_at desc);
create index if not exists documentos_processo_idx on public.documentos (processo_id, created_at desc);
create index if not exists documentos_drive_idx on public.documentos (escritorio_id, drive_status) where drive_status in ('pendente', 'erro');

create table if not exists public.documentos_lixeira (
  id bigserial primary key,
  escritorio_id uuid not null references public.escritorios(id) on delete restrict,
  storage_path text not null,
  drive_file_id text,
  removido_em timestamptz not null default now()
);
alter table public.documentos_lixeira enable row level security;
revoke all on public.documentos_lixeira from anon, authenticated;
revoke all on sequence public.documentos_lixeira_id_seq from anon, authenticated;

-- Quem abriu/baixou cada documento (somente inserção).
create table if not exists public.documentos_acessos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null,
  documento_id uuid not null,
  usuario_id uuid,
  usuario text not null,
  acao text not null default 'abrir',
  created_at timestamptz not null default now()
);
create index if not exists documentos_acessos_idx on public.documentos_acessos (escritorio_id, created_at desc);

-- Link para o CLIENTE enviar documentos sem login: o token só existe na hora da criação; no banco fica o hash.
create table if not exists public.documento_links (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  cliente_id uuid not null,
  processo_id uuid,
  token_hash text not null unique,
  rotulo text check (rotulo is null or length(rotulo) <= 120),
  expira_em timestamptz not null,
  ativo boolean not null default true,
  max_arquivos int not null default 40 check (max_arquivos between 1 and 200),
  usos int not null default 0,
  ultimo_uso timestamptz,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (escritorio_id, id),
  foreign key (escritorio_id, cliente_id) references public.clientes (escritorio_id, id) on delete cascade,
  foreign key (escritorio_id, processo_id) references public.processos (escritorio_id, id) on delete cascade
);

-- Google Drive do ESCRITÓRIO (uma conta, conectada pelo administrador). Token cifrado; sem política e sem privilégio na API.
create table if not exists public.drive_conexoes (
  escritorio_id uuid primary key references public.escritorios(id) on delete restrict,
  conectado_por uuid,
  email_google text,
  refresh_token_enc text not null,
  pasta_raiz_id text,
  created_at timestamptz not null default now()
);
alter table public.drive_conexoes enable row level security;
revoke all on public.drive_conexoes from anon, authenticated;

-- ---------- Regras (gatilhos) ----------
create or replace function public._trg_cliente_regras() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  new.nome := btrim(new.nome);
  new.documento := nullif(regexp_replace(coalesce(new.documento, ''), '[^0-9A-Za-z]', '', 'g'), '');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if auth.uid() is not null then new.drive_folder_id := old.drive_folder_id; end if;     -- só a Edge Function mexe na pasta
  elsif auth.uid() is not null then new.drive_folder_id := null; end if;
  return new;
end $$;
drop trigger if exists trg_cliente_regras on public.clientes;
create trigger trg_cliente_regras before insert or update on public.clientes for each row execute function public._trg_cliente_regras();

create or replace function public._trg_processo_regras() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n text;
begin
  n := public.cnj_normalizar(new.numero);
  if n is null then raise exception 'PROCESSO_INVALIDO'; end if;
  new.numero := n;
  if new.responsavel_id is not null and not exists (select 1 from public.funcionarios f where f.id = new.responsavel_id and f.escritorio_id = new.escritorio_id) then
    raise exception 'RESPONSAVEL_INVALIDO'; end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if auth.uid() is not null then                                 -- consulta e pasta do Drive são da Edge Function
      new.drive_folder_id := old.drive_folder_id; new.ultima_consulta := old.ultima_consulta;
      new.ultima_consulta_erro := old.ultima_consulta_erro; new.ultima_movimentacao_em := old.ultima_movimentacao_em;
    end if;
  elsif auth.uid() is not null then
    new.drive_folder_id := null; new.ultima_consulta := null; new.ultima_consulta_erro := null; new.ultima_movimentacao_em := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_processo_regras on public.processos;
create trigger trg_processo_regras before insert or update on public.processos for each row execute function public._trg_processo_regras();

-- Andamento nunca se altera: só "lido" e o vínculo com a tarefa criada.
create or replace function public._trg_movimento_regras() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.origem := 'manual'; new.tarefa_id := null; end if;   -- pelo painel, só andamento manual
    new.criado_por_nome := coalesce(new.criado_por_nome, (select nome from public.perfis where id = auth.uid()));
    new.chave := coalesce(nullif(new.chave, ''), 'm|' || coalesce(new.codigo::text, '') || '|' || extract(epoch from new.data_hora)::bigint || '|' || left(new.nome, 80));
    return new;
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.processos p where p.id = old.processo_id) then raise exception 'ANDAMENTO_IMUTAVEL'; end if;
    return old;
  end if;
  if (to_jsonb(new) - 'lido' - 'tarefa_id') is distinct from (to_jsonb(old) - 'lido' - 'tarefa_id') then raise exception 'ANDAMENTO_IMUTAVEL'; end if;
  if auth.uid() is not null then new.tarefa_id := old.tarefa_id; end if;
  return new;
end $$;
drop trigger if exists trg_movimento_regras on public.processo_movimentos;
create trigger trg_movimento_regras before insert or update or delete on public.processo_movimentos for each row execute function public._trg_movimento_regras();

-- Último andamento no cabeçalho do processo.
create or replace function public._trg_movimento_resumo() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  update public.processos set ultima_movimentacao_em = greatest(coalesce(ultima_movimentacao_em, '-infinity'), new.data_hora)
   where id = new.processo_id and escritorio_id = new.escritorio_id;
  return new;
end $$;
drop trigger if exists trg_movimento_resumo on public.processo_movimentos;
create trigger trg_movimento_resumo after insert on public.processo_movimentos for each row execute function public._trg_movimento_resumo();

create or replace function public._trg_item_regras() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare pr public.processos;
begin
  new.nome := btrim(new.nome);
  if new.processo_id is not null then
    select * into pr from public.processos where id = new.processo_id and escritorio_id = new.escritorio_id;
    if not found then raise exception 'NAO_ENCONTRADO'; end if;
    new.cliente_id := coalesce(new.cliente_id, pr.cliente_id);
    if pr.cliente_id is distinct from new.cliente_id and pr.cliente_id is not null then raise exception 'CLIENTE_DIFERENTE'; end if;
  end if;
  if new.status in ('recebido', 'conferido') and new.recebido_em is null then new.recebido_em := now(); end if;
  if new.status in ('pendente', 'dispensado') then new.recebido_em := null; end if;
  return new;
end $$;
drop trigger if exists trg_item_regras on public.checklist_itens;
create trigger trg_item_regras before insert or update on public.checklist_itens for each row execute function public._trg_item_regras();

create or replace function public._trg_documento_regras() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare pr public.processos;
begin
  if tg_op = 'INSERT' then
    if new.processo_id is not null then
      select * into pr from public.processos where id = new.processo_id and escritorio_id = new.escritorio_id;
      if not found then raise exception 'NAO_ENCONTRADO'; end if;
      if pr.cliente_id is not null and pr.cliente_id <> new.cliente_id then raise exception 'CLIENTE_DIFERENTE'; end if;
    end if;
    if new.item_id is not null and not exists (select 1 from public.checklist_itens i where i.id = new.item_id and i.escritorio_id = new.escritorio_id
         and (i.processo_id is not distinct from new.processo_id or (i.processo_id is null and i.cliente_id = new.cliente_id))) then
      raise exception 'ITEM_INVALIDO'; end if;
    return new;
  end if;
  -- pelo painel só se confere o documento e se muda o item; metadados, arquivo e Drive são imutáveis
  if auth.uid() is not null then
    if (to_jsonb(new) - 'conferido' - 'conferido_por' - 'conferido_em' - 'item_id') is distinct from (to_jsonb(old) - 'conferido' - 'conferido_por' - 'conferido_em' - 'item_id') then
      raise exception 'DOCUMENTO_IMUTAVEL'; end if;
    if new.conferido and not old.conferido then new.conferido_por := auth.uid(); new.conferido_em := now();
    elsif not new.conferido then new.conferido_por := null; new.conferido_em := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_documento_regras on public.documentos;
create trigger trg_documento_regras before insert or update on public.documentos for each row execute function public._trg_documento_regras();

create or replace function public._trg_documento_lixeira() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if old.storage_path is not null or old.drive_file_id is not null then
    insert into public.documentos_lixeira (escritorio_id, storage_path, drive_file_id) values (old.escritorio_id, coalesce(old.storage_path, ''), old.drive_file_id);
  end if;
  return old;
end $$;
drop trigger if exists trg_documento_lixeira on public.documentos;
create trigger trg_documento_lixeira before delete on public.documentos for each row execute function public._trg_documento_lixeira();

-- Confere o item da checklist quando chega um documento (e volta a pendente se o último documento sair).
create or replace function public._trg_documento_item() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if tg_op = 'INSERT' and new.item_id is not null then
    update public.checklist_itens set status = 'recebido', recebido_em = now() where id = new.item_id and status in ('pendente');
  elsif tg_op = 'DELETE' and old.item_id is not null then
    update public.checklist_itens set status = 'pendente' where id = old.item_id and status in ('recebido', 'conferido')
       and not exists (select 1 from public.documentos d where d.item_id = old.item_id and d.id <> old.id);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_documento_item on public.documentos;
create trigger trg_documento_item after insert or delete on public.documentos for each row execute function public._trg_documento_item();

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['clientes', 'processos', 'processo_movimentos', 'checklist_modelos', 'checklist_itens', 'documentos', 'documento_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists trg_escritorio_imutavel on public.%I', t);
    execute format('create trigger trg_escritorio_imutavel before update on public.%I for each row execute function public._trg_escritorio_imutavel()', t);
  end loop;
end $$;
alter table public.documentos_acessos enable row level security;
revoke all on public.documentos_acessos from anon;
revoke insert, update, delete on public.documentos_acessos from authenticated;

do $$
declare mesmo text := 'escritorio_id = (select public.meu_escritorio())';
        t text; p text;
begin
  -- leitura: quem delega (administrador, gerência e coordenação) · escrita conforme a tabela
  foreach t in array array['clientes', 'processos', 'processo_movimentos', 'checklist_modelos', 'checklist_itens', 'documentos', 'documento_links'] loop
    execute format('drop policy if exists "dlg le" on public.%I', t);
    execute format('create policy "dlg le" on public.%I for select to authenticated using (%s and (select public.eh_delegante()))', t, mesmo);
  end loop;
  foreach t in array array['clientes', 'processos', 'checklist_itens'] loop
    execute format('drop policy if exists "dlg ins" on public.%I', t);
    execute format('drop policy if exists "dlg upd" on public.%I', t);
    execute format('drop policy if exists "gestao del" on public.%I', t);
    execute format('create policy "dlg ins" on public.%I for insert to authenticated with check (%s and (select public.eh_delegante()))', t, mesmo);
    execute format('create policy "dlg upd" on public.%I for update to authenticated using (%s and (select public.eh_delegante())) with check (%s and (select public.eh_delegante()))', t, mesmo, mesmo);
    execute format('create policy "gestao del" on public.%I for delete to authenticated using (%s and (select public.eh_gestao()))', t, mesmo);
  end loop;
  -- andamentos: o painel só acrescenta (manual) e marca como lido
  drop policy if exists "dlg ins" on public.processo_movimentos;
  drop policy if exists "dlg upd" on public.processo_movimentos;
  create policy "dlg ins" on public.processo_movimentos for insert to authenticated with check (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()));
  create policy "dlg upd" on public.processo_movimentos for update to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()))
    with check (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()));
  -- modelos de checklist: a gestão edita
  drop policy if exists "gestao esc" on public.checklist_modelos;
  create policy "gestao esc" on public.checklist_modelos for all to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_gestao()))
    with check (escritorio_id = (select public.meu_escritorio()) and (select public.eh_gestao()));
  -- documentos: criação só pela Edge Function; o painel confere e a gestão exclui
  drop policy if exists "dlg upd" on public.documentos;
  drop policy if exists "gestao del" on public.documentos;
  create policy "dlg upd" on public.documentos for update to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()))
    with check (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()));
  create policy "gestao del" on public.documentos for delete to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_gestao()));
  -- links: criar e revogar só pelas funções abaixo (o token é gerado no banco)
  revoke insert, delete on public.documento_links from authenticated;
  revoke update on public.documento_links from authenticated;
  -- histórico de abertura de documentos: a gestão lê
  drop policy if exists "gestao le" on public.documentos_acessos;
  create policy "gestao le" on public.documentos_acessos for select to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_gestao()));
end $$;

select public._auditar_tabela(t) from unnest(array['clientes', 'processos', 'checklist_itens', 'checklist_modelos', 'documentos']) t;

-- ---------- Funções chamadas pelo painel ----------
create or replace function public.checklist_aplicar(p_modelo uuid, p_processo uuid default null, p_cliente uuid default null) returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare m public.checklist_modelos; v_esc uuid := public.meu_escritorio(); v_cli uuid := p_cliente; i jsonb; n int := 0; ord int;
begin
  if not public.eh_delegante() then raise exception 'SEM_PERMISSAO'; end if;
  select * into m from public.checklist_modelos where id = p_modelo and escritorio_id = v_esc;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if p_processo is not null then
    select cliente_id into v_cli from public.processos where id = p_processo and escritorio_id = v_esc;
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

-- Cria o link do cliente. O token aparece UMA vez (aqui); no banco fica só o hash.
create or replace function public.link_criar(p_cliente uuid, p_processo uuid default null, p_dias int default 14, p_rotulo text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_esc uuid := public.meu_escritorio(); v_token text; v_id uuid;
begin
  if not public.eh_delegante() then raise exception 'SEM_PERMISSAO'; end if;
  if not exists (select 1 from public.clientes where id = p_cliente and escritorio_id = v_esc) then raise exception 'NAO_ENCONTRADO'; end if;
  if p_processo is not null and not exists (select 1 from public.processos where id = p_processo and escritorio_id = v_esc and cliente_id = p_cliente) then raise exception 'NAO_ENCONTRADO'; end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.documento_links (escritorio_id, cliente_id, processo_id, token_hash, rotulo, expira_em)
  values (v_esc, p_cliente, p_processo, encode(digest(v_token, 'sha256'), 'hex'), left(p_rotulo, 120), now() + make_interval(days => greatest(least(coalesce(p_dias, 14), 60), 1)))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'token', v_token, 'expira_em', (select expira_em from public.documento_links where id = v_id));
end $$;
create or replace function public.link_revogar(p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_delegante() then raise exception 'SEM_PERMISSAO'; end if;
  update public.documento_links set ativo = false where id = p_id and escritorio_id = public.meu_escritorio();
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
end $$;

-- Abrir um documento: confere papel e escritório, REGISTRA o acesso e devolve o caminho (a Edge Function assina a URL de 60 s).
create or replace function public.documento_abrir(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare d public.documentos; v_nome text;
begin
  if not public.eh_delegante() then raise exception 'SEM_PERMISSAO'; end if;
  select * into d from public.documentos where id = p_id and escritorio_id = public.meu_escritorio();
  if not found or d.storage_path is null then raise exception 'NAO_ENCONTRADO'; end if;
  select nome || ' <' || email || '>' into v_nome from public.perfis where id = auth.uid();
  insert into public.documentos_acessos (escritorio_id, documento_id, usuario_id, usuario, acao) values (d.escritorio_id, d.id, auth.uid(), coalesce(v_nome, '?'), 'abrir');
  return jsonb_build_object('ok', true, 'storage_path', d.storage_path, 'nome', d.nome, 'mime', d.mime);
end $$;

create or replace function public.drive_status() returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select case when public.eh_delegante() then
    coalesce((select jsonb_build_object('conectado', true, 'email', c.email_google, 'pasta_raiz_id', c.pasta_raiz_id)
                from public.drive_conexoes c where c.escritorio_id = public.meu_escritorio()), jsonb_build_object('conectado', false))
  else jsonb_build_object('conectado', false) end
$$;
create or replace function public.drive_desconectar() returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  delete from public.drive_conexoes where escritorio_id = public.meu_escritorio();
  update public.documentos set drive_status = 'desligado' where escritorio_id = public.meu_escritorio() and drive_status in ('pendente', 'erro');
end $$;

-- Mesma lógica, para o painel saber o que ainda não chegou ao Drive.
create or replace function public.documentos_resumo() returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select case when public.eh_delegante() then jsonb_build_object(
    'total', (select count(*) from public.documentos where escritorio_id = public.meu_escritorio()),
    'sem_conferir', (select count(*) from public.documentos where escritorio_id = public.meu_escritorio() and not conferido),
    'drive_pendente', (select count(*) from public.documentos where escritorio_id = public.meu_escritorio() and drive_status in ('pendente', 'erro')))
  else '{}'::jsonb end
$$;

-- ---------- Modelos de checklist iniciais (editáveis) ----------
create or replace function public._semear_checklists(p_esc uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  insert into public.checklist_modelos (escritorio_id, nome, area, itens) values
   (p_esc, 'Geral', null, '[{"nome":"Documento de identificação (RG ou CNH)"},{"nome":"CPF"},{"nome":"Comprovante de residência"},{"nome":"Procuração assinada"},{"nome":"Contrato de honorários assinado"}]'),
   (p_esc, 'Trabalhista', 'trabalhista', '[{"nome":"RG e CPF"},{"nome":"Comprovante de residência"},{"nome":"Carteira de trabalho (CTPS)"},{"nome":"Contrato de trabalho"},{"nome":"Holerites / contracheques"},{"nome":"Termo de rescisão (TRCT)"},{"nome":"Extrato do FGTS"},{"nome":"Procuração assinada"},{"nome":"Declaração de hipossuficiência"},{"nome":"Provas (mensagens, fotos, testemunhas)","obrigatorio":false}]'),
   (p_esc, 'Cível', 'civel', '[{"nome":"RG e CPF (ou CNPJ e contrato social)"},{"nome":"Comprovante de residência"},{"nome":"Procuração assinada"},{"nome":"Contrato ou documento que originou a causa"},{"nome":"Comprovantes de pagamento"},{"nome":"Troca de mensagens e e-mails","obrigatorio":false},{"nome":"Provas do dano (fotos, orçamentos, laudos)","obrigatorio":false}]'),
   (p_esc, 'Família e sucessões', 'familia', '[{"nome":"RG e CPF"},{"nome":"Certidão de casamento ou nascimento"},{"nome":"Certidão de nascimento dos filhos"},{"nome":"Comprovante de residência"},{"nome":"Comprovantes de renda"},{"nome":"Documentos dos bens","obrigatorio":false},{"nome":"Procuração assinada"}]'),
   (p_esc, 'Previdenciário', 'previdenciario', '[{"nome":"RG e CPF"},{"nome":"Comprovante de residência"},{"nome":"CNIS (extrato previdenciário)"},{"nome":"Carteira de trabalho (CTPS)"},{"nome":"PPP e laudos"},{"nome":"Carta de concessão ou indeferimento"},{"nome":"Procuração assinada"}]'),
   (p_esc, 'Empresarial e tributário', 'empresarial', '[{"nome":"Contrato social e alterações"},{"nome":"Cartão CNPJ"},{"nome":"Documentos dos sócios (RG e CPF)"},{"nome":"Procuração assinada"},{"nome":"Certidões negativas","obrigatorio":false},{"nome":"Documentos fiscais e guias"}]'),
   (p_esc, 'Criminal', 'criminal', '[{"nome":"RG e CPF"},{"nome":"Comprovante de residência"},{"nome":"Procuração assinada"},{"nome":"Boletim de ocorrência ou documentos do inquérito"},{"nome":"Certidão de antecedentes","obrigatorio":false}]')
  on conflict (escritorio_id, nome) do nothing;
end $$;
create or replace function public._trg_escritorio_checklists() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin perform public._semear_checklists(new.id); return new; end $$;
drop trigger if exists trg_escritorio_checklists on public.escritorios;
create trigger trg_escritorio_checklists after insert on public.escritorios for each row execute function public._trg_escritorio_checklists();
select public._semear_checklists(id) from public.escritorios;

-- ---------- Bucket privado dos documentos ----------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('documentos', 'documentos', false, 20971520)
    on conflict (id) do update set public = false, file_size_limit = 20971520;
    -- Nenhuma política em storage.objects para anon/authenticated: o acesso é só pela Edge Function "documentos".
  end if;
end $$;

-- O escritório só pode ser excluído se estiver vazio.
create or replace function public.plataforma_excluir_escritorio(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare e public.escritorios;
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  select * into e from public.escritorios where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if exists (select 1 from public.funcionarios where escritorio_id = p_id) then raise exception 'ESCRITORIO_COM_DADOS'; end if;
  delete from auth.users where id in (select id from public.perfis where escritorio_id = p_id);
  if exists (select 1 from public.clientes where escritorio_id = p_id) or exists (select 1 from public.processos where escritorio_id = p_id)
     or exists (select 1 from public.documentos where escritorio_id = p_id) then raise exception 'ESCRITORIO_COM_DADOS'; end if;
  delete from public.drive_conexoes where escritorio_id = p_id;
  delete from public.documento_links where escritorio_id = p_id;
  delete from public.checklist_modelos where escritorio_id = p_id;
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

-- ---------- Permissões ----------
revoke all on function public._trg_cliente_regras() from public, anon, authenticated;
revoke all on function public._trg_processo_regras() from public, anon, authenticated;
revoke all on function public._trg_movimento_regras() from public, anon, authenticated;
revoke all on function public._trg_movimento_resumo() from public, anon, authenticated;
revoke all on function public._trg_item_regras() from public, anon, authenticated;
revoke all on function public._trg_documento_regras() from public, anon, authenticated;
revoke all on function public._trg_documento_lixeira() from public, anon, authenticated;
revoke all on function public._trg_documento_item() from public, anon, authenticated;
revoke all on function public._trg_escritorio_checklists() from public, anon, authenticated;
revoke all on function public._semear_checklists(uuid) from public, anon, authenticated;
revoke all on function public.checklist_aplicar(uuid, uuid, uuid) from public, anon;
revoke all on function public.link_criar(uuid, uuid, int, text) from public, anon;
revoke all on function public.link_revogar(uuid) from public, anon;
revoke all on function public.documento_abrir(uuid) from public, anon;
revoke all on function public.drive_status() from public, anon;
revoke all on function public.drive_desconectar() from public, anon;
revoke all on function public.documentos_resumo() from public, anon;
revoke all on function public.plataforma_excluir_escritorio(uuid) from public, anon;
revoke all on function public._trg_tarefa_regras() from public, anon, authenticated;
grant execute on function public.checklist_aplicar(uuid, uuid, uuid) to authenticated;
grant execute on function public.link_criar(uuid, uuid, int, text) to authenticated;
grant execute on function public.link_revogar(uuid) to authenticated;
grant execute on function public.documento_abrir(uuid) to authenticated;
grant execute on function public.drive_status() to authenticated;
grant execute on function public.drive_desconectar() to authenticated;
grant execute on function public.documentos_resumo() to authenticated;
grant execute on function public.plataforma_excluir_escritorio(uuid) to authenticated;

insert into public.schema_versao (versao, nome) values (7, 'processos, clientes e documentos') on conflict (versao) do nothing;
