-- Processos, andamentos, checklist, documentos, link do cliente e Drive: regras e isolamento entre escritórios.
\set ON_ERROR_STOP on
select t.admin_db();

\echo == R1. Clientes e processos (CNJ validado, número único por escritório)
select t.como((select v::uuid from t.ctx where k = 'adminA'));
insert into public.clientes (id, nome, tipo, documento, email) values ('00000000-0000-0000-0000-00000000c001', 'Indústria Beta Ltda', 'pj', '12.345.678/0001-95', 'beta@cliente.test');
select t.ok((select documento from public.clientes where id = '00000000-0000-0000-0000-00000000c001') = '12345678000195', 'documento é guardado sem pontuação');
insert into public.processos (id, numero, cliente_id, titulo, area, responsavel_id, tribunal)
  values ('00000000-0000-0000-0000-0000000e0001', '00012347720248260001', '00000000-0000-0000-0000-00000000c001', 'Beta x Gama', 'civel', '00000000-0000-0000-0000-00000000a001', 'tjsp');
select t.ok((select numero from public.processos where id = '00000000-0000-0000-0000-0000000e0001') = '0001234-77.2024.8.26.0001', 'número do processo é normalizado');
select t.falha($q$ insert into public.processos (numero) values ('0001234-78.2024.8.26.0001') $q$, 'PROCESSO_INVALIDO', 'dígito verificador errado é recusado');
select t.falha($q$ insert into public.processos (numero) values ('0001234-77.2024.8.26.0001') $q$, 'duplicate key', 'o mesmo processo não se cadastra duas vezes no escritório');
select t.falha($q$ insert into public.processos (numero, responsavel_id) values ('0012345-68.2025.8.10.0001', '00000000-0000-0000-0000-00000000b001') $q$, 'RESPONSAVEL_INVALIDO', 'responsável de outro escritório é recusado');
select t.falha($q$ insert into public.processos (numero, cliente_id) values ('0012345-68.2025.8.10.0001', '00000000-0000-0000-0000-0000000000ff') $q$, 'foreign key', 'cliente inexistente é recusado');
update public.processos set ultima_consulta = now(), drive_folder_id = 'forjado' where id = '00000000-0000-0000-0000-0000000e0001';
select t.ok((select ultima_consulta is null and drive_folder_id is null from public.processos where id = '00000000-0000-0000-0000-0000000e0001'), 'consulta e pasta do Drive não são forjáveis pelo painel');

\echo == R2. O mesmo número pode existir em outro escritório; B não vê nem toca nos dados de A
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(t.n('select 1 from public.clientes') = 0 and t.n('select 1 from public.processos') = 0, 'B não vê clientes nem processos de A');
select t.ok(t.n('select 1 from public.checklist_modelos') >= 7, 'B tem os próprios modelos de checklist');
insert into public.clientes (id, nome) values ('00000000-0000-0000-0000-00000000c0b1', 'Cliente de B');
insert into public.processos (id, numero, cliente_id) values ('00000000-0000-0000-0000-0000000e00b1', '0001234-77.2024.8.26.0001', '00000000-0000-0000-0000-00000000c0b1');
select t.falha($q$ insert into public.processos (numero, cliente_id) values ('0012345-68.2025.8.10.0001', '00000000-0000-0000-0000-00000000c001') $q$, 'foreign key', 'B não liga processo ao cliente de A');
select t.sem_efeito($q$ update public.clientes set nome = 'invasão' where id = '00000000-0000-0000-0000-00000000c001' $q$, 'B não altera cliente de A');
select t.sem_efeito($q$ delete from public.processos where id = '00000000-0000-0000-0000-0000000e0001' $q$, 'B não exclui processo de A');
select t.ok((select count(*) from public.processos) = 1, 'B vê só o seu processo (mesmo número)');

\echo == R3. Coordenação: cadastra e acompanha; não exclui; não lê dados pessoais
select t.como((select v::uuid from t.ctx where k = 'coordA'));
select t.ok(t.n('select 1 from public.processos') = 1, 'coordenação vê os processos do escritório');
insert into public.clientes (id, nome) values ('00000000-0000-0000-0000-00000000c002', 'Cliente da Coordenação');
select t.sem_efeito($q$ delete from public.clientes where id = '00000000-0000-0000-0000-00000000c002' $q$, 'coordenação não exclui cliente (só a gestão)');
select t.sem_acesso('funcionarios', 'coordenação continua sem ler o cadastro de pessoas');
select t.falha($q$ insert into public.checklist_modelos (nome) values ('x') $q$, 'row-level security', 'coordenação não cria modelo de checklist');
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
delete from public.clientes where id = '00000000-0000-0000-0000-00000000c002';
select t.ok(t.n('select 1 from public.clientes') = 1, 'gerência exclui cliente sem processos');

