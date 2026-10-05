-- =====================================================================
-- GE ADVOCACIA · 0005 · atestados no Storage privado, rastro de acessos e retenção (LGPD)
--  2.1  bucket PRIVADO "anexos": sem política pública; só a Edge Function (service_role) grava e assina URLs de 60 s
--  2.2  cada abertura de atestado é registrada em acessos_sensiveis (somente inserção)
--  2.3  prazos de guarda por escritório + expurgo com prévia e trilha de auditoria
-- Os prazos padrão são ponto de partida: CONFIRMAR COM O JURÍDICO/CONTABILIDADE de cada escritório.
-- Idempotente.
-- =====================================================================

-- ---------- 2.1 · Bucket privado ----------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('anexos', 'anexos', false, 2097152, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = 2097152,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    -- Nenhuma política em storage.objects para anon/authenticated: o acesso é só pela Edge Function "anexos".
  end if;
end $$;

-- ---------- 2.2 · Abrir um anexo: só administrador, do próprio escritório, e fica registrado ----------
create or replace function public.anexo_abrir(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.anexos;
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  select * into a from public.anexos where id = p_id and escritorio_id = public.meu_escritorio();
  if not found or a.storage_path is null then raise exception 'NAO_ENCONTRADO'; end if;
  insert into public.acessos_sensiveis (escritorio_id, usuario_id, usuario, anexo_id, funcionario_id, acao, origem)
  values (a.escritorio_id, auth.uid(),
          coalesce((select nome || ' <' || email || '>' from public.perfis where id = auth.uid()), auth.uid()::text),
          a.id, a.funcionario_id, 'abrir', nullif(public._origem(), ''));
  return jsonb_build_object('ok', true, 'path', a.storage_path, 'nome', a.nome, 'mime', a.mime);
end $$;

-- ---------- 2.3 · Retenção e minimização ----------
create or replace function public._retencao(p_esc uuid) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object(
    'anexos_meses', coalesce((c.dados -> 'privacidade' ->> 'anexos_meses')::int, 60),
    'geolocalizacao_meses', coalesce((c.dados -> 'privacidade' ->> 'geolocalizacao_meses')::int, 12),
    'tentativas_dias', 90)
  from (select 1) x left join public.configuracoes c on c.escritorio_id = p_esc
$$;

-- Quanto seria apagado agora (prévia) e, com p_confirmar = true, apaga e registra na auditoria.
create or replace function public.expurgo_executar(p_confirmar boolean default false) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_esc uuid := public.meu_escritorio(); r jsonb; v_anexos int; v_geo int; v_tent int; v_lixeira int;
  v_corte_anexos timestamptz; v_corte_geo date; v_corte_tent timestamptz;
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  r := public._retencao(v_esc);
  v_corte_anexos := now() - make_interval(months => (r ->> 'anexos_meses')::int);
  v_corte_geo := public._hoje(v_esc) - ((r ->> 'geolocalizacao_meses')::int * 30);
  v_corte_tent := now() - make_interval(days => (r ->> 'tentativas_dias')::int);

  select count(*) into v_anexos from public.anexos where escritorio_id = v_esc and created_at < v_corte_anexos;
  select count(*) into v_geo from public.registros_ponto where escritorio_id = v_esc and data < v_corte_geo and (latitude is not null or longitude is not null);
  select count(*) into v_tent from public.pin_tentativas where escritorio_id = v_esc and created_at < v_corte_tent;

  if p_confirmar then
    insert into public._expurgo_ativo (tx) values (txid_current()) on conflict do nothing;
    delete from public.anexos where escritorio_id = v_esc and created_at < v_corte_anexos;
    update public.registros_ponto set latitude = null, longitude = null
     where escritorio_id = v_esc and data < v_corte_geo and (latitude is not null or longitude is not null);
    delete from public.pin_tentativas where escritorio_id = v_esc and created_at < v_corte_tent;
    delete from public._expurgo_ativo where tx = txid_current();
    insert into public.auditoria (escritorio_id, usuario, usuario_id, acao, detalhe, tabela, origem)
    values (v_esc, public._nome_logado(), auth.uid(), 'Expurgo de retenção',
            format('anexos: %s · geolocalização de marcações: %s · tentativas de PIN: %s', v_anexos, v_geo, v_tent), 'retencao', nullif(public._origem(), ''));
  end if;
  select count(*) into v_lixeira from public.anexos_lixeira where escritorio_id = v_esc;
  return jsonb_build_object('ok', true, 'executado', p_confirmar, 'anexos', v_anexos, 'geolocalizacao', v_geo, 'tentativas_pin', v_tent,
                            'arquivos_a_remover_do_storage', v_lixeira, 'regras', r);
end $$;

-- Rotina automática (todos os escritórios): só tentativas de PIN com mais de 90 dias. Dados de saúde e geolocalização
-- só saem por decisão do administrador do escritório (expurgo_executar).
create or replace function public.expurgar_tentativas_antigas() returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int;
begin
  delete from public.pin_tentativas where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ge-expurgo-tentativas', '15 6 * * *', 'select public.expurgar_tentativas_antigas()');
  end if;
exception when others then null;   -- agendamento é opcional; o botão manual continua disponível
end $$;

-- ---------- Backup externo: o workflow de backup registra cada sucesso (3.4 · alerta se passar de 48 h) ----------
create table if not exists public.backup_status (
  id int primary key default 1 check (id = 1),
  ultimo_sucesso timestamptz,
  detalhe text
);
alter table public.backup_status enable row level security;
revoke all on public.backup_status from anon, authenticated;
insert into public.backup_status (id) values (1) on conflict (id) do nothing;

-- Chamada pelo workflow de backup, com a conexão direta do banco (SUPABASE_DB_URL), nunca pela API.
create or replace function public.backup_registrar(p_detalhe text default null) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  update public.backup_status set ultimo_sucesso = now(), detalhe = left(p_detalhe, 300) where id = 1
$$;
-- Administradores (de escritório ou da plataforma) veem só a DATA do último backup (tela Diagnóstico).
create or replace function public.backup_ultimo() returns timestamptz
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select ultimo_sucesso from public.backup_status where id = 1 and (public.eh_admin() or public.eh_plataforma())
$$;

-- ---------- Permissões ----------
revoke all on function public.backup_registrar(text) from public, anon, authenticated;
revoke all on function public.backup_ultimo() from public, anon;
grant execute on function public.backup_ultimo() to authenticated;
revoke all on function public.anexo_abrir(uuid) from public, anon;
revoke all on function public._retencao(uuid) from public, anon, authenticated;
revoke all on function public.expurgo_executar(boolean) from public, anon;
revoke all on function public.expurgar_tentativas_antigas() from public, anon, authenticated;
grant execute on function public.anexo_abrir(uuid) to authenticated;
grant execute on function public.expurgo_executar(boolean) to authenticated;

insert into public.schema_versao (versao, nome) values (5, 'privacidade e retencao') on conflict (versao) do nothing;
