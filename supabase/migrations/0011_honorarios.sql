-- 0011 · Precificação de honorários
--  * honorarios_parametros: custos fixos, tributação, margem, região e tabela da OAB do escritório (uma linha por escritório)
--  * honorarios_propostas: simulações salvas (por cliente/processo), com o resultado calculado
-- Dados financeiros do escritório: só o ADMINISTRADOR lê e grava.

create table if not exists public.honorarios_parametros (
  escritorio_id uuid primary key default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 200000),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.honorarios_propostas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  cliente_id uuid,
  processo_id uuid,
  titulo text not null check (length(btrim(titulo)) between 2 and 200),
  servico text not null check (length(servico) between 1 and 60),
  modalidade text not null check (modalidade in ('fixo', 'parcelado', 'misto', 'exito', 'hora')),
  status text not null default 'rascunho' check (status in ('rascunho', 'enviada', 'aceita', 'recusada')),
  valor_recomendado numeric(14, 2) not null default 0 check (valor_recomendado >= 0),
  valor_proposto numeric(14, 2) not null default 0 check (valor_proposto >= 0),
  exito_pct numeric(5, 2) not null default 0 check (exito_pct between 0 and 100),
  forma_pagamento text check (forma_pagamento is null or length(forma_pagamento) <= 500),
  entrada jsonb not null default '{}'::jsonb check (jsonb_typeof(entrada) = 'object' and pg_column_size(entrada) <= 20000),
  resultado jsonb not null default '{}'::jsonb check (jsonb_typeof(resultado) = 'object' and pg_column_size(resultado) <= 60000),
  observacoes text check (observacoes is null or length(observacoes) <= 2000),
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (escritorio_id, id),
  foreign key (escritorio_id, cliente_id) references public.clientes (escritorio_id, id) on delete set null (cliente_id),
  foreign key (escritorio_id, processo_id) references public.processos (escritorio_id, id) on delete set null (processo_id)
);
create index if not exists honorarios_propostas_cli_idx on public.honorarios_propostas (escritorio_id, cliente_id, created_at desc);

create or replace function public._trg_honorarios_toque() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_honorarios_param_toque on public.honorarios_parametros;
create trigger trg_honorarios_param_toque before update on public.honorarios_parametros for each row execute function public._trg_honorarios_toque();
drop trigger if exists trg_honorarios_prop_toque on public.honorarios_propostas;
create trigger trg_honorarios_prop_toque before update on public.honorarios_propostas for each row execute function public._trg_honorarios_toque();

alter table public.honorarios_parametros enable row level security;
alter table public.honorarios_propostas enable row level security;
drop trigger if exists trg_escritorio_imutavel on public.honorarios_parametros;
create trigger trg_escritorio_imutavel before update on public.honorarios_parametros for each row execute function public._trg_escritorio_imutavel();
drop trigger if exists trg_escritorio_imutavel on public.honorarios_propostas;
create trigger trg_escritorio_imutavel before update on public.honorarios_propostas for each row execute function public._trg_escritorio_imutavel();
drop policy if exists "admin esc" on public.honorarios_parametros;
create policy "admin esc" on public.honorarios_parametros for all to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_admin()))
  with check (escritorio_id = (select public.meu_escritorio()) and (select public.eh_admin()));
drop policy if exists "admin esc" on public.honorarios_propostas;
create policy "admin esc" on public.honorarios_propostas for all to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_admin()))
  with check (escritorio_id = (select public.meu_escritorio()) and (select public.eh_admin()));
revoke all on public.honorarios_parametros from anon;
revoke all on public.honorarios_propostas from anon;
revoke all on function public._trg_honorarios_toque() from public, anon, authenticated;
select public._auditar_tabela('honorarios_parametros');
select public._auditar_tabela('honorarios_propostas');

-- O escritório vazio pode ser excluído mesmo depois de ter modelos de documentos e dados de honorários (as chaves são "restrict").
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
  delete from public.honorarios_propostas where escritorio_id = p_id;
  delete from public.honorarios_parametros where escritorio_id = p_id;
  delete from public.modelos_documentos where escritorio_id = p_id;
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
revoke all on function public.plataforma_excluir_escritorio(uuid) from public, anon;
grant execute on function public.plataforma_excluir_escritorio(uuid) to authenticated;

insert into public.schema_versao (versao, nome) values (11, 'precificação de honorários') on conflict (versao) do nothing;
