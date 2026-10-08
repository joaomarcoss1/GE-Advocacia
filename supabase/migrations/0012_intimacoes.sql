-- 0012 · Caixa de intimações (DJEN — Diário de Justiça Eletrônico Nacional)
--  * intimacoes: comunicações lidas da API pública do CNJ, por OAB dos advogados do escritório. Quem grava é a Edge Function "processos"
--    (service_role); a equipe que delega lê e trata (status, prazo, responsável, vínculo com o processo e a tarefa).
--  * intimacoes_sync: resultado da última busca de cada escritório (para a tela mostrar quando foi e o que foi monitorado).
-- O conteúdo da comunicação nunca é alterado pelo usuário: só os campos de tratamento.

create table if not exists public.intimacoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  djen_id bigint not null,
  hash text,
  tribunal text not null check (length(tribunal) between 2 and 20),
  tipo_comunicacao text not null default 'Comunicação' check (length(tipo_comunicacao) <= 80),
  tipo_documento text check (tipo_documento is null or length(tipo_documento) <= 120),
  orgao text check (orgao is null or length(orgao) <= 300),
  classe text check (classe is null or length(classe) <= 300),
  numero_processo text check (numero_processo is null or length(numero_processo) <= 40),
  processo_id uuid,
  texto text not null default '' check (length(texto) <= 20000),
  link text check (link is null or length(link) <= 500),
  data_disponibilizacao date not null,
  meio text check (meio is null or length(meio) <= 80),
  cancelada boolean not null default false,
  destinatarios jsonb not null default '[]'::jsonb check (jsonb_typeof(destinatarios) = 'array'),
  advogados jsonb not null default '[]'::jsonb check (jsonb_typeof(advogados) = 'array'),
  oab_busca text check (oab_busca is null or length(oab_busca) <= 20),
  exige_providencia boolean not null default false,
  prazo_dias int check (prazo_dias is null or prazo_dias between 0 and 365),
  prazo_regime text check (prazo_regime is null or prazo_regime in ('uteis', 'corridos')),
  prazo_fim date,
  status text not null default 'nova' check (status in ('nova', 'lida', 'tratada', 'descartada')),
  responsavel_id uuid,
  tarefa_id uuid,
  tratada_em timestamptz,
  tratada_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (escritorio_id, id),
  unique (escritorio_id, djen_id),
  foreign key (escritorio_id, processo_id) references public.processos (escritorio_id, id) on delete set null (processo_id),
  foreign key (escritorio_id, responsavel_id) references public.funcionarios (escritorio_id, id) on delete set null (responsavel_id),
  foreign key (escritorio_id, tarefa_id) references public.tarefas (escritorio_id, id) on delete set null (tarefa_id)
);
create index if not exists intimacoes_lista_idx on public.intimacoes (escritorio_id, status, data_disponibilizacao desc);
create index if not exists intimacoes_processo_idx on public.intimacoes (escritorio_id, numero_processo);

create table if not exists public.intimacoes_sync (
  escritorio_id uuid primary key references public.escritorios(id) on delete restrict,
  executada_em timestamptz not null default now(),
  oabs jsonb not null default '[]'::jsonb check (jsonb_typeof(oabs) = 'array'),
  novas int not null default 0,
  erros int not null default 0,
  mensagem text check (mensagem is null or length(mensagem) <= 500)
);

-- o conteúdo da comunicação é do tribunal: quem trata só mexe nos campos de tratamento (a Edge Function, sem usuário, grava tudo)
create or replace function public._trg_intimacao_regras() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and auth.uid() is not null then
    if new.djen_id is distinct from old.djen_id or new.tribunal is distinct from old.tribunal or new.texto is distinct from old.texto or new.tipo_comunicacao is distinct from old.tipo_comunicacao
       or new.numero_processo is distinct from old.numero_processo or new.data_disponibilizacao is distinct from old.data_disponibilizacao or new.orgao is distinct from old.orgao
       or new.classe is distinct from old.classe or new.link is distinct from old.link or new.destinatarios is distinct from old.destinatarios or new.advogados is distinct from old.advogados
       or new.hash is distinct from old.hash or new.created_at is distinct from old.created_at then
      raise exception 'CAMPO_IMUTAVEL: o conteúdo da intimação vem do tribunal e não pode ser alterado.';
    end if;
    if new.status is distinct from old.status and new.status in ('tratada', 'descartada') then
      new.tratada_em := coalesce(new.tratada_em, now());
      new.tratada_por_nome := coalesce(new.tratada_por_nome, (select nome from public.perfis where id = auth.uid()));
    elsif new.status in ('nova', 'lida') then
      new.tratada_em := null; new.tratada_por_nome := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_intimacao_regras on public.intimacoes;
create trigger trg_intimacao_regras before insert or update on public.intimacoes for each row execute function public._trg_intimacao_regras();
drop trigger if exists trg_escritorio_imutavel on public.intimacoes;
create trigger trg_escritorio_imutavel before update on public.intimacoes for each row execute function public._trg_escritorio_imutavel();

alter table public.intimacoes enable row level security;
alter table public.intimacoes_sync enable row level security;
drop policy if exists "dlg le" on public.intimacoes;
create policy "dlg le" on public.intimacoes for select to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()));
drop policy if exists "dlg upd" on public.intimacoes;
create policy "dlg upd" on public.intimacoes for update to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()))
  with check (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()));
drop policy if exists "gestao del" on public.intimacoes;
create policy "gestao del" on public.intimacoes for delete to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_gestao()));
drop policy if exists "dlg le" on public.intimacoes_sync;
create policy "dlg le" on public.intimacoes_sync for select to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()));
revoke all on public.intimacoes from anon;
revoke all on public.intimacoes_sync from anon;
revoke insert on public.intimacoes from authenticated;
revoke insert, update, delete on public.intimacoes_sync from authenticated;
revoke all on function public._trg_intimacao_regras() from public, anon, authenticated;

-- auditoria só das mudanças de tratamento (a carga das comunicações não enche a trilha)
drop trigger if exists trg_auditar on public.intimacoes;
create trigger trg_auditar after update or delete on public.intimacoes for each row execute function public._trg_auditar();

-- escritório vazio continua podendo ser excluído
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
  delete from public.intimacoes where escritorio_id = p_id;
  delete from public.intimacoes_sync where escritorio_id = p_id;
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

insert into public.schema_versao (versao, nome) values (12, 'caixa de intimacoes (DJEN)') on conflict (versao) do nothing;
