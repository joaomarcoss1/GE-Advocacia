-- O CORAÇÃO DO PROJETO: um escritório jamais enxerga, altera ou liga-se aos dados de outro.
\set ON_ERROR_STOP on
\set escA `psql -X -At -d "$GE_TEST_DB" -c "select v from t.ctx where k='escA'"`
select t.admin_db();

-- Massa de dados em AMBOS os escritórios (inserida como dono do banco)
do $$
declare ea uuid := (select v::uuid from t.ctx where k = 'escA'); eb uuid := (select v::uuid from t.ctx where k = 'escB');
        fa uuid := '00000000-0000-0000-0000-00000000a001'; fb uuid := '00000000-0000-0000-0000-00000000b001';
        oa uuid := '00000000-0000-0000-0000-0000000000a9'; ob uuid := '00000000-0000-0000-0000-0000000000b9';
        ra uuid := '00000000-0000-0000-0000-0000000000a8'; rb uuid := '00000000-0000-0000-0000-0000000000b8';
begin
  insert into public.registros_ponto (id, escritorio_id, funcionario_id, data, tipo, horario_previsto, diferenca_minutos, status, status_aprovacao)
    values (ra, ea, fa, current_date - 3, 'entrada', '08:00', 0, 'no_horario', 'pendente'), (rb, eb, fb, current_date - 3, 'entrada', '08:00', 0, 'no_horario', 'pendente');
  insert into public.ocorrencias (id, escritorio_id, funcionario_id, data_inicio, data_fim, tipo) values (oa, ea, fa, current_date - 5, current_date - 5, 'atestado'), (ob, eb, fb, current_date - 5, current_date - 5, 'atestado');
  insert into public.ajustes_folha (escritorio_id, funcionario_id, data, tipo, valor, motivo) values (ea, fa, current_date - 2, 'adicional', 100, 'x'), (eb, fb, current_date - 2, 'adicional', 100, 'x');
  insert into public.ajustes_dia (escritorio_id, funcionario_id, data, situacao) values (ea, fa, current_date - 2, 'falta'), (eb, fb, current_date - 2, 'falta');
  insert into public.folhas (escritorio_id, funcionario_id, periodo_inicio, periodo_fim) values (ea, fa, date_trunc('month', current_date - 200)::date, (date_trunc('month', current_date - 200) + interval '1 month - 1 day')::date), (eb, fb, date_trunc('month', current_date - 200)::date, (date_trunc('month', current_date - 200) + interval '1 month - 1 day')::date);
  insert into public.feriados (escritorio_id, data, nome, tipo) values (ea, current_date + 10, 'Feriado A', 'municipal'), (eb, current_date + 10, 'Feriado B', 'municipal');
  insert into public.anexos (id, escritorio_id, funcionario_id, ocorrencia_id, nome, mime, tamanho, storage_path)
    values ('00000000-0000-0000-0000-0000000000aa', ea, fa, oa, 'atestado-a.pdf', 'application/pdf', 1000, ea::text || '/' || fa::text || '/x'),
           ('00000000-0000-0000-0000-0000000000bb', eb, fb, ob, 'atestado-b.pdf', 'application/pdf', 1000, eb::text || '/' || fb::text || '/x');
  insert into public.documentos_emitidos (codigo, escritorio_id, tipo, titulo, periodo, hash, emitido_por)
    values ('AAAA-AAAA-AAAA', ea, 'folha', 'Folha A', '2026-01', repeat('a', 64), 'Administração'), ('BBBB-BBBB-BBBB', eb, 'folha', 'Folha B', '2026-01', repeat('b', 64), 'Administração');
end $$;

\echo == 1. Administrador do escritório A só enxerga o escritório A (todas as tabelas de negócio)
select t.como((select v::uuid from t.ctx where k = 'adminA'));
do $$
declare ea text := (select v from t.ctx where k = 'escA'); tb text;
begin
  foreach tb in array array['cargos','escalas','funcionarios','registros_ponto','ocorrencias','feriados','ajustes_folha','ajustes_dia','folhas','configuracoes','auditoria','anexos','documentos_emitidos','perfis'] loop
    perform t.ok(t.n(format('select 1 from public.%I where escritorio_id <> %L::uuid', tb, ea)) = 0, 'A não vê linhas de outro escritório em ' || tb);
    perform t.ok(t.n(format('select 1 from public.%I', tb)) > 0, 'A vê as próprias linhas em ' || tb);
  end loop;
  perform t.ok(t.n('select 1 from public.escritorios') = 1, 'A vê só o próprio escritório na tabela escritorios');
  perform t.ok(t.n('select 1 from public.funcionarios where nome like ''Bia%'' or nome like ''Caio%''') = 0, 'A não encontra funcionários de B pelo nome');
  perform t.sem_acesso('funcionario_pins', 'ninguém lê hashes de PIN pela API');
  perform t.sem_acesso('pin_tentativas', 'ninguém lê tentativas de PIN pela API');
