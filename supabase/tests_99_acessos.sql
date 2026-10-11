-- Níveis de acesso (0013): hierarquia, permissões por nível e por pessoa, escopo de processos (próprios, todos, sigilosos),
-- login de funcionário, porta do ponto (entrada abre, saída fecha, liberação da gerência), registros e isolamento.
\set ON_ERROR_STOP on
select t.admin_db();

-- funcionários extras do escritório A (a001 Ana e a002 Beto já existem) e um do B
insert into public.funcionarios (id, escritorio_id, nome, salario_mensal, vinculo, data_admissao) values
 ('00000000-0000-0000-0000-00000000ac03', (select v::uuid from t.ctx where k = 'escA'), 'Cleo Secretaria', 2000, 'clt', current_date - 90),
 ('00000000-0000-0000-0000-00000000ac04', (select v::uuid from t.ctx where k = 'escA'), 'Davi Estagiario', 1500, 'estagio', current_date - 90),
 ('00000000-0000-0000-0000-00000000ac05', (select v::uuid from t.ctx where k = 'escA'), 'Eva Financeira', 3000, 'clt', current_date - 90),
 ('00000000-0000-0000-0000-00000000ac06', (select v::uuid from t.ctx where k = 'escA'), 'Fabio Colaborador', 1800, 'clt', current_date - 90),
 ('00000000-0000-0000-0000-00000000ac07', (select v::uuid from t.ctx where k = 'escA'), 'Ana Advogada', 3500, 'clt', current_date - 90);
create or replace function t.cnj(n int) returns text language plpgsql as $$
declare base text := lpad(n::text, 7, '0') || '2024' || '826' || '0001'; dd text;
begin
  dd := lpad((98 - ((substr(base, 1, 7) || substr(base, 8, 4) || substr(base, 12, 3) || substr(base, 15, 4) || '00')::numeric % 97))::int::text, 2, '0');
  return substr(base, 1, 7) || '-' || dd || '.2024.8.26.0001';
end $$;

\echo == N1. Hierarquia de criação (administrador cria todos os níveis)
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.falha($q$ select criar_acesso('adv.a@t.com', 'segredo123', 'Dra Ana', 'advogado') $q$, 'FUNCIONARIO_OBRIGATORIO', 'nível que exige ponto precisa de funcionário vinculado');
select t.falha($q$ select criar_acesso('adv.a@t.com', 'segredo123', 'Dra Ana', 'advogado', '00000000-0000-0000-0000-00000000b001') $q$, 'FUNCIONARIO_INVALIDO', 'funcionário de outro escritório é recusado');
select t.falha($q$ select criar_acesso('adv.a@t.com', 'segredo123', 'Dra Ana', 'advogado', '00000000-0000-0000-0000-00000000ac07', array['folha.ver']) $q$, 'PERMISSAO_ACIMA_DA_SUA', 'permissão reservada não pode ser concedida nem pelo administrador');
select t.falha($q$ select criar_acesso('adv.a@t.com', 'segredo123', 'Dra Ana', 'advogado', '00000000-0000-0000-0000-00000000ac07', array['inventada']) $q$, 'PERMISSAO_INVALIDA', 'permissão inexistente é recusada');
select t.falha($q$ select criar_acesso('adv.a@t.com', 'segredo123', 'Dra Ana', 'inventado') $q$, 'PAPEL_INVALIDO', 'nível inexistente é recusado');
select criar_acesso('adv.a@t.com', 'segredo123', 'Dra Ana', 'advogado', '00000000-0000-0000-0000-00000000ac07');
select criar_acesso('est.a@t.com', 'segredo123', 'Davi Estagiario', 'estagiario', '00000000-0000-0000-0000-00000000ac04');
select criar_acesso('sec.a@t.com', 'segredo123', 'Cleo Secretaria', 'secretaria', '00000000-0000-0000-0000-00000000ac03');
select criar_acesso('fin.a@t.com', 'segredo123', 'Eva Financeira', 'financeiro', '00000000-0000-0000-0000-00000000ac05');
select criar_acesso('col.a@t.com', 'segredo123', 'Fabio Colaborador', 'colaborador', '00000000-0000-0000-0000-00000000ac06');
select criar_acesso('ger2.a@t.com', 'segredo123', 'Gerente Dois', 'gerente');
select t.falha($q$ select criar_acesso('dup.a@t.com', 'segredo123', 'Duplicada', 'advogado', '00000000-0000-0000-0000-00000000ac07') $q$, 'FUNCIONARIO_JA_TEM_ACESSO', 'um funcionário tem um só acesso');
select t.admin_db();
insert into t.ctx select 'advA', id::text from public.perfis where email = 'adv.a@t.com';
insert into t.ctx select 'estA', id::text from public.perfis where email = 'est.a@t.com';
insert into t.ctx select 'secA', id::text from public.perfis where email = 'sec.a@t.com';
insert into t.ctx select 'finA', id::text from public.perfis where email = 'fin.a@t.com';
insert into t.ctx select 'colA', id::text from public.perfis where email = 'col.a@t.com';
insert into t.ctx select 'ger2A', id::text from public.perfis where email = 'ger2.a@t.com';
select t.ok((select trocar_senha from public.perfis where email = 'adv.a@t.com'), 'senha provisória: a primeira troca é obrigatória');
select t.ok((select funcionario_id from public.perfis where email = 'adv.a@t.com') = '00000000-0000-0000-0000-00000000ac07', 'login ligado ao cadastro do funcionário');
select t.ok(exists (select 1 from public.acessos_log where evento = 'acesso_criado' and nome = 'Dra Ana'), 'criação fica no registro de acessos');