\echo == R4. Andamentos: manuais pelo painel, do tribunal só pelo servidor, imutáveis
select t.como((select v::uuid from t.ctx where k = 'adminA'));
insert into public.processo_movimentos (id, processo_id, origem, nome, data_hora, categoria, exige_acao, prazo_sugerido_dias, tarefa_id)
  values ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000e0001', 'datajud', 'Intimação recebida por e-mail', now() - interval '1 day', 'intimacao', true, 15, gen_random_uuid());
select t.ok((select origem from public.processo_movimentos where id = '00000000-0000-0000-0000-0000000a0001') = 'manual', 'o painel só registra andamento manual (não se passa por tribunal)');
select t.ok((select tarefa_id is null and not lido from public.processo_movimentos where id = '00000000-0000-0000-0000-0000000a0001'), 'vínculo com tarefa não é forjável');
select t.falha($q$ update public.processo_movimentos set nome = 'editado' where id = '00000000-0000-0000-0000-0000000a0001' $q$, 'ANDAMENTO_IMUTAVEL', 'andamento não se edita');
select t.sem_efeito($q$ delete from public.processo_movimentos where id = '00000000-0000-0000-0000-0000000a0001' $q$, 'andamento não se apaga pelo painel');
update public.processo_movimentos set lido = true where id = '00000000-0000-0000-0000-0000000a0001';
select t.ok((select lido from public.processo_movimentos where id = '00000000-0000-0000-0000-0000000a0001'), 'marcar como lido é permitido');
select t.falha($q$ insert into public.processo_movimentos (processo_id, nome, data_hora, chave) values ('00000000-0000-0000-0000-0000000e0001', 'x', now(), 'k1'), ('00000000-0000-0000-0000-0000000e0001', 'y', now(), 'k1') $q$, 'duplicate key', 'a mesma chave não entra duas vezes (sem duplicar andamento)');
select t.admin_db();
select t.falha($q$ delete from public.processo_movimentos where id = '00000000-0000-0000-0000-0000000a0001' $q$, 'ANDAMENTO_IMUTAVEL', 'nem o dono do banco apaga andamento (gatilho)');
insert into public.processo_movimentos (processo_id, escritorio_id, origem, codigo, nome, data_hora, categoria, exige_acao, prazo_sugerido_dias, chave)
  values ('00000000-0000-0000-0000-0000000e0001', (select v::uuid from t.ctx where k = 'escA'), 'datajud', 11010, 'Sentença', now() - interval '2 hours', 'sentenca', true, 15, 'datajud|11010|x');
select t.ok((select origem from public.processo_movimentos where chave = 'datajud|11010|x') = 'datajud', 'o servidor registra andamento do tribunal');
select t.ok((select ultima_movimentacao_em > now() - interval '3 hours' from public.processos where id = '00000000-0000-0000-0000-0000000e0001'), 'o processo guarda a data do último andamento');
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(t.n('select 1 from public.processo_movimentos') = 0, 'B não vê andamentos de A');
select t.sem_efeito($q$ update public.processo_movimentos set lido = true $q$, 'B não marca andamentos de A');

\echo == R5. Tarefas ligadas ao processo (e criação automática sem duplicar)
select t.como((select v::uuid from t.ctx where k = 'adminA'));
insert into public.tarefas (id, titulo, processo_id, responsavel_id) values ('00000000-0000-0000-0000-0000000d0501', 'Analisar sentença', '00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000a001');
select t.ok((select processo_numero = '0001234-77.2024.8.26.0001' and cliente = 'Indústria Beta Ltda' and area = 'civel' from public.tarefas where id = '00000000-0000-0000-0000-0000000d0501'), 'tarefa herda número, cliente e área do processo');
select t.falha($q$ insert into public.tarefas (titulo, processo_id) values ('x', '00000000-0000-0000-0000-0000000e00b1') $q$, 'PROCESSO_INVALIDO', 'tarefa não liga a processo de outro escritório');
select t.admin_db();
update public.tarefas set origem_movimento_id = (select id from public.processo_movimentos where chave = 'datajud|11010|x') where id = '00000000-0000-0000-0000-0000000d0501';
select t.falha($q$ insert into public.tarefas (escritorio_id, titulo, origem_movimento_id) values ((select v::uuid from t.ctx where k = 'escA'), 'duplicada', (select id from public.processo_movimentos where chave = 'datajud|11010|x')) $q$, 'duplicate key', 'um andamento gera no máximo uma tarefa');
select t.falha($q$ delete from public.processos where id = '00000000-0000-0000-0000-0000000e0001' $q$, 'foreign key', 'processo com tarefas não é excluído');

