-- =====================================================================
-- GE ADVOCACIA · 0004 · acessos ao painel e área da plataforma
--  * escritório (admin): cria/edita/remove usuários SÓ do próprio escritório
--  * plataforma (dono do GE Advocacia): cria, suspende e atende escritórios — sem ver os dados deles
-- As funções gravam em auth.users, por isso rodam como SECURITY DEFINER.
-- Idempotente.
-- =====================================================================

-- ---------- Validações e criação de usuário no Auth ----------
create or replace function public._validar_acesso(p_email text, p_senha text, p_nome text) returns text
language plpgsql immutable set search_path = public, extensions, pg_temp as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'EMAIL_INVALIDO'; end if;
  if length(coalesce(p_senha, '')) < 10 then raise exception 'SENHA_CURTA'; end if;
  if p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then raise exception 'SENHA_FRACA'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'NOME_OBRIGATORIO'; end if;
  return v_email;
end $$;

create or replace function public._criar_auth_user(p_email text, p_senha text) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where lower(email) = p_email) then raise exception 'EMAIL_EXISTE'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email, crypt(p_senha, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), 'email', v_id::text, now(), now(), now());
  return v_id;
end $$;

create or replace function public._nome_logado() returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce((select nome from public.perfis where id = auth.uid()), (select nome from public.plataforma_admins where id = auth.uid()), 'admin')
$$;

create or replace function public._plat_auditar(p_acao text, p_detalhe text, p_esc uuid default null) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.plataforma_auditoria (usuario, acao, detalhe, escritorio_id) values (public._nome_logado(), p_acao, left(p_detalhe, 500), p_esc)
$$;

create or replace function public._admins_ativos(p_esc uuid) returns int
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select count(*)::int from public.perfis where escritorio_id = p_esc and papel = 'admin' and ativo
$$;

-- ---------- Sessão ----------
create or replace function public.minha_sessao() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare p public.perfis; e public.escritorios; a public.plataforma_admins;
begin
  if auth.uid() is null then return public._erro('SEM_SESSAO'); end if;
  select * into p from public.perfis where id = auth.uid();
  if found then
    select * into e from public.escritorios where id = p.escritorio_id;
    if not p.ativo then return public._erro('ACESSO_INATIVO'); end if;
    if not e.ativo then return public._erro('ESCRITORIO_SUSPENSO'); end if;
    return jsonb_build_object('ok', true, 'tipo', 'escritorio', 'id', p.id, 'nome', p.nome, 'email', p.email, 'papel', p.papel,
      'escritorio', jsonb_build_object('id', e.id, 'nome', e.nome, 'slug', e.slug, 'fuso', e.fuso));
  end if;
  select * into a from public.plataforma_admins where id = auth.uid() and ativo;
  if found then
    return jsonb_build_object('ok', true, 'tipo', 'plataforma', 'id', a.id, 'nome', a.nome, 'email', a.email, 'papel', 'plataforma');
  end if;
  return public._erro('SEM_PERFIL');
end $$;