\echo == N2. Quem não tem "gerenciar acessos" não cria; a gerência com a permissão só atua abaixo do seu nível
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.falha($q$ select criar_acesso('x1@t.com', 'segredo123', 'X', 'secretaria', '00000000-0000-0000-0000-00000000a002') $q$, 'SEM_PERMISSAO', 'gerência sem a permissão não cria acesso');
select t.ok((select count(*) from acessos_lista()) >= 7 and not exists (select 1 from acessos_lista() where pode_gerir), 'gerência lê a lista (para liberar acessos), mas não altera nenhum');
select t.ok((select pode_liberar from acessos_lista() where email = 'adv.a@t.com') and not (select pode_liberar from acessos_lista() where email = 'admin.a@t.com'), 'e pode liberar quem tem nível abaixo do seu');
select t.como((select v::uuid from t.ctx where k = 'coordA'));
select t.falha($q$ select acessos_lista() $q$, 'SEM_PERMISSAO', 'coordenação não lista os acessos');
select t.falha($q$ select acesso_politica() $q$, 'SEM_PERMISSAO', 'nem a política');
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select atualizar_acesso((select v::uuid from t.ctx where k = 'gerenteA'), '{"conceder":["acessos.gerenciar"]}'::jsonb);
select t.falha($q$ select atualizar_acesso((select v::uuid from t.ctx where k = 'gerenteA'), '{"conceder":["folha.ver"]}'::jsonb) $q$, 'PERMISSAO_ACIMA_DA_SUA', 'reservada não se concede');
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.ok((select count(*) from acessos_lista()) >= 8, 'gerência com a permissão lista os acessos do escritório');
select t.ok((select pode_gerir from acessos_lista() where email = 'admin.a@t.com') = false, 'a lista marca o administrador como fora do alcance');
select t.ok((select pode_gerir from acessos_lista() where email = 'adv.a@t.com') = true, 'e o advogado como dentro do alcance');
select t.falha($q$ select criar_acesso('g3@t.com', 'segredo123', 'G3', 'gerente') $q$, 'NIVEL_ACIMA_DO_SEU', 'gerência não cria outra gerência');
select t.falha($q$ select criar_acesso('a3@t.com', 'segredo123', 'A3', 'admin') $q$, 'NIVEL_ACIMA_DO_SEU', 'nem administrador');
select t.falha($q$ select criar_acesso('c3@t.com', 'segredo123', 'C3', 'coordenador', null, array['honorarios.ver']) $q$, 'PERMISSAO_ACIMA_DA_SUA', 'não concede permissão que não tem');
select t.falha($q$ select atualizar_acesso((select v::uuid from t.ctx where k = 'adminA'), '{"nome":"Hackeado"}'::jsonb) $q$, 'NIVEL_ACIMA_DO_SEU', 'não altera o administrador');
select t.falha($q$ select atualizar_acesso((select v::uuid from t.ctx where k = 'ger2A'), '{"ativo":false}'::jsonb) $q$, 'NIVEL_ACIMA_DO_SEU', 'não altera quem tem o mesmo nível');
select t.falha($q$ select atualizar_acesso((select v::uuid from t.ctx where k = 'gerenteA'), '{"papel":"admin"}'::jsonb) $q$, 'NAO_ALTERAR_A_SI', 'não se promove');
select t.falha($q$ select atualizar_acesso((select v::uuid from t.ctx where k = 'advA'), '{"papel":"gerente"}'::jsonb) $q$, 'NIVEL_ACIMA_DO_SEU', 'não promove ao próprio nível');
select t.falha($q$ select redefinir_senha_usuario((select v::uuid from t.ctx where k = 'adminA'), 'novasenha123') $q$, 'NIVEL_ACIMA_DO_SEU', 'não redefine a senha do administrador');
select t.falha($q$ select remover_usuario((select v::uuid from t.ctx where k = 'adminA')) $q$, 'NIVEL_ACIMA_DO_SEU', 'não remove o administrador');
select redefinir_senha_usuario((select v::uuid from t.ctx where k = 'colA'), 'outrasenha123');
select criar_acesso('sec2.a@t.com', 'segredo123', 'Secretaria Dois', 'secretaria', '00000000-0000-0000-0000-00000000a002');
select t.admin_db();
select t.ok((select trocar_senha from public.perfis where id = (select v::uuid from t.ctx where k = 'colA')), 'senha redefinida por outro obriga a troca');
select t.ok(exists (select 1 from public.acessos_log where evento = 'senha_redefinida'), 'redefinição fica no registro');
select t.ok(exists (select 1 from public.auditoria where acao = 'Senha redefinida'), 'e na auditoria');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select remover_usuario((select id from public.perfis where email = 'sec2.a@t.com'));
select t.admin_db();
select t.ok(not exists (select 1 from public.perfis where email = 'sec2.a@t.com'), 'acesso removido');

