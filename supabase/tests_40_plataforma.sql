-- Área da plataforma: cadastro de escritórios, validações, sessão, regra do último administrador.
\set ON_ERROR_STOP on
select t.admin_db();
select t.como('00000000-0000-0000-0000-0000000000f1');

\echo == L1. Criar escritório: validações
select t.falha($q$ select plataforma_criar_escritorio('X', 'xy-t', 'N', 'n@t.com', 'segredo123') $q$, 'NOME_OBRIGATORIO', 'nome curto');
select t.falha($q$ select plataforma_criar_escritorio('Novo T', 'Slug Ruim!', 'Nome', 'n@t.com', 'segredo123') $q$, 'SLUG_INVALIDO', 'slug inválido');
select t.falha($q$ select plataforma_criar_escritorio('Novo T', 'almeida-t', 'Nome', 'n@t.com', 'segredo123') $q$, 'SLUG_EXISTE', 'slug repetido');
select t.falha($q$ select plataforma_criar_escritorio('Novo T', 'novo-t', 'Nome', 'admin.a@t.com', 'segredo123') $q$, 'EMAIL_EXISTE', 'e-mail já usado em outro escritório');
select t.falha($q$ select plataforma_criar_escritorio('Novo T', 'novo-t', 'Nome', 'n@t.com', 'curta1') $q$, 'SENHA_CURTA', 'senha curta');
select t.falha($q$ select plataforma_criar_escritorio('Novo T', 'novo-t', 'Nome', 'n@t.com', 'somenteletras') $q$, 'SENHA_FRACA', 'senha sem número');
select t.falha($q$ select plataforma_criar_escritorio('Novo T', 'novo-t', 'Nome', 'n@t.com', 'segredo123', 'Marte/Olympus') $q$, 'FUSO_INVALIDO', 'fuso inexistente');
select t.ok(not exists (select 1 from public.escritorios where slug = 'novo-t'), 'falhas não deixam escritório pela metade');

\echo == L2. Criar, listar, atualizar
select t.ok((plataforma_criar_escritorio('Novo T Advocacia', 'novo-t', 'Nora Nova', 'Nora@T.com ', 'segredo123', 'America/Sao_Paulo') ->> 'ok') = 'true', 'cria escritório novo com administrador');
select t.admin_db();
select t.ok((select count(*) from public.cargos where escritorio_id = t.id_esc('novo-t')) = 9, 'escritório nasce com os 9 cargos padrão');
select t.ok((select count(*) from public.escalas where escritorio_id = t.id_esc('novo-t')) = 3, 'escritório nasce com as 3 escalas modelo');
select t.ok((select dados -> 'escritorio' ->> 'nome' from public.configuracoes where escritorio_id = t.id_esc('novo-t')) = 'Novo T Advocacia', 'configuração inicial carrega o nome');
select t.como('00000000-0000-0000-0000-0000000000f1');
select t.ok((select (e ->> 'admins')::int from jsonb_array_elements(plataforma_listar_escritorios()) e where e ->> 'slug' = 'novo-t') = 1, 'lista mostra 1 administrador');
select t.ok((select (e ->> 'funcionarios')::int from jsonb_array_elements(plataforma_listar_escritorios()) e where e ->> 'slug' = 'almeida-t') >= 2, 'lista mostra contagem de funcionários (sem identificá-los)');
select t.ok((plataforma_atualizar_escritorio(t.id_esc('novo-t'), 'Novo T & Associados', true, 'America/Cuiaba') ->> 'ok') = 'true', 'atualiza nome e fuso');
select t.admin_db();
select t.ok((select fuso from public.escritorios where slug = 'novo-t') = 'America/Cuiaba', 'fuso gravado');
select t.como('00000000-0000-0000-0000-0000000000f1');
select t.ok((select count(*) from public.plataforma_auditoria where escritorio_id = t.id_esc('novo-t')) >= 2, 'plataforma registra as próprias ações');
select t.admin_db();
select t.falha($q$ update public.plataforma_auditoria set acao = 'x' $q$, 'REGISTRO_IMUTAVEL', 'auditoria da plataforma é imutável');

