-- Modelos de documentos (0010): quem delega lê; só a gestão grava; isolamento entre escritórios; versão sobe quando o texto muda.
\set ON_ERROR_STOP on
select t.admin_db();

\echo == M1. Estrutura
select t.ok(exists (select 1 from information_schema.columns where table_name = 'clientes' and column_name = 'estado_civil'), 'cliente tem os dados de qualificação');
select t.ok(exists (select 1 from information_schema.columns where table_name = 'checklist_modelos' and column_name = 'tipo'), 'modelo de lista tem tipo de processo');
select t.ok((select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_name = 'modelos_documentos') = 0, 'anon não tem acesso aos modelos');

\echo == M2. Gestão grava; coordenação lê mas não grava
select t.como((select v::uuid from t.ctx where k = 'adminA'));
insert into public.modelos_documentos (id, titulo, categoria, conteudo) values ('00000000-0000-0000-0000-0000000f0001', 'Procuração padrão', 'procuracoes', '# PROCURAÇÃO\n\nOutorgante: {{cliente.nome}}, para fins de representação.');
select t.ok((select versao from public.modelos_documentos where id = '00000000-0000-0000-0000-0000000f0001') = 1, 'nasce na versão 1');
update public.modelos_documentos set descricao = 'só a descrição' where id = '00000000-0000-0000-0000-0000000f0001';
select t.ok((select versao from public.modelos_documentos where id = '00000000-0000-0000-0000-0000000f0001') = 1, 'mudar a descrição não muda a versão');
update public.modelos_documentos set conteudo = '# PROCURAÇÃO\n\nOutorgante: {{cliente.nome}}, com poderes gerais para o foro.' where id = '00000000-0000-0000-0000-0000000f0001';
select t.ok((select versao from public.modelos_documentos where id = '00000000-0000-0000-0000-0000000f0001') = 2, 'mudar o texto sobe a versão');
select t.falha($q$ insert into public.modelos_documentos (titulo, categoria, conteudo) values ('Procuração padrão', 'procuracoes', 'texto repetido com mais de vinte caracteres') $q$, 'duplicate key', 'título repetido no mesmo escritório é recusado');
select t.falha($q$ insert into public.modelos_documentos (titulo, categoria, conteudo) values ('Curto', 'procuracoes', 'x') $q$, 'violates check', 'conteúdo curto demais é recusado');
select t.falha($q$ insert into public.modelos_documentos (titulo, categoria, conteudo) values ('Categoria errada', 'inventada', 'texto com mais de vinte caracteres, ok') $q$, 'violates check', 'categoria fora da lista é recusada');

select t.como((select v::uuid from t.ctx where k = 'coordA'));
select t.ok(t.n($q$ select 1 from public.modelos_documentos $q$) = 1, 'coordenação lê o modelo');
select t.falha($q$ insert into public.modelos_documentos (titulo, categoria, conteudo) values ('Da coordenação', 'procuracoes', 'texto com mais de vinte caracteres, ok') $q$, 'row-level security', 'coordenação não cria modelo');
select t.sem_efeito($q$ update public.modelos_documentos set titulo = 'Alterado' where id = '00000000-0000-0000-0000-0000000f0001' $q$, 'coordenação não altera modelo');
select t.sem_efeito($q$ delete from public.modelos_documentos where id = '00000000-0000-0000-0000-0000000f0001' $q$, 'coordenação não exclui modelo');

\echo == M3. Isolamento
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(t.n($q$ select 1 from public.modelos_documentos $q$) = 0, 'B não vê os modelos de A');
select t.sem_efeito($q$ update public.modelos_documentos set titulo = 'Tomado por B' where id = '00000000-0000-0000-0000-0000000f0001' $q$, 'B não altera o modelo de A');
select t.admin_db();
select t.ok((select max(versao) from public.schema_versao) >= 10, 'versão do esquema 10 registrada');
select 'modelos ok' as msg;