\echo == N3. Isolamento entre escritórios
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select t.ok((select count(*) from acessos_lista()) = 1, 'B lista só os próprios acessos');
select t.falha($q$ select atualizar_acesso((select v::uuid from t.ctx where k = 'advA'), '{"nome":"x"}'::jsonb) $q$, 'NAO_ENCONTRADO', 'B não altera acesso de A');
select t.falha($q$ select redefinir_senha_usuario((select v::uuid from t.ctx where k = 'advA'), 'novasenha123') $q$, 'NAO_ENCONTRADO', 'B não redefine senha de A');
select t.falha($q$ select liberar_acesso((select v::uuid from t.ctx where k = 'advA'), 30, 'teste') $q$, 'NAO_ENCONTRADO', 'B não libera acesso de A');
select t.ok(t.n($q$ select 1 from public.acessos_log $q$) = 0, 'B não lê o registro de acessos de A');

\echo == N4. Porta do ponto: o acesso abre com a entrada e fecha com a saída
select t.admin_db();
select t.ok((select acesso from (select public._estado_de(p) as acesso from public.perfis p where p.email = 'admin.a@t.com') x) = 'liberado', 'administrador não depende de ponto');
select t.ok((select public._estado_de(p) from public.perfis p where p.email = 'gerente.a@t.com') = 'liberado', 'gerência não depende de ponto');
select t.ok((select public._estado_de(p) from public.perfis p where p.email = 'coord.a@t.com') = 'liberado', 'coordenação não depende de ponto');
select t.como((select v::uuid from t.ctx where k = 'advA'));
select t.ok(estado_acesso() = 'aguardando_ponto', 'advogada sem ponto: aguardando');
select t.ok(minha_sessao() ->> 'acesso' = 'aguardando_ponto' and minha_sessao() ->> 'papel' = 'advogado', 'a sessão informa o nível e o estado');
select t.ok(jsonb_array_length(minha_sessao() -> 'permissoes') > 5, 'e as permissões');
select t.ok(tem_permissao('processos.ver') = false, 'sem ponto, nenhuma permissão vale');
select t.ok(t.n($q$ select 1 from public.clientes $q$) = 0, 'sem ponto, não lê clientes');
select t.ok(t.n($q$ select 1 from public.tarefas $q$) = 0, 'sem ponto, não lê tarefas');
select t.falha($q$ select minhas_tarefas() $q$, 'SEM_PERMISSAO', 'sem ponto, não abre as tarefas');
select t.ok((meu_ponto_hoje() ->> 'estado') = 'aguardando_ponto', 'mas vê o próprio dia de ponto');
select t.admin_db();
insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, horario_real, status)
values ((select v::uuid from t.ctx where k = 'escA'), '00000000-0000-0000-0000-00000000ac07', public._hoje((select v::uuid from t.ctx where k = 'escA')), 'entrada', now(), 'no_horario');
insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, horario_real, status, status_aprovacao)
values ((select v::uuid from t.ctx where k = 'escA'), '00000000-0000-0000-0000-00000000ac04', public._hoje((select v::uuid from t.ctx where k = 'escA')), 'entrada', now(), 'no_horario', 'rejeitado');
select t.como((select v::uuid from t.ctx where k = 'advA'));
select t.ok(estado_acesso() = 'liberado' and tem_permissao('processos.ver'), 'com a entrada, o acesso abre');
select t.como((select v::uuid from t.ctx where k = 'estA'));
select t.ok(estado_acesso() = 'aguardando_ponto', 'marcação rejeitada não abre o acesso');