end $$;

\echo == 2. A não grava, altera nem apaga nada de B
select t.falha($q$ insert into public.funcionarios (escritorio_id, nome) values ((select v::uuid from t.ctx where k='escB'), 'Intruso') $q$, 'row-level security', 'A não insere funcionário no escritório B');
select t.falha($q$ insert into public.cargos (escritorio_id, nome, categoria) values ((select v::uuid from t.ctx where k='escB'), 'Cargo intruso', 'apoio') $q$, 'row-level security', 'A não insere cargo em B');
select t.falha($q$ insert into public.feriados (escritorio_id, data, nome, tipo) values ((select v::uuid from t.ctx where k='escB'), current_date + 77, 'x', 'nacional') $q$, 'row-level security', 'A não insere feriado em B');
select t.falha($q$ insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo) values ((select v::uuid from t.ctx where k='escB'), '00000000-0000-0000-0000-00000000b001', current_date - 1, 'entrada') $q$, 'row-level security', 'A não insere marcação em B');
select t.sem_efeito($q$ update public.funcionarios set nome = 'hack' where id = '00000000-0000-0000-0000-00000000b001' $q$, 'A não atualiza funcionário de B (0 linhas)');
select t.sem_efeito($q$ delete from public.funcionarios where id = '00000000-0000-0000-0000-00000000b001' $q$, 'A não apaga funcionário de B (0 linhas)');
select t.sem_efeito($q$ update public.ocorrencias set observacao = 'hack' where id = '00000000-0000-0000-0000-0000000000b9' $q$, 'A não atualiza ocorrência de B');
select t.sem_efeito($q$ delete from public.anexos where id = '00000000-0000-0000-0000-0000000000bb' $q$, 'A não apaga anexo de B');
select t.sem_efeito($q$ update public.configuracoes set dados = '{}' where escritorio_id = (select v::uuid from t.ctx where k='escB') $q$, 'A não altera configurações de B');

\echo == 3. Não é possível "mover" uma linha para outro escritório
select t.falha($q$ update public.funcionarios set escritorio_id = (select v::uuid from t.ctx where k='escB') where id = '00000000-0000-0000-0000-00000000a001' $q$, 'ESCRITORIO_IMUTAVEL', 'A não move o próprio funcionário para B');
select t.admin_db();
select t.falha($q$ update public.funcionarios set escritorio_id = (select v::uuid from t.ctx where k='escB') where id = '00000000-0000-0000-0000-00000000a002' $q$, 'ESCRITORIO_IMUTAVEL', 'nem o dono do banco troca o escritorio_id (gatilho)');

