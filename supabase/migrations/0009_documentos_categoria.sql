-- 0009 · Organização dos documentos: categoria (vira subpasta no Drive) e busca de duplicados
-- A categoria é definida ao receber o arquivo (sugerida pelo nome/item) e só a Edge Function a altera depois
-- (ela também move o arquivo de pasta no Drive); pelo painel o documento continua imutável.

alter table public.documentos add column if not exists categoria text not null default 'outros';
alter table public.documentos drop constraint if exists documentos_categoria_chk;
alter table public.documentos add constraint documentos_categoria_chk
  check (categoria in ('contrato', 'pessoais', 'peticoes', 'decisoes', 'audiencias', 'provas', 'financeiro', 'outros'));

-- aviso de arquivo repetido e conferência de integridade usam o hash
create index if not exists documentos_sha_idx on public.documentos (escritorio_id, sha256) where sha256 is not null;
create index if not exists documentos_categoria_idx on public.documentos (escritorio_id, categoria);

insert into public.schema_versao (versao, nome) values (9, 'categoria dos documentos') on conflict (versao) do nothing;