select t.admin_db();
update public.perfis set exige_ponto = true where email = 'admin.a@t.com';
select t.ok((select public._estado_de(p) from public.perfis p where p.email = 'admin.a@t.com') = 'liberado', 'o administrador nunca fica trancado, nem exigindo o ponto');
update public.perfis set exige_ponto = null where email = 'admin.a@t.com';

\echo == N5. Escopo de processos: os seus, todos, sigilosos, delegados
select t.admin_db();
insert into public.clientes (id, escritorio_id, nome, tipo) values ('00000000-0000-0000-0000-0000000ac001', (select v::uuid from t.ctx where k = 'escA'), 'Cliente ACX', 'pf');
insert into public.processos (id, escritorio_id, numero, cliente_id, titulo, responsavel_id, sigiloso) values
 ('00000000-0000-0000-0000-0000000a0001', (select v::uuid from t.ctx where k = 'escA'), t.cnj(9101), '00000000-0000-0000-0000-0000000ac001', 'ACX do Ana', '00000000-0000-0000-0000-00000000ac07', false),
 ('00000000-0000-0000-0000-0000000a0002', (select v::uuid from t.ctx where k = 'escA'), t.cnj(9102), '00000000-0000-0000-0000-0000000ac001', 'ACX do Beto', '00000000-0000-0000-0000-00000000a002', false),
 ('00000000-0000-0000-0000-0000000a0003', (select v::uuid from t.ctx where k = 'escA'), t.cnj(9103), '00000000-0000-0000-0000-0000000ac001', 'ACX sigiloso do Beto', '00000000-0000-0000-0000-00000000a002', true),
 ('00000000-0000-0000-0000-0000000a0004', (select v::uuid from t.ctx where k = 'escA'), t.cnj(9104), '00000000-0000-0000-0000-0000000ac001', 'ACX sigiloso da Ana', '00000000-0000-0000-0000-00000000ac07', true);
