-- Precificação de honorários (0011): só o administrador lê e grava; isolamento entre escritórios; vínculo com cliente; exclusão de escritório vazio.
\set ON_ERROR_STOP on
select t.admin_db();

\echo == H1. Estrutura
select t.ok((select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_name in ('honorarios_parametros', 'honorarios_propostas')) = 0, 'anon não tem acesso aos honorários');

\echo == H2. Administrador grava parâmetros e propostas
select t.como((select v::uuid from t.ctx where k = 'adminA'));
insert into public.honorarios_parametros (dados) values ('{"margem_pct": 30, "custos": []}'::jsonb);
update public.honorarios_parametros set dados = '{"margem_pct": 35}'::jsonb;
select t.ok((select (dados ->> 'margem_pct')::int from public.honorarios_parametros) = 35, 'parâmetros salvos e alterados');
select t.falha($q$ insert into public.honorarios_parametros (dados) values ('{}'::jsonb) $q$, 'duplicate key', 'um conjunto de parâmetros por escritório');
insert into public.clientes (id, nome) values ('00000000-0000-0000-0000-0000000ab001', 'Cliente de honorários');
insert into public.honorarios_propostas (id, cliente_id, titulo, servico, modalidade, valor_recomendado, valor_proposto, entrada, resultado)
  values ('00000000-0000-0000-0000-0000000ab101', '00000000-0000-0000-0000-0000000ab001', 'Cobrança X', 'civel_cobranca', 'parcelado', 4200.50, 4000, '{"a":1}', '{"b":2}');
select t.ok(t.n($q$ select 1 from public.honorarios_propostas $q$) = 1, 'proposta salva');
select t.falha($q$ insert into public.honorarios_propostas (titulo, servico, modalidade) values ('Ruim', 'x', 'inventada') $q$, 'violates check', 'modalidade fora da lista é recusada');
select t.falha($q$ insert into public.honorarios_propostas (titulo, servico, modalidade, valor_proposto) values ('Negativa', 'x', 'fixo', -1) $q$, 'violates check', 'valor negativo é recusado');
select t.falha($q$ insert into public.honorarios_propostas (titulo, servico, modalidade, cliente_id) values ('Cliente alheio', 'x', 'fixo', '00000000-0000-0000-0000-00000000dead') $q$, 'violates foreign key', 'cliente inexistente é recusado');
update public.honorarios_propostas set status = 'aceita' where id = '00000000-0000-0000-0000-0000000ab101';
select t.ok((select status from public.honorarios_propostas where id = '00000000-0000-0000-0000-0000000ab101') = 'aceita', 'status da proposta muda');

\echo == H3. Gerência e coordenação não veem nem gravam (dado financeiro do escritório)
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.ok(t.n($q$ select 1 from public.honorarios_parametros $q$) = 0 and t.n($q$ select 1 from public.honorarios_propostas $q$) = 0, 'gerência não lê honorários');
select t.falha($q$ insert into public.honorarios_propostas (titulo, servico, modalidade) values ('Da gerência', 'x', 'fixo') $q$, 'row-level security', 'gerência não grava proposta');
select t.sem_efeito($q$ update public.honorarios_parametros set dados = '{}'::jsonb $q$, 'gerência não altera parâmetros');
select t.como((select v::uuid from t.ctx where k = 'coordA'));
select t.ok(t.n($q$ select 1 from public.honorarios_parametros $q$) = 0 and t.n($q$ select 1 from public.honorarios_propostas $q$) = 0, 'coordenação não lê honorários');

\echo == H4. Isolamento entre escritórios
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(t.n($q$ select 1 from public.honorarios_parametros $q$) = 0 and t.n($q$ select 1 from public.honorarios_propostas $q$) = 0, 'B não vê os honorários de A');
select t.sem_efeito($q$ update public.honorarios_propostas set valor_proposto = 1 $q$, 'B não altera proposta de A');
select t.sem_efeito($q$ delete from public.honorarios_propostas $q$, 'B não exclui proposta de A');

\echo == H5. Cliente excluído não apaga a proposta (só solta o vínculo)
select t.como((select v::uuid from t.ctx where k = 'adminA'));
delete from public.clientes where id = '00000000-0000-0000-0000-0000000ab001';
select t.ok((select cliente_id from public.honorarios_propostas where id = '00000000-0000-0000-0000-0000000ab101') is null, 'proposta continua, sem cliente');

\echo == H6. Auditoria e versão
select t.admin_db();
select t.ok(exists (select 1 from public.auditoria where tabela = 'honorarios_propostas'), 'propostas ficam na auditoria');
select t.ok((select max(versao) from public.schema_versao) >= 11, 'versão do esquema 11 registrada');
select 'honorarios ok' as msg;