\echo == 4. Chaves compostas: nenhum vínculo cruza escritórios (mesmo vindo do dono do banco)
select t.falha($q$ insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo) values ((select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000b001', current_date - 20, 'entrada') $q$, 'foreign key', 'marcação de A não aponta para funcionário de B');
select t.falha($q$ update public.funcionarios set cargo_id = (select id from public.cargos where escritorio_id = (select v::uuid from t.ctx where k='escB') limit 1) where id = '00000000-0000-0000-0000-00000000a002' $q$, 'foreign key', 'funcionário de A não usa cargo de B');
select t.falha($q$ update public.funcionarios set escala_id = (select id from public.escalas where escritorio_id = (select v::uuid from t.ctx where k='escB') limit 1) where id = '00000000-0000-0000-0000-00000000a002' $q$, 'foreign key', 'funcionário de A não usa escala de B');
select t.falha($q$ insert into public.ocorrencias (escritorio_id, funcionario_id, data_inicio, data_fim, tipo) values ((select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000b001', current_date, current_date, 'outro') $q$, 'foreign key', 'ocorrência de A não aponta para funcionário de B');
select t.falha($q$ insert into public.anexos (escritorio_id, funcionario_id, ocorrencia_id, nome, mime, tamanho) values ((select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000b9', 'x.pdf', 'application/pdf', 10) $q$, 'foreign key', 'anexo de A não aponta para ocorrência de B');
select t.falha($q$ insert into public.folhas (escritorio_id, funcionario_id, periodo_inicio, periodo_fim) values ((select v::uuid from t.ctx where k='escA'), '00000000-0000-0000-0000-00000000b001', '2000-01-01', '2000-01-31') $q$, 'foreign key', 'folha de A não aponta para funcionário de B');

\echo == 5. Funções (RPC) respeitam o escritório
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.falha($q$ select definir_pin('00000000-0000-0000-0000-00000000b001', '674839') $q$, 'NAO_ENCONTRADO', 'A não define PIN de funcionário de B');
select t.falha($q$ select aprovar_ponto('00000000-0000-0000-0000-0000000000b8', 'aprovar') $q$, 'NAO_ENCONTRADO', 'A não aprova marcação de B');
select t.ok(t.n('select 1 from equipe() where nome like ''Bia%'' or nome like ''Caio%''') = 0, 'equipe() de A não lista ninguém de B');
select t.ok(t.n('select 1 from equipe()') = 2, 'equipe() de A lista os 2 funcionários de A');
select t.falha($q$ select atualizar_usuario((select v::uuid from t.ctx where k='adminB'), 'x', 'gerente', false) $q$, 'NAO_ENCONTRADO', 'A não rebaixa/desativa admin de B');
select t.falha($q$ select redefinir_senha_usuario((select v::uuid from t.ctx where k='adminB'), 'novaSenha123') $q$, 'NAO_ENCONTRADO', 'A não redefine senha de usuário de B');
select t.falha($q$ select remover_usuario((select v::uuid from t.ctx where k='adminB')) $q$, 'NAO_ENCONTRADO', 'A não remove usuário de B');
select t.falha($q$ select anexo_abrir('00000000-0000-0000-0000-0000000000bb') $q$, 'NAO_ENCONTRADO', 'A não abre atestado de B');
select t.ok((select anexo_abrir('00000000-0000-0000-0000-0000000000aa') ->> 'ok') = 'true', 'A abre o atestado de A');
select t.ok(t.n('select 1 from public.acessos_sensiveis') = 1 and t.n('select 1 from public.acessos_sensiveis where escritorio_id <> (select public.meu_escritorio())') = 0, 'a abertura ficou registrada só no escritório de A');
select t.falha($q$ select plataforma_listar_escritorios() $q$, 'SEM_PERMISSAO', 'admin de escritório não usa a área da plataforma');
select t.falha($q$ select plataforma_criar_escritorio('X Y', 'xy-t', 'N', 'n@t.com', 'segredo123') $q$, 'SEM_PERMISSAO', 'admin de escritório não cria escritório');
select t.falha($q$ select plataforma_redefinir_senha((select v::uuid from t.ctx where k='adminB'), 'novaSenha123') $q$, 'SEM_PERMISSAO', 'admin de escritório não usa a redefinição da plataforma');
select t.ok((expurgo_executar(false) ->> 'ok') = 'true', 'prévia do expurgo roda só no escritório de A');

\echo == 6. Gerência (A) lê só o escritório A e não vê dados sensíveis
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.ok(t.n('select 1 from public.funcionarios') = 0, 'gerência não lê funcionarios (salários/CPF) direto');
select t.ok(t.n('select 1 from public.folhas') = 0, 'gerência não lê folhas');
select t.ok(t.n('select 1 from public.anexos') = 0, 'gerência não lê anexos');
select t.ok(t.n('select 1 from public.registros_ponto') = 1, 'gerência lê as marcações do próprio escritório');
select t.ok(t.n('select 1 from public.registros_ponto where escritorio_id <> (select public.meu_escritorio())') = 0, 'gerência não lê marcações de B');
select t.falha($q$ select criar_usuario('x@t.com','segredo123','X','gerente') $q$, 'SEM_PERMISSAO', 'gerência não cria usuário');
select t.falha($q$ select anexo_abrir('00000000-0000-0000-0000-0000000000aa') $q$, 'SEM_PERMISSAO', 'gerência não abre atestado');

\echo == 7. Plataforma gerencia escritórios, mas NÃO enxerga dados deles
select t.como('00000000-0000-0000-0000-0000000000f1');
select t.ok(jsonb_array_length(plataforma_listar_escritorios()) >= 2, 'plataforma lista os escritórios');
select t.ok(t.n('select 1 from public.funcionarios') = 0, 'plataforma não lê funcionários');
select t.ok(t.n('select 1 from public.registros_ponto') = 0, 'plataforma não lê ponto');
select t.ok(t.n('select 1 from public.folhas') = 0, 'plataforma não lê folhas');
select t.ok(t.n('select 1 from public.anexos') = 0, 'plataforma não lê atestados');
select t.ok(t.n('select 1 from public.ocorrencias') = 0, 'plataforma não lê ocorrências');
select t.ok(t.n('select 1 from public.auditoria') = 0, 'plataforma não lê a auditoria dos escritórios');
select t.ok(t.n('select 1 from public.configuracoes') = 0, 'plataforma não lê configurações dos escritórios');
select t.falha($q$ select equipe() $q$, 'SEM_PERMISSAO', 'plataforma não chama equipe()');
select t.falha($q$ select definir_pin('00000000-0000-0000-0000-00000000a001', '674839') $q$, 'SEM_PERMISSAO', 'plataforma não define PIN');
select t.ok(t.n('select 1 from public.plataforma_listar_usuarios((select v::uuid from t.ctx where k=''escA''))') = 2, 'plataforma vê quem tem acesso (admin + gerente), nada além');

\echo == 8. Anônimo (tela de ponto) não lê tabela nenhuma
select t.anon();
do $$
declare tb text;
begin
  foreach tb in array array['cargos','escalas','funcionarios','funcionario_pins','pin_tentativas','registros_ponto','ocorrencias','feriados','ajustes_folha','ajustes_dia','folhas','configuracoes','perfis','auditoria','anexos','documentos_emitidos','escritorios','plataforma_admins','acessos_sensiveis','anexos_lixeira'] loop
    perform t.sem_acesso(tb, 'anon não lê ' || tb);
  end loop;
end $$;
select t.falha($q$ select equipe() $q$, 'permission denied', 'anon não chama equipe()');

\echo == 9. Tela pública de ponto: busca e contexto são POR escritório
select t.anon();
select t.ok(t.n('select 1 from ponto_buscar(''almeida-t'', ''ana'')') = 1, 'em /ponto/almeida-t, "ana" acha só Ana Pontual');
select t.ok(t.n('select 1 from ponto_buscar(''barbosa-t'', ''ana'')') = 1 and t.v('select nome from ponto_buscar(''barbosa-t'', ''ana'')') = 'Caio Ana Barbosa', 'em /ponto/barbosa-t, "ana" acha só Caio Ana (de B)');
select t.ok(t.n('select 1 from ponto_buscar(''almeida-t'', ''bia'')') = 0, 'Bia (de B) não aparece no ponto de A');
select t.ok(t.n('select 1 from ponto_buscar(''inexistente'', ''ana'')') = 0, 'slug inexistente não devolve ninguém');
select t.ok(t.n('select 1 from ponto_buscar(''almeida-t'', ''an'')') = 0, 'menos de 3 letras não lista ninguém');
select t.ok((ponto_contexto('almeida-t') ->> 'escritorio_nome') = 'Almeida Teste Advocacia', 'contexto de A traz o nome de A');
select t.ok((ponto_contexto('barbosa-t') ->> 'fuso') = 'America/Manaus', 'contexto de B traz o fuso de B');
select t.ok((ponto_contexto('nao-existe') ->> 'erro') = 'ESCRITORIO_NAO_ENCONTRADO', 'contexto de slug inexistente');
select t.ok((ponto_escala('almeida-t', (select escala_id from ponto_buscar('almeida-t', 'ana'))) ->> 'nome') = 'T-agora', 'escala de A lida pelo slug de A');
select t.ok(ponto_escala('barbosa-t', (select escala_id from ponto_buscar('almeida-t', 'ana'))) is null, 'escala de A NÃO é lida pelo slug de B');
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000a001', '561847', 'entrada') ->> 'erro') = 'PIN_INVALIDO', 'PIN de B não abre funcionário de A');
select t.ok((ponto_historico('00000000-0000-0000-0000-00000000a001', '561847') ->> 'erro') = 'PIN_INVALIDO', 'PIN de B não lê o histórico de A');

\echo == 10. Escritório suspenso: some do mapa (painel e ponto)
select t.como('00000000-0000-0000-0000-0000000000f1');
select plataforma_atualizar_escritorio((select v::uuid from t.ctx where k='escB'), 'Barbosa Teste Advocacia', false, 'America/Manaus');
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok(t.n('select 1 from public.funcionarios') = 0, 'admin de B suspenso não lê nada');
select t.ok((minha_sessao() ->> 'erro') = 'ESCRITORIO_SUSPENSO', 'sessão avisa que o escritório está suspenso');
select t.anon();
select t.ok(t.n('select 1 from ponto_buscar(''barbosa-t'', ''bia'')') = 0, 'ponto de B suspenso não busca ninguém');
select t.ok((ponto_contexto('barbosa-t') ->> 'erro') = 'ESCRITORIO_SUSPENSO', 'contexto de B suspenso');
select t.ok((ponto_bater('00000000-0000-0000-0000-00000000b001', '561847', 'entrada') ->> 'erro') = 'ESCRITORIO_SUSPENSO', 'ponto_bater de B suspenso é recusado');
select t.como('00000000-0000-0000-0000-0000000000f1');
select plataforma_atualizar_escritorio((select v::uuid from t.ctx where k='escB'), 'Barbosa Teste Advocacia', true, 'America/Manaus');
select t.admin_db();
select t.ok(t.n('select 1 from public.perfis where escritorio_id = (select v::uuid from t.ctx where k=''escB'') and ativo') = 1, 'reativado: admin de B volta');