select t.como((select v::uuid from t.ctx where k = 'advA'));
select t.ok(t.n($q$ select 1 from public.processos where titulo like 'ACX%' $q$) = 2, 'advogada vê só os que responde (inclusive o sigiloso dela)');
select t.ok(t.n($q$ select 1 from public.processos where titulo = 'ACX sigiloso do Beto' $q$) = 0, 'e não vê o sigiloso do colega');
select t.ok(t.n($q$ select 1 from public.processo_movimentos m where m.processo_id = '00000000-0000-0000-0000-0000000a0002' $q$) = 0, 'andamentos seguem o processo');
select t.ok(public.processo_visivel('00000000-0000-0000-0000-0000000a0001') and not public.processo_visivel('00000000-0000-0000-0000-0000000a0002'), 'a função de visibilidade concorda com a política');
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.ok(t.n($q$ select 1 from public.processos where titulo like 'ACX%' $q$) = 4, 'gerência vê todos, inclusive sigilosos');
select t.como((select v::uuid from t.ctx where k = 'coordA'));
select t.ok(t.n($q$ select 1 from public.processos where titulo like 'ACX%' $q$) = 4, 'coordenação mantém o acesso que já tinha');
select t.admin_db();
insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, horario_real, status)
select (select v::uuid from t.ctx where k = 'escA'), f, public._hoje((select v::uuid from t.ctx where k = 'escA')), 'entrada', now(), 'no_horario'
  from unnest(array['00000000-0000-0000-0000-00000000ac03', '00000000-0000-0000-0000-00000000ac04', '00000000-0000-0000-0000-00000000ac05', '00000000-0000-0000-0000-00000000ac06']::uuid[]) f
 where not exists (select 1 from public.registros_ponto r where r.funcionario_id = f and r.tipo = 'entrada' and r.data = public._hoje((select v::uuid from t.ctx where k = 'escA')) and r.status_aprovacao <> 'rejeitado');
select t.como((select v::uuid from t.ctx where k = 'secA'));
select t.ok(t.n($q$ select 1 from public.processos where titulo like 'ACX%' $q$) = 2, 'secretaria vê todos, menos os sigilosos');
select t.como((select v::uuid from t.ctx where k = 'estA'));
select t.ok(estado_acesso() = 'liberado', 'estagiário entra depois de bater o ponto (a rejeitada foi substituída)');
select t.ok(t.n($q$ select 1 from public.processos where titulo like 'ACX%' $q$) = 0, 'estagiário não vê processo que não lhe foi delegado');
select t.admin_db();
insert into public.tarefas (escritorio_id, titulo, tipo, processo_id, responsavel_id, participantes)
values ((select v::uuid from t.ctx where k = 'escA'), 'ACX apoio ao processo', 'tarefa', '00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-00000000a002', array['00000000-0000-0000-0000-00000000ac04']::uuid[]);
select t.como((select v::uuid from t.ctx where k = 'estA'));
select t.ok(t.n($q$ select 1 from public.processos where titulo like 'ACX%' $q$) = 1, 'delegada uma tarefa do processo, o estagiário passa a vê-lo');
select t.ok(t.n($q$ select 1 from public.tarefas where titulo like 'ACX%' $q$) = 1, 'e vê a tarefa de que participa');
select t.sem_efeito($q$ update public.processos set titulo = 'ACX alterado' where titulo like 'ACX%' $q$, 'estagiário não edita processo');
select t.falha($q$ insert into public.clientes (nome, tipo) values ('Novo ACX', 'pf') $q$, 'row-level security', 'estagiário não cadastra cliente');
select t.como((select v::uuid from t.ctx where k = 'finA'));
select t.ok(t.n($q$ select 1 from public.processos $q$) = 0, 'financeiro não vê processos');
select t.ok(t.n($q$ select 1 from public.clientes where nome = 'Cliente ACX' $q$) = 1, 'mas vê clientes');
select t.ok(t.n($q$ select 1 from public.documentos $q$) = 0, 'nem documentos');