\echo == R6. Checklist por modelo (idempotente) e isolamento
select t.como((select v::uuid from t.ctx where k = 'coordA'));
select t.ok(checklist_aplicar((select id from public.checklist_modelos where nome = 'Trabalhista'), '00000000-0000-0000-0000-0000000e0001') = 10, 'modelo Trabalhista cria 10 itens no processo');
select t.ok(checklist_aplicar((select id from public.checklist_modelos where nome = 'Trabalhista'), '00000000-0000-0000-0000-0000000e0001') = 0, 'aplicar de novo não duplica');
select t.ok((select count(*) from public.checklist_itens where processo_id = '00000000-0000-0000-0000-0000000e0001' and cliente_id = '00000000-0000-0000-0000-00000000c001') = 10, 'itens carregam o cliente do processo');
select t.ok((select count(*) from public.checklist_itens where processo_id = '00000000-0000-0000-0000-0000000e0001' and not obrigatorio) = 1, 'item opcional respeitado');
select t.ok(checklist_aplicar((select id from public.checklist_modelos where nome = 'Geral'), null, '00000000-0000-0000-0000-00000000c001') = 5, 'modelo também vale para o cliente (sem processo)');
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.falha($q$ select checklist_aplicar((select id from public.checklist_modelos limit 1), '00000000-0000-0000-0000-0000000e0001') $q$, 'NAO_ENCONTRADO', 'B não aplica checklist em processo de A');
select t.ok(t.n('select 1 from public.checklist_itens') = 0, 'B não vê itens de A');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
update public.checklist_itens set status = 'dispensado' where processo_id = '00000000-0000-0000-0000-0000000e0001' and nome like 'Provas%';
select t.ok((select status from public.checklist_itens where processo_id = '00000000-0000-0000-0000-0000000e0001' and nome like 'Provas%') = 'dispensado', 'item pode ser dispensado');

\echo == R7. Documentos: chegam só pelo servidor; painel confere; acesso registrado
select t.falha($q$ insert into public.documentos (cliente_id, nome, mime, tamanho, storage_path) values ('00000000-0000-0000-0000-00000000c001', 'x.pdf', 'application/pdf', 10, 'p') $q$, 'row-level security', 'o painel não grava documento direto (só a Edge Function)');
select t.admin_db();
insert into public.documentos (id, escritorio_id, cliente_id, processo_id, item_id, nome, mime, tamanho, storage_path, origem, drive_status)
  values ('00000000-0000-0000-0000-0000000d0f01', (select v::uuid from t.ctx where k = 'escA'), '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000e0001',
          (select id from public.checklist_itens where processo_id = '00000000-0000-0000-0000-0000000e0001' and nome = 'Carteira de trabalho (CTPS)'),
          'ctps.pdf', 'application/pdf', 1234, 'esc/a/ctps.pdf', 'link_cliente', 'pendente');
