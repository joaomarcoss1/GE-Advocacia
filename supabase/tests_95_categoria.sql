-- Categoria dos documentos (0009): padrão, valores aceitos e imutabilidade pelo painel (só a Edge Function reclassifica).
\set ON_ERROR_STOP on
select t.admin_db();

\echo == K1. Categoria no banco
select t.ok((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'documentos' and column_name = 'categoria') like '%outros%', 'documentos tem categoria, padrão "outros"');
insert into public.clientes (id, escritorio_id, nome) values ('00000000-0000-0000-0000-00000000c951', (select v::uuid from t.ctx where k = 'escA'), 'Cliente das categorias');
insert into public.documentos (id, escritorio_id, cliente_id, nome, mime, tamanho, storage_path, categoria)
  values ('00000000-0000-0000-0000-0000000d0951', (select v::uuid from t.ctx where k = 'escA'), '00000000-0000-0000-0000-00000000c951', 'procuracao.pdf', 'application/pdf', 100, 'esc/a/proc.pdf', 'contrato');
insert into public.documentos (id, escritorio_id, cliente_id, nome, mime, tamanho, storage_path)
  values ('00000000-0000-0000-0000-0000000d0952', (select v::uuid from t.ctx where k = 'escA'), '00000000-0000-0000-0000-00000000c951', 'scan.pdf', 'application/pdf', 100, 'esc/a/scan.pdf');
select t.ok((select categoria from public.documentos where id = '00000000-0000-0000-0000-0000000d0952') = 'outros', 'sem categoria informada, fica "outros"');
select t.falha($q$ insert into public.documentos (escritorio_id, cliente_id, nome, mime, tamanho, categoria) values ((select v::uuid from t.ctx where k = 'escA'), '00000000-0000-0000-0000-00000000c951', 'x.pdf', 'application/pdf', 1, 'inventada') $q$, 'documentos_categoria_chk', 'categoria fora da lista é recusada');

\echo == K2. O painel não troca a categoria (a Edge Function reclassifica e move a pasta do Drive)
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.falha($q$ update public.documentos set categoria = 'provas' where id = '00000000-0000-0000-0000-0000000d0951' $q$, 'DOCUMENTO_IMUTAVEL', 'nem o administrador altera a categoria pelo painel');
select t.ok((select categoria from public.documentos where id = '00000000-0000-0000-0000-0000000d0951') = 'contrato', 'e a categoria segue como estava');
select t.admin_db();
update public.documentos set categoria = 'provas' where id = '00000000-0000-0000-0000-0000000d0951';
select t.ok((select categoria from public.documentos where id = '00000000-0000-0000-0000-0000000d0951') = 'provas', 'a função de servidor (sem login) consegue reclassificar');

\echo == K3. Isolamento
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(t.n($q$ select 1 from public.documentos where categoria = 'provas' $q$) = 0, 'B não enxerga documentos de A por categoria');
select t.admin_db();
select t.ok((select max(versao) from public.schema_versao) >= 9, 'versão do esquema 9 registrada');
select 'categoria ok' as msg;