\echo == N6. Tarefas: cada um vê as suas; delegar exige permissão
select t.como((select v::uuid from t.ctx where k = 'colA'));
select t.ok(estado_acesso() = 'liberado', 'colaborador entra depois do ponto');
select t.ok(t.n($q$ select 1 from public.tarefas $q$) = 0, 'colaborador sem tarefa não vê tarefas de outros');
select t.falha($q$ insert into public.tarefas (titulo, tipo) values ('ACX minha', 'tarefa') $q$, 'row-level security', 'colaborador não cria tarefas');
select t.como((select v::uuid from t.ctx where k = 'estA'));
select t.falha($q$ insert into public.tarefas (titulo, tipo, responsavel_id) values ('ACX delegada', 'tarefa', '00000000-0000-0000-0000-00000000ac06') $q$, 'row-level security', 'estagiário não delega a outra pessoa');
insert into public.tarefas (titulo, tipo, responsavel_id) values ('ACX para mim', 'tarefa', '00000000-0000-0000-0000-00000000ac04');
select t.ok(t.n($q$ select 1 from public.tarefas where titulo = 'ACX para mim' $q$) = 1, 'estagiário cria tarefa para si');
select t.como((select v::uuid from t.ctx where k = 'advA'));
insert into public.tarefas (titulo, tipo, responsavel_id) values ('ACX delegada pela advogada', 'tarefa', '00000000-0000-0000-0000-00000000ac06');
select t.ok(t.n($q$ select 1 from public.tarefas where titulo like 'ACX%' $q$) >= 2, 'advogada delega e vê as tarefas do escritório');
select t.como((select v::uuid from t.ctx where k = 'colA'));
select t.ok(t.n($q$ select 1 from public.tarefas $q$) = 1, 'colaborador vê só a tarefa que recebeu');
select t.ok(jsonb_array_length(minhas_tarefas() -> 'tarefas') = 1, 'minhas_tarefas devolve a mesma');
select t.ok((minha_tarefa_atualizar((select (x ->> 'id')::uuid from jsonb_array_elements(minhas_tarefas() -> 'tarefas') x limit 1), 'em_andamento', 'comecei') ->> 'ok') = 'true', 'atualiza o andamento da própria tarefa');
select t.ok((minha_tarefa_atualizar('00000000-0000-0000-0000-000000000099', 'concluida') ->> 'erro') = 'NAO_ENCONTRADO', 'não atualiza o que não é dele');
select t.sem_efeito($q$ update public.tarefas set status = 'concluida' where titulo like 'ACX%' $q$, 'nem por atualização direta');

\echo == N7. Honorários por permissão
select t.admin_db();
insert into public.honorarios_propostas (escritorio_id, titulo, servico, modalidade, valor_proposto) values ((select v::uuid from t.ctx where k = 'escA'), 'Proposta ACX', 'trabalhista', 'fixo', 1000);
select t.como((select v::uuid from t.ctx where k = 'finA'));
select t.ok(t.n($q$ select 1 from public.honorarios_propostas where titulo like '%ACX%' $q$) = 1, 'financeiro lê propostas');
insert into public.honorarios_propostas (titulo, servico, modalidade, valor_proposto) values ('Proposta ACX do financeiro', 'civel', 'fixo', 500);
select t.como((select v::uuid from t.ctx where k = 'advA'));
select t.ok(t.n($q$ select 1 from public.honorarios_propostas where titulo like '%ACX%' $q$) = 2, 'advogada lê propostas');
select t.sem_efeito($q$ update public.honorarios_parametros set dados = '{}' $q$, 'advogada não altera os parâmetros');
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.ok(t.n($q$ select 1 from public.honorarios_propostas where titulo like '%ACX%' $q$) = 0, 'gerência segue sem acesso a honorários (padrão anterior preservado)');
select t.como((select v::uuid from t.ctx where k = 'estA'));
select t.ok(t.n($q$ select 1 from public.honorarios_propostas where titulo like '%ACX%' $q$) = 0, 'estagiário não lê honorários');

