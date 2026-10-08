-- 0010 · Modelos de documentos (peças, contratos, procurações), listas de documentos por tipo de processo e qualificação do cliente
--  * modelos_documentos: o administrador/gerência guarda; quem delega (inclusive coordenação, advogados e estagiários com acesso) lê e baixa
--  * checklist_modelos ganha "tipo" (ex.: Reclamação trabalhista) e descrição
--  * clientes ganha os dados usados nas peças (RG, estado civil, profissão, nacionalidade, endereço)

alter table public.clientes add column if not exists rg text check (rg is null or length(rg) <= 40);
alter table public.clientes add column if not exists estado_civil text check (estado_civil is null or length(estado_civil) <= 40);
alter table public.clientes add column if not exists profissao text check (profissao is null or length(profissao) <= 80);
alter table public.clientes add column if not exists nacionalidade text check (nacionalidade is null or length(nacionalidade) <= 60);
alter table public.clientes add column if not exists endereco text check (endereco is null or length(endereco) <= 300);

alter table public.checklist_modelos add column if not exists tipo text check (tipo is null or length(btrim(tipo)) between 2 and 120);
alter table public.checklist_modelos add column if not exists descricao text check (descricao is null or length(descricao) <= 400);

create table if not exists public.modelos_documentos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  titulo text not null check (length(btrim(titulo)) between 2 and 160),
  categoria text not null default 'manifestacoes' check (categoria in ('procuracoes', 'contratos', 'iniciais', 'defesas', 'recursos', 'manifestacoes', 'execucao', 'extrajudicial', 'acordos', 'cliente', 'interno')),
  area text check (area is null or area in ('civel', 'trabalhista', 'tributario', 'criminal', 'familia', 'empresarial', 'previdenciario', 'administrativo', 'outro')),
  descricao text check (descricao is null or length(descricao) <= 400),
  conteudo text not null check (length(conteudo) between 20 and 80000),
  ativo boolean not null default true,
  versao int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (escritorio_id, id),
  unique (escritorio_id, titulo)
);
create index if not exists modelos_documentos_cat_idx on public.modelos_documentos (escritorio_id, categoria, titulo);

-- a versão sobe quando o texto muda (para saber qual redação foi usada)
create or replace function public._trg_modelo_versao() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.conteudo is distinct from old.conteudo then new.versao := old.versao + 1; end if;
  return new;
end $$;
drop trigger if exists trg_modelo_versao on public.modelos_documentos;
create trigger trg_modelo_versao before update on public.modelos_documentos for each row execute function public._trg_modelo_versao();

alter table public.modelos_documentos enable row level security;
drop trigger if exists trg_escritorio_imutavel on public.modelos_documentos;
create trigger trg_escritorio_imutavel before update on public.modelos_documentos for each row execute function public._trg_escritorio_imutavel();
drop policy if exists "dlg le" on public.modelos_documentos;
create policy "dlg le" on public.modelos_documentos for select to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_delegante()));
drop policy if exists "gestao esc" on public.modelos_documentos;
create policy "gestao esc" on public.modelos_documentos for all to authenticated using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_gestao()))
  with check (escritorio_id = (select public.meu_escritorio()) and (select public.eh_gestao()));
revoke all on public.modelos_documentos from anon;
select public._auditar_tabela('modelos_documentos');

insert into public.schema_versao (versao, nome) values (10, 'modelos de documentos e listas por tipo') on conflict (versao) do nothing;