-- ---------- Usuários do escritório (só admin, só do próprio escritório) ----------
create or replace function public.criar_usuario(p_email text, p_senha text, p_nome text, p_papel text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id uuid; v_email text; v_esc uuid := public.meu_escritorio();
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_papel not in ('admin', 'gerente') then raise exception 'PAPEL_INVALIDO'; end if;
  v_email := public._validar_acesso(p_email, p_senha, p_nome);
  v_id := public._criar_auth_user(v_email, p_senha);
  insert into public.perfis (id, escritorio_id, nome, email, papel) values (v_id, v_esc, trim(p_nome), v_email, p_papel);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.atualizar_usuario(p_id uuid, p_nome text, p_papel text, p_ativo boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_esc uuid := public.meu_escritorio();
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_papel not in ('admin', 'gerente') then raise exception 'PAPEL_INVALIDO'; end if;
  update public.perfis set nome = coalesce(nullif(trim(p_nome), ''), nome), papel = p_papel, ativo = p_ativo
   where id = p_id and escritorio_id = v_esc;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if public._admins_ativos(v_esc) < 1 then raise exception 'ULTIMO_ADMIN'; end if;   -- desfaz a transação
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.redefinir_senha_usuario(p_id uuid, p_senha text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if length(coalesce(p_senha, '')) < 10 then raise exception 'SENHA_CURTA'; end if;
  if p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then raise exception 'SENHA_FRACA'; end if;
  if not exists (select 1 from public.perfis where id = p_id and escritorio_id = public.meu_escritorio()) then raise exception 'NAO_ENCONTRADO'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now() where id = p_id;
  insert into public.auditoria (escritorio_id, usuario, usuario_id, acao, detalhe)
  values (public.meu_escritorio(), public._nome_logado(), auth.uid(), 'Senha redefinida', (select email from public.perfis where id = p_id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.remover_usuario(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_esc uuid := public.meu_escritorio(); v_email text;
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_id = auth.uid() then raise exception 'NAO_REMOVER_A_SI'; end if;
  select email into v_email from public.perfis where id = p_id and escritorio_id = v_esc;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  delete from auth.users where id = p_id;      -- o perfil sai por cascata
  if public._admins_ativos(v_esc) < 1 then raise exception 'ULTIMO_ADMIN'; end if;
  insert into public.auditoria (escritorio_id, usuario, usuario_id, acao, detalhe)
  values (v_esc, public._nome_logado(), auth.uid(), 'Acesso removido', v_email);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Plataforma: escritórios ----------
-- Dados iniciais de um escritório novo (cargos, escalas e configurações). O escritório edita tudo depois.
create or replace function public._semear_escritorio(p_esc uuid, p_nome text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  insert into public.cargos (escritorio_id, nome, categoria, descricao) values
    (p_esc, 'Sócio(a) Administrador(a)', 'gerencia', 'Direção do escritório'),
    (p_esc, 'Gerente Administrativo(a)', 'gerencia', 'Gestão de equipe, escalas, aprovação de ponto e rotinas internas'),
    (p_esc, 'Gerente Jurídico(a)', 'gerencia', 'Coordenação técnica da equipe de advogados'),
    (p_esc, 'Advogado(a) Associado(a)', 'juridico', 'Atuação contenciosa e consultiva'),
    (p_esc, 'Estagiário(a) de Direito', 'estagio', 'Apoio jurídico, protocolo e acompanhamento processual'),
    (p_esc, 'Assistente Jurídico(a)', 'juridico', 'Elaboração de peças, cálculos e organização de processos'),
    (p_esc, 'Secretário(a) / Recepcionista', 'administrativo', 'Atendimento a clientes, agenda e recepção'),
    (p_esc, 'Auxiliar Administrativo(a)', 'administrativo', 'Rotinas financeiras, arquivo e documentos'),
    (p_esc, 'Serviços Gerais', 'apoio', 'Limpeza, copa e apoio operacional')
  on conflict (escritorio_id, nome) do nothing;

  if not exists (select 1 from public.escalas where escritorio_id = p_esc) then
    insert into public.escalas (escritorio_id, nome, dias) values
      (p_esc, 'Comercial · Seg–Sex 08h–18h, Sáb 08h–12h',
       '{"1":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
         "2":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
         "3":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
         "4":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
         "5":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
         "6":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"12:00"}}'),
      (p_esc, 'Estágio · Seg–Sex 08h–14h',
       '{"1":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
         "2":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
         "3":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
         "4":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
         "5":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
         "6":{"ativo":false,"entrada":"","saida_intervalo":"","retorno_intervalo":"","saida":""}}'),
      (p_esc, 'Apoio · Seg–Sáb 07h–13h',
       '{"1":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
         "2":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
         "3":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
         "4":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
         "5":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
         "6":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"}}');
  end if;

  insert into public.configuracoes (escritorio_id, dados) values (p_esc, jsonb_build_object(
    'escritorio', jsonb_build_object('nome', p_nome, 'cnpj', '', 'endereco', '', 'cidade', '', 'telefone', '', 'email', '', 'oab_sociedade', ''),
    'ponto', jsonb_build_object('tolerancia_min', 5, 'limite_atraso_min', 30, 'geofence_ativo', false, 'geofence_lat', null,
                                'geofence_lng', null, 'geofence_raio_m', 300, 'geofence_endereco', ''),
    'folha', jsonb_build_object('periodicidade', 'mensal', 'descontar_atrasos', false, 'hora_extra_pct', 50)))
  on conflict (escritorio_id) do nothing;
end $$;

create or replace function public.plataforma_criar_escritorio(
  p_nome text, p_slug text, p_admin_nome text, p_admin_email text, p_admin_senha text, p_fuso text default 'America/Fortaleza'
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_esc uuid; v_email text; v_uid uuid; v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'NOME_OBRIGATORIO'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'SLUG_INVALIDO'; end if;
  if exists (select 1 from public.escritorios where slug = v_slug) then raise exception 'SLUG_EXISTE'; end if;
  v_email := public._validar_acesso(p_admin_email, p_admin_senha, p_admin_nome);
  insert into public.escritorios (nome, slug, fuso) values (trim(p_nome), v_slug, coalesce(nullif(trim(p_fuso), ''), 'America/Fortaleza'))
  returning id into v_esc;
  v_uid := public._criar_auth_user(v_email, p_admin_senha);
  insert into public.perfis (id, escritorio_id, nome, email, papel) values (v_uid, v_esc, trim(p_admin_nome), v_email, 'admin');
  perform public._semear_escritorio(v_esc, trim(p_nome));
  perform public._plat_auditar('Escritório criado', trim(p_nome) || ' (' || v_slug || ') · admin ' || v_email, v_esc);
  return jsonb_build_object('ok', true, 'id', v_esc, 'slug', v_slug, 'admin_id', v_uid);
end $$;

-- Lista os escritórios com CONTAGENS (nunca dados de pessoas, salários ou ponto).
create or replace function public.plataforma_listar_escritorios() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'slug', e.slug, 'ativo', e.ativo, 'fuso', e.fuso, 'created_at', e.created_at,
      'usuarios', (select count(*) from public.perfis p where p.escritorio_id = e.id),
      'admins', (select count(*) from public.perfis p where p.escritorio_id = e.id and p.papel = 'admin' and p.ativo),
      'funcionarios', (select count(*) from public.funcionarios f where f.escritorio_id = e.id and f.ativo)
    ) order by e.nome) from public.escritorios e), '[]'::jsonb);
end $$;

create or replace function public.plataforma_atualizar_escritorio(p_id uuid, p_nome text, p_ativo boolean, p_fuso text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'NOME_OBRIGATORIO'; end if;
  update public.escritorios set nome = trim(p_nome), ativo = p_ativo, fuso = coalesce(nullif(trim(p_fuso), ''), fuso) where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  perform public._plat_auditar(case when p_ativo then 'Escritório atualizado' else 'Escritório suspenso' end, trim(p_nome), p_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.plataforma_listar_usuarios(p_escritorio_id uuid)
returns table (id uuid, nome text, email text, papel text, ativo boolean)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  return query select p.id, p.nome, p.email, p.papel, p.ativo from public.perfis p where p.escritorio_id = p_escritorio_id order by p.papel, p.nome;
end $$;

create or replace function public.plataforma_criar_admin(p_escritorio_id uuid, p_nome text, p_email text, p_senha text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_email text; v_uid uuid;
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  if not exists (select 1 from public.escritorios where id = p_escritorio_id) then raise exception 'NAO_ENCONTRADO'; end if;
  v_email := public._validar_acesso(p_email, p_senha, p_nome);
  v_uid := public._criar_auth_user(v_email, p_senha);
  insert into public.perfis (id, escritorio_id, nome, email, papel) values (v_uid, p_escritorio_id, trim(p_nome), v_email, 'admin');
  perform public._plat_auditar('Administrador criado', v_email, p_escritorio_id);
  return jsonb_build_object('ok', true, 'id', v_uid);
end $$;

-- Suporte: redefine a senha de um acesso (a plataforma nunca vê a senha atual, só define uma nova).
create or replace function public.plataforma_redefinir_senha(p_usuario_id uuid, p_senha text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare p public.perfis;
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  if length(coalesce(p_senha, '')) < 10 then raise exception 'SENHA_CURTA'; end if;
  if p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then raise exception 'SENHA_FRACA'; end if;
  select * into p from public.perfis where id = p_usuario_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now() where id = p_usuario_id;
  perform public._plat_auditar('Senha redefinida pela plataforma', p.email, p.escritorio_id);
  return jsonb_build_object('ok', true);
end $$;

-- Só escritórios SEM funcionários cadastrados (por exemplo, criados por engano) podem ser excluídos.
create or replace function public.plataforma_excluir_escritorio(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare e public.escritorios;
begin
  if not public.eh_plataforma() then raise exception 'SEM_PERMISSAO'; end if;
  select * into e from public.escritorios where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if exists (select 1 from public.funcionarios where escritorio_id = p_id) then raise exception 'ESCRITORIO_COM_DADOS'; end if;
  delete from auth.users where id in (select id from public.perfis where escritorio_id = p_id);
  delete from public.configuracoes where escritorio_id = p_id;
  delete from public.escalas where escritorio_id = p_id;
  delete from public.cargos where escritorio_id = p_id;
  delete from public.feriados where escritorio_id = p_id;
  delete from public.escritorios where id = p_id;
  perform public._plat_auditar('Escritório excluído', e.nome || ' (' || e.slug || ')', null);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Permissões ----------
revoke all on function public._validar_acesso(text, text, text) from public, anon, authenticated;
revoke all on function public._criar_auth_user(text, text) from public, anon, authenticated;
revoke all on function public._nome_logado() from public, anon, authenticated;
revoke all on function public._plat_auditar(text, text, uuid) from public, anon, authenticated;
revoke all on function public._admins_ativos(uuid) from public, anon, authenticated;
revoke all on function public._semear_escritorio(uuid, text) from public, anon, authenticated;
revoke all on function public.minha_sessao() from public, anon;
revoke all on function public.criar_usuario(text, text, text, text) from public, anon;
revoke all on function public.atualizar_usuario(uuid, text, text, boolean) from public, anon;
revoke all on function public.redefinir_senha_usuario(uuid, text) from public, anon;
revoke all on function public.remover_usuario(uuid) from public, anon;
revoke all on function public.plataforma_criar_escritorio(text, text, text, text, text, text) from public, anon;
revoke all on function public.plataforma_listar_escritorios() from public, anon;
revoke all on function public.plataforma_atualizar_escritorio(uuid, text, boolean, text) from public, anon;
revoke all on function public.plataforma_listar_usuarios(uuid) from public, anon;
revoke all on function public.plataforma_criar_admin(uuid, text, text, text) from public, anon;
revoke all on function public.plataforma_redefinir_senha(uuid, text) from public, anon;
revoke all on function public.plataforma_excluir_escritorio(uuid) from public, anon;
grant execute on function public.minha_sessao() to authenticated;
grant execute on function public.criar_usuario(text, text, text, text) to authenticated;
grant execute on function public.atualizar_usuario(uuid, text, text, boolean) to authenticated;
grant execute on function public.redefinir_senha_usuario(uuid, text) to authenticated;
grant execute on function public.remover_usuario(uuid) to authenticated;
grant execute on function public.plataforma_criar_escritorio(text, text, text, text, text, text) to authenticated;
grant execute on function public.plataforma_listar_escritorios() to authenticated;
grant execute on function public.plataforma_atualizar_escritorio(uuid, text, boolean, text) to authenticated;
grant execute on function public.plataforma_listar_usuarios(uuid) to authenticated;
grant execute on function public.plataforma_criar_admin(uuid, text, text, text) to authenticated;
grant execute on function public.plataforma_redefinir_senha(uuid, text) to authenticated;
grant execute on function public.plataforma_excluir_escritorio(uuid) to authenticated;

insert into public.schema_versao (versao, nome) values (4, 'acessos e plataforma') on conflict (versao) do nothing;