\echo == N8. Saída fecha o acesso; a gerência libera por um tempo
select t.admin_db();
insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, horario_real, status)
values ((select v::uuid from t.ctx where k = 'escA'), '00000000-0000-0000-0000-00000000ac07', public._hoje((select v::uuid from t.ctx where k = 'escA')), 'saida', now(), 'no_horario');
select t.como((select v::uuid from t.ctx where k = 'advA'));
select t.ok(estado_acesso() = 'encerrado', 'depois da saída, o acesso encerra');
select t.ok(t.n($q$ select 1 from public.processos $q$) = 0, 'e os dados somem');
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.falha($q$ select liberar_acesso((select v::uuid from t.ctx where k = 'advA'), 30, 'x') $q$, 'MOTIVO_OBRIGATORIO', 'a liberação exige motivo');
select t.falha($q$ select liberar_acesso((select v::uuid from t.ctx where k = 'advA'), 1, 'audiência externa') $q$, 'TEMPO_INVALIDO', 'e tempo entre 5 min e 12 h');
select t.falha($q$ select liberar_acesso((select v::uuid from t.ctx where k = 'adminA'), 30, 'audiência externa') $q$, 'NIVEL_ACIMA_DO_SEU', 'gerência não libera quem tem nível maior');
select t.falha($q$ select liberar_acesso((select v::uuid from t.ctx where k = 'gerenteA'), 30, 'audiência externa') $q$, 'NAO_ALTERAR_A_SI', 'nem a si mesma');
select liberar_acesso((select v::uuid from t.ctx where k = 'advA'), 30, 'audiência externa');
select t.como((select v::uuid from t.ctx where k = 'advA'));
select t.ok(estado_acesso() = 'liberado' and (minha_sessao() ->> 'liberado_ate') is not null, 'liberada pela gerência, o acesso volta');
select t.falha($q$ select liberar_acesso((select v::uuid from t.ctx where k = 'estA'), 30, 'audiência externa') $q$, 'SEM_PERMISSAO', 'advogada não libera acesso de ninguém');
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select encerrar_liberacao((select v::uuid from t.ctx where k = 'advA'));
select t.como((select v::uuid from t.ctx where k = 'advA'));
select t.ok(estado_acesso() = 'encerrado', 'encerrar a liberação fecha de novo');
select t.admin_db();
select t.ok(exists (select 1 from public.acessos_log where evento = 'liberacao' and detalhe like '%audiência externa%'), 'liberação fica no registro');