select t.ok((select status from public.checklist_itens where processo_id = '00000000-0000-0000-0000-0000000e0001' and nome = 'Carteira de trabalho (CTPS)') = 'recebido', 'item da checklist vira "recebido" quando chega o arquivo');
select t.falha($q$ insert into public.documentos (escritorio_id, cliente_id, processo_id, nome, mime, tamanho) values ((select v::uuid from t.ctx where k = 'escA'), '00000000-0000-0000-0000-00000000c0b1', '00000000-0000-0000-0000-0000000e0001', 'x', 'application/pdf', 1) $q$, 'CLIENTE_DIFERENTE', 'documento não mistura cliente de outro escritório');
insert into public.clientes (id, escritorio_id, nome) values ('00000000-0000-0000-0000-00000000c003', (select v::uuid from t.ctx where k = 'escA'), 'Outro Cliente');
insert into public.checklist_itens (id, escritorio_id, cliente_id, nome) values ('00000000-0000-0000-0000-0000000b0003', (select v::uuid from t.ctx where k = 'escA'), '00000000-0000-0000-0000-00000000c003', 'RG do outro cliente');
select t.falha($q$ insert into public.documentos (escritorio_id, cliente_id, processo_id, item_id, nome, mime, tamanho) values ((select v::uuid from t.ctx where k = 'escA'), '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000b0003', 'x', 'application/pdf', 1) $q$, 'ITEM_INVALIDO', 'item de checklist de outro cliente é recusado');
select t.como((select v::uuid from t.ctx where k = 'coordA'));
update public.documentos set conferido = true where id = '00000000-0000-0000-0000-0000000d0f01';
select t.ok((select conferido and conferido_por is not null and conferido_em is not null from public.documentos where id = '00000000-0000-0000-0000-0000000d0f01'), 'conferência registra quem e quando');
select t.falha($q$ update public.documentos set nome = 'outro.pdf' where id = '00000000-0000-0000-0000-0000000d0f01' $q$, 'DOCUMENTO_IMUTAVEL', 'metadados do documento não se alteram');
select t.falha($q$ update public.documentos set drive_status = 'enviado', drive_link = 'http://x' where id = '00000000-0000-0000-0000-0000000d0f01' $q$, 'DOCUMENTO_IMUTAVEL', 'o painel não forja envio ao Drive');
select t.sem_efeito($q$ delete from public.documentos where id = '00000000-0000-0000-0000-0000000d0f01' $q$, 'coordenação não exclui documento');
select t.ok((documento_abrir('00000000-0000-0000-0000-0000000d0f01') ->> 'storage_path') = 'esc/a/ctps.pdf', 'abrir devolve o caminho para a URL assinada');
select t.ok((select count(*) from public.documentos_acessos) = 0, 'a coordenação abre documentos mas não lê o histórico de acessos (só a gestão)');
select t.falha($q$ insert into public.documentos_acessos (escritorio_id, documento_id, usuario) values (gen_random_uuid(), gen_random_uuid(), 'x') $q$, 'permission denied', 'ninguém forja o registro de acessos');
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(t.n('select 1 from public.documentos') = 0, 'B não vê documentos de A');
select t.falha($q$ select documento_abrir('00000000-0000-0000-0000-0000000d0f01') $q$, 'NAO_ENCONTRADO', 'B não abre documento de A');
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.ok(t.n('select 1 from public.documentos_acessos') = 1, 'cada abertura fica registrada e a gerência consulta o histórico');
delete from public.documentos where id = '00000000-0000-0000-0000-0000000d0f01';
select t.ok((select status from public.checklist_itens where processo_id = '00000000-0000-0000-0000-0000000e0001' and nome = 'Carteira de trabalho (CTPS)') = 'pendente', 'excluir o único arquivo devolve o item a "pendente"');
select t.admin_db();
select t.ok((select count(*) from public.documentos_lixeira where storage_path = 'esc/a/ctps.pdf') = 1, 'o arquivo vai para a lixeira (removido do Storage depois)');

\echo == R8. Link do cliente: token só no momento da criação; no banco, só o hash
select t.como((select v::uuid from t.ctx where k = 'coordA'));
do $$
declare r jsonb;
begin
  r := link_criar('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000e0001', 7, 'Documentos iniciais');
  perform t.ok(length(r ->> 'token') = 48, 'token de 192 bits');
  perform t.ok((select expira_em between now() + interval '6 days' and now() + interval '8 days' from public.documento_links where id = (r ->> 'id')::uuid), 'expira no prazo pedido');
  perform set_config('t.link', r ->> 'id', false);
  perform set_config('t.token', r ->> 'token', false);
end $$;
select t.admin_db();
select t.ok((select token_hash = encode(extensions.digest(current_setting('t.token'), 'sha256'), 'hex') and token_hash <> current_setting('t.token') from public.documento_links where id = current_setting('t.link')::uuid), 'o banco guarda só o hash do token');
select t.como((select v::uuid from t.ctx where k = 'coordA'));
select t.falha($q$ insert into public.documento_links (cliente_id, token_hash, expira_em) values ('00000000-0000-0000-0000-00000000c001', 'abc', now() + interval '1 day') $q$, 'permission denied', 'ninguém cria link direto (sem passar pela função)');
select t.falha($q$ update public.documento_links set expira_em = now() + interval '9 years' $q$, 'permission denied', 'ninguém estende a validade direto');
select t.falha($q$ select link_criar('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000e00b1') $q$, 'NAO_ENCONTRADO', 'processo de outro cliente/escritório é recusado');
select t.ok((select count(*) from public.documento_links) = 1, 'a coordenação vê os links do escritório');
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(t.n('select 1 from public.documento_links') = 0, 'B não vê links de A');
select t.falha($q$ select link_revogar(current_setting('t.link')::uuid) $q$, 'NAO_ENCONTRADO', 'B não revoga link de A');
select t.como((select v::uuid from t.ctx where k = 'coordA'));
select link_revogar(current_setting('t.link')::uuid);
select t.ok(not (select ativo from public.documento_links where id = current_setting('t.link')::uuid), 'link revogado');