\echo == L3. Sessão
select t.como(t.id_perfil('nora@t.com'));
select t.ok((minha_sessao() ->> 'tipo') = 'escritorio' and (minha_sessao() -> 'escritorio' ->> 'slug') = 'novo-t' and (minha_sessao() ->> 'papel') = 'admin', 'admin do escritório recebe sessão com o próprio escritório');
select t.como('00000000-0000-0000-0000-0000000000f1');
select t.ok((minha_sessao() ->> 'tipo') = 'plataforma', 'plataforma recebe sessão de plataforma');
select t.admin_db();
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f9', 'sem.perfil@t.com');
select t.como('00000000-0000-0000-0000-0000000000f9');
select t.ok((minha_sessao() ->> 'erro') = 'SEM_PERFIL', 'usuário do Auth sem perfil não entra');
select t.sem_acesso('funcionarios', 'usuário sem perfil não lê nada');

\echo == L4. Usuários do escritório: último administrador
select t.como(t.id_perfil('nora@t.com'));
select t.falha($q$ select atualizar_usuario(auth.uid(), 'Nora', 'gerente', true) $q$, 'ULTIMO_ADMIN', 'não rebaixa o único administrador');
select t.falha($q$ select atualizar_usuario(auth.uid(), 'Nora', 'admin', false) $q$, 'ULTIMO_ADMIN', 'não desativa o único administrador');
select t.falha($q$ select remover_usuario(auth.uid()) $q$, 'NAO_REMOVER_A_SI', 'não remove o próprio acesso');
select t.ok((criar_usuario('segundo.admin@t.com', 'segredo123', 'Segundo', 'admin') ->> 'ok') = 'true', 'cria segundo administrador');
select t.ok((atualizar_usuario(auth.uid(), 'Nora', 'gerente', true) ->> 'ok') = 'true', 'com 2 admins, um pode ser rebaixado');
select t.admin_db();
select t.ok((select encrypted_password = extensions.crypt('segredo123', encrypted_password) from auth.users where email = 'segundo.admin@t.com'), 'senha gravada com bcrypt e confere');
select t.ok((select count(*) from auth.identities i join auth.users u on u.id = i.user_id where u.email = 'segundo.admin@t.com') = 1, 'identidade de e-mail criada (login do Supabase)');

\echo == L5. Redefinição de senha pela plataforma e pelo administrador
select t.como('00000000-0000-0000-0000-0000000000f1');
select t.ok((plataforma_redefinir_senha(t.id_perfil('segundo.admin@t.com'), 'senhaNova2026') ->> 'ok') = 'true', 'plataforma redefine a senha');
select t.falha($q$ select plataforma_redefinir_senha(t.id_perfil('segundo.admin@t.com'), 'curta') $q$, 'SENHA_CURTA', 'senha fraca recusada');
select t.admin_db();
select t.ok((select encrypted_password = extensions.crypt('senhaNova2026', encrypted_password) from auth.users where email = 'segundo.admin@t.com'), 'nova senha vale');
select t.como(t.id_perfil('segundo.admin@t.com'));
select t.ok((redefinir_senha_usuario(t.id_perfil('nora@t.com'), 'outraSenha77') ->> 'ok') = 'true', 'administrador redefine a senha de um colega do mesmo escritório');

\echo == L6. Excluir escritório: só se estiver vazio
select t.como('00000000-0000-0000-0000-0000000000f1');
select t.falha($q$ select plataforma_excluir_escritorio(t.id_esc('almeida-t')) $q$, 'ESCRITORIO_COM_DADOS', 'escritório com funcionários não é excluído');
select t.admin_db();
insert into public.modelos_documentos (escritorio_id, titulo, categoria, conteudo) values (t.id_esc('novo-t'), 'Modelo do escritório novo', 'procuracoes', 'texto de modelo com mais de vinte caracteres');
insert into public.honorarios_parametros (escritorio_id, dados) values (t.id_esc('novo-t'), '{}'::jsonb);
select t.como('00000000-0000-0000-0000-0000000000f1');
select t.ok((plataforma_excluir_escritorio(t.id_esc('novo-t')) ->> 'ok') = 'true', 'escritório sem pessoas e dados, mas com modelos e parâmetros, é excluído');
select t.admin_db();
select t.ok(not exists (select 1 from public.escritorios where slug = 'novo-t') and not exists (select 1 from auth.users where email in ('nora@t.com', 'segundo.admin@t.com')), 'escritório e acessos sumiram');
select t.ok(exists (select 1 from public.plataforma_auditoria where acao = 'Escritório excluído'), 'exclusão ficou na auditoria da plataforma');