\echo == N9. Política do escritório e matriz de permissões (só o administrador)
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.falha($q$ select definir_exigir_ponto(false) $q$, 'SEM_PERMISSAO', 'gerência não desliga a regra do ponto');
select t.falha($q$ select definir_permissoes_papel('secretaria', array['clientes.ver']) $q$, 'SEM_PERMISSAO', 'nem muda permissões de um nível');
select t.ok((acesso_politica() ->> 'exigir_ponto') = 'true', 'a política padrão exige o ponto');
select t.ok(jsonb_array_length(acesso_politica() -> 'papeis' -> 'advogado' -> 'permissoes') > 5, 'e mostra o padrão de cada nível');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select definir_exigir_ponto(false);
select t.como((select v::uuid from t.ctx where k = 'advA'));
select t.ok(estado_acesso() = 'liberado', 'com a regra desligada, o acesso não depende do ponto');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select definir_exigir_ponto(true);
select t.falha($q$ select definir_permissoes_papel('admin', array['clientes.ver']) $q$, 'PAPEL_INVALIDO', 'o nível do administrador não se altera');
select t.falha($q$ select definir_permissoes_papel('secretaria', array['folha.ver']) $q$, 'PERMISSAO_RESERVADA', 'reservada não vai para nível nenhum');
select definir_permissoes_papel('secretaria', array['clientes.ver']);
select t.como((select v::uuid from t.ctx where k = 'secA'));
select t.ok(t.n($q$ select 1 from public.processos $q$) = 0 and t.n($q$ select 1 from public.clientes $q$) >= 1, 'secretaria com padrão reduzido perde os processos e mantém clientes');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select restaurar_permissoes_papel('secretaria');
select t.como((select v::uuid from t.ctx where k = 'secA'));
select t.ok(t.n($q$ select 1 from public.processos where titulo like 'ACX%' $q$) = 2, 'restaurado o padrão, volta o acesso');

\echo == N10. Permissões por pessoa (conceder e negar)
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select atualizar_acesso((select v::uuid from t.ctx where k = 'coordA'), '{"negar":["processos.sigilosos"]}'::jsonb);
select t.como((select v::uuid from t.ctx where k = 'coordA'));
select t.ok(t.n($q$ select 1 from public.processos where titulo like 'ACX%' $q$) = 2, 'coordenação sem "sigilosos" deixa de ver os sigilosos');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select atualizar_acesso((select v::uuid from t.ctx where k = 'coordA'), '{"negar":[]}'::jsonb);
select atualizar_acesso((select v::uuid from t.ctx where k = 'secA'), '{"conceder":["honorarios.ver"]}'::jsonb);
select t.como((select v::uuid from t.ctx where k = 'secA'));
select t.ok(t.n($q$ select 1 from public.honorarios_propostas where titulo like '%ACX%' $q$) = 2, 'permissão concedida a uma pessoa vale só para ela');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select atualizar_acesso((select v::uuid from t.ctx where k = 'secA'), '{"conceder":[]}'::jsonb);

\echo == N11. Sessão, senha, registros e eventos
select t.como((select v::uuid from t.ctx where k = 'colA'));
select registrar_evento_acesso('login');
select registrar_evento_acesso('login');
select t.falha($q$ select registrar_evento_acesso('inventado') $q$, 'EVENTO_INVALIDO', 'evento fora da lista é recusado');
select senha_trocada();
select t.admin_db();
select t.ok((select count(*) from public.acessos_log where evento = 'login' and nome = 'Fabio Colaborador') = 1, 'login repetido em minutos não polui o registro');
select t.ok((select trocar_senha from public.perfis where id = (select v::uuid from t.ctx where k = 'colA')) = false, 'senha trocada libera o acesso');
select t.ok((select ultimo_acesso is not null from public.perfis where id = (select v::uuid from t.ctx where k = 'colA')), 'último acesso registrado');
select t.como((select v::uuid from t.ctx where k = 'gerenteA'));
select t.ok(t.n($q$ select 1 from public.acessos_log $q$) = 0, 'gerência não lê o registro de acessos');
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select t.ok(t.n($q$ select 1 from public.acessos_log $q$) >= 8, 'o administrador lê');
select t.falha($q$ update public.perfis set papel = 'admin' where id = (select v::uuid from t.ctx where k = 'advA') $q$, 'permission denied', 'ninguém grava em perfis direto');
select t.como((select v::uuid from t.ctx where k = 'advA'));
select t.falha($q$ update public.perfis set papel = 'admin' where id = auth.uid() $q$, 'permission denied', 'nem o próprio usuário se promove');

\echo == N12. Versão do esquema
select t.admin_db();
select t.ok((select max(versao) from public.schema_versao) >= 13, 'versão do esquema 13 registrada');
select 'acessos ok' as msg;