\echo == R9. Google Drive do escritório: token fora do alcance da API
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.sem_acesso('drive_conexoes', 'ninguém lê o token do Drive pela API');
select t.falha($q$ insert into public.drive_conexoes (escritorio_id, refresh_token_enc) values ((select v::uuid from t.ctx where k = 'escA'), 'x') $q$, 'permission denied', 'ninguém grava token do Drive pela API');
select t.ok((drive_status() ->> 'conectado') = 'false', 'sem conexão por padrão');
select t.admin_db();
insert into public.drive_conexoes (escritorio_id, email_google, refresh_token_enc, pasta_raiz_id) values ((select v::uuid from t.ctx where k = 'escA'), 'banca@gmail.test', 'cifrado', 'raiz1');
select t.como((select v::uuid from t.ctx where k = 'coordA'));
select t.ok((drive_status() ->> 'conectado') = 'true' and not (drive_status()::text like '%cifrado%'), 'coordenação vê que está conectado, sem token');
select t.falha($q$ select drive_desconectar() $q$, 'SEM_PERMISSAO', 'só o administrador desconecta o Drive');
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok((drive_status() ->> 'conectado') = 'false', 'B não herda o Drive de A');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select drive_desconectar();
select t.admin_db();
select t.ok((select count(*) from public.drive_conexoes) = 0, 'desconectar apaga o token');

\echo == R10. Auditoria sem valores sensíveis
select t.como((select v::uuid from t.ctx where k = 'adminA'));
update public.clientes set documento = '98.765.432/0001-10', telefone = '(98) 99999-0000' where id = '00000000-0000-0000-0000-00000000c001';
select t.admin_db();
select t.ok((select count(*) from public.auditoria where tabela = 'clientes' and (depois::text like '%9876543200010%' or antes::text like '%12345678000195%' or depois::text like '%99999-0000%' or antes::text like '%beta@cliente%')) = 0, 'CPF/CNPJ, telefone e e-mail do cliente não vão para a trilha');
select t.ok((select count(*) from public.auditoria where tabela = 'clientes' and detalhe like '%documento%') >= 1, 'mas o nome do campo alterado fica registrado');
select t.ok((select count(*) from public.auditoria where tabela = 'funcionarios' and (depois::text like '%salario_mensal%' or antes::text like '%salario_mensal%')) = 0, 'salário de funcionário também não vai para a trilha');
select t.ok((select count(*) from public.auditoria where tabela = 'processos' and detalhe like '%0001234-77%') >= 1, 'processo é identificado pelo número');

\echo == R11. Escritório com clientes/processos não é excluído; vazio sai por inteiro
select t.como('00000000-0000-0000-0000-0000000000f1');
select plataforma_criar_escritorio('Vazio Teste', 'vazio-t', 'Admin V', 'admin.v@t.com', 'segredo123');
select t.admin_db();
select t.ok((select count(*) from public.checklist_modelos where escritorio_id = t.id_esc('vazio-t')) >= 7, 'escritório novo já nasce com os modelos de checklist');
insert into public.clientes (escritorio_id, nome) values (t.id_esc('vazio-t'), 'Cliente V');
select t.como('00000000-0000-0000-0000-0000000000f1');
select t.falha($q$ select plataforma_excluir_escritorio(t.id_esc('vazio-t')) $q$, 'ESCRITORIO_COM_DADOS', 'escritório com cliente cadastrado não é excluído');
select t.admin_db();
delete from public.clientes where escritorio_id = t.id_esc('vazio-t');
select t.como('00000000-0000-0000-0000-0000000000f1');
select plataforma_excluir_escritorio(t.id_esc('vazio-t'));
select t.admin_db();
select t.ok(t.id_esc('vazio-t') is null, 'escritório vazio é excluído por inteiro (inclusive os modelos)');
select 'processos e documentos ok' as msg;
