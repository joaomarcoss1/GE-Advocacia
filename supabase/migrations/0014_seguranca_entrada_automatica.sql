-- =====================================================================
-- GE ADVOCACIA · 0014 · limite de taxa, entrada automática pelo ponto e retenção do registro de acessos
--  * limite de taxa no banco: por origem (IP), em janela fixa; vale para o que é público (busca de nome no ponto,
--    contexto do escritório, verificação de documento, entrada automática)
--  * entrada automática: depois do ponto confirmado (PIN + entrada do dia), a função "ponto-entrar" abre a sessão do funcionário
--    com o nível dele. Administrador e gerência sempre entram com senha; senha provisória exige a troca antes.
--  * o registro de acessos é apagado depois de 12 meses
-- Idempotente.
-- =====================================================================

-- ---------- Limite de taxa ----------
create table if not exists public.limite_taxa (
  chave text not null,
  janela timestamptz not null,
  n int not null default 1,
  primary key (chave, janela)
);
alter table public.limite_taxa enable row level security;
revoke all on public.limite_taxa from anon, authenticated;

-- Conta uma chamada na janela de p_janela_seg segundos; devolve false quando a chave passou de p_max.
-- Sem origem conhecida (chave terminada em ":"), não limita (testes locais e chamadas internas).
create or replace function public._limitar(p_chave text, p_max int, p_janela_seg int) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_janela timestamptz := to_timestamp(floor(extract(epoch from now()) / p_janela_seg) * p_janela_seg); v_n int;
begin
  if p_chave is null or right(p_chave, 1) = ':' then return true; end if;
  insert into public.limite_taxa (chave, janela, n) values (left(p_chave, 120), v_janela, 1)
  on conflict (chave, janela) do update set n = public.limite_taxa.n + 1 returning n into v_n;
  if random() < 0.01 then delete from public.limite_taxa where janela < now() - interval '1 day'; end if;
  return v_n <= p_max;
end $$;
revoke all on function public._limitar(text, int, int) from public, anon, authenticated;


-- Funções públicas com limite por origem (antes eram só de leitura; agora gravam o contador).
create or replace function public.ponto_buscar(p_slug text, p_termo text)
returns table (id uuid, nome text, cargo_nome text, escala_id uuid)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v text := replace(replace(replace(public._norm(trim(coalesce(p_termo, ''))), '\', ''), '%', ''), '_', '');
  v_esc uuid;
begin
  if length(v) < 3 then return; end if;
  if not public._limitar('buscar:' || public._origem(), 60, 60) then return; end if;     -- limite por origem: impede varrer nomes da equipe
  select e.id into v_esc from public.escritorios e where e.slug = lower(trim(coalesce(p_slug, ''))) and e.ativo;
  if v_esc is null then return; end if;
  return query
    select f.id, f.nome, c.nome, f.escala_id
      from public.funcionarios f left join public.cargos c on c.escritorio_id = f.escritorio_id and c.id = f.cargo_id
     where f.escritorio_id = v_esc and f.ativo and f.tem_pin
       and (f.data_desligamento is null or f.data_desligamento >= public._hoje(v_esc))
       and public._norm(f.nome) like '%' || v || '%'
     order by f.nome limit 5;
end $$;
create or replace function public.ponto_contexto(p_slug text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare e public.escritorios;
begin
  if not public._limitar('ctx:' || public._origem(), 120, 60) then return public._erro('LIMITE'); end if;
  select * into e from public.escritorios where slug = lower(trim(coalesce(p_slug, '')));
  if not found then return public._erro('ESCRITORIO_NAO_ENCONTRADO'); end if;
  if not e.ativo then return public._erro('ESCRITORIO_SUSPENSO'); end if;
  return jsonb_build_object('ok', true,
    'ponto', coalesce((select dados -> 'ponto' from public.configuracoes where escritorio_id = e.id), '{}'::jsonb),
    'escritorio_nome', coalesce((select dados -> 'escritorio' ->> 'nome' from public.configuracoes where escritorio_id = e.id), e.nome),
    'fuso', e.fuso,
    'feriado', (select f.nome from public.feriados f where f.escritorio_id = e.id and f.data = (now() at time zone e.fuso)::date));
end $$;
create or replace function public.verificar_documento(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare d public.documentos_emitidos; v_nome text;
begin
  if not public._limitar('verif:' || public._origem(), 30, 60) then return jsonb_build_object('ok', false, 'erro', 'LIMITE'); end if;
  select * into d from public.documentos_emitidos where codigo = upper(trim(coalesce(p_codigo, '')));
  if not found then return jsonb_build_object('ok', false); end if;
  select e.nome into v_nome from public.escritorios e where e.id = d.escritorio_id;
  return jsonb_build_object('ok', true, 'codigo', d.codigo, 'tipo', d.tipo, 'titulo', d.titulo, 'periodo', d.periodo,
                            'resumo', d.resumo, 'hash', d.hash, 'emitido_por', d.emitido_por, 'emitido_em', d.emitido_em, 'escritorio', v_nome);
end $$;

-- ---------- Entrada automática ----------
alter table public.acesso_config add column if not exists entrada_automatica boolean not null default true;

create or replace function public.definir_entrada_automatica(p_valor boolean) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.perfis := public._perfil_atual();
begin
  if a.id is null or not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  insert into public.acesso_config (escritorio_id, entrada_automatica) values (a.escritorio_id, coalesce(p_valor, true))
  on conflict (escritorio_id) do update set entrada_automatica = excluded.entrada_automatica, updated_at = now();
  perform public._log_acesso(a.escritorio_id, a.id, a.nome, 'politica_ponto', case when coalesce(p_valor, true) then 'entrada automática pelo ponto: ligada' else 'entrada automática pelo ponto: desligada' end);
end $$;
revoke all on function public.definir_entrada_automatica(boolean) from public, anon;
grant execute on function public.definir_entrada_automatica(boolean) to authenticated;

create or replace function public.acesso_politica() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not (public.tem_permissao('acessos.gerenciar') or public.tem_permissao('ponto.gerir')) then raise exception 'SEM_PERMISSAO'; end if;
  return jsonb_build_object('exigir_ponto', coalesce((select exigir_ponto from public.acesso_config where escritorio_id = public.meu_escritorio()), true),
    'entrada_automatica', coalesce((select entrada_automatica from public.acesso_config where escritorio_id = public.meu_escritorio()), true),
    'papeis', (select jsonb_object_agg(r.papel, jsonb_build_object('permissoes', to_jsonb(coalesce(pp.permissoes, public._permissoes_padrao(r.papel))), 'personalizado', pp.papel is not null))
                 from (values ('gerente'), ('coordenador'), ('advogado'), ('financeiro'), ('secretaria'), ('estagiario'), ('colaborador')) r (papel)
                 left join public.papeis_permissoes pp on pp.escritorio_id = public.meu_escritorio() and pp.papel = r.papel));
end $$;
revoke all on function public.acesso_politica() from public, anon;
grant execute on function public.acesso_politica() to authenticated;

-- Só a Edge Function "ponto-entrar" (service_role) chama. Valida o PIN (com bloqueio por origem) e só libera quem:
--  * tem login ativo ligado ao cadastro; * depende do ponto para entrar (administrador e gerência entram com senha);
--  * já trocou a senha provisória; * tem entrada confirmada hoje e ainda não registrou a saída.
create or replace function public.ponto_acesso(p_func_id uuid, p_pin text, p_origem text default '') returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text; p public.perfis; v_hoje date; v_origem text := left(coalesce(p_origem, ''), 64);
begin
  perform set_config('request.headers', json_build_object('x-forwarded-for', v_origem)::text, true);   -- o bloqueio do PIN usa a origem de quem chamou
  if not public._limitar('acesso:' || v_origem, 20, 60) then return public._erro('LIMITE'); end if;
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  select * into p from public.perfis where funcionario_id = p_func_id;
  if not found or not p.ativo or not exists (select 1 from public.escritorios e where e.id = p.escritorio_id and e.ativo) then return public._erro('SEM_ACESSO'); end if;
  if not coalesce((select entrada_automatica from public.acesso_config where escritorio_id = p.escritorio_id), true) then return public._erro('ENTRADA_MANUAL'); end if;
  if p.papel in ('admin', 'gerente') or not coalesce(p.exige_ponto, public._papel_exige_ponto(p.papel)) then return public._erro('ENTRADA_MANUAL'); end if;
  if p.trocar_senha then return public._erro('TROCAR_SENHA'); end if;
  v_hoje := public._hoje(p.escritorio_id);
  if not exists (select 1 from public.registros_ponto r where r.funcionario_id = p_func_id and r.data = v_hoje and r.tipo = 'entrada' and r.status_aprovacao <> 'rejeitado')
     or exists (select 1 from public.registros_ponto r where r.funcionario_id = p_func_id and r.data = v_hoje and r.tipo = 'saida' and r.status_aprovacao <> 'rejeitado') then
    return public._erro('SEM_PONTO');
  end if;
  update public.perfis set ultimo_acesso = now() where id = p.id;
  perform public._log_acesso(p.escritorio_id, p.id, p.nome, 'login', 'entrada automática pelo ponto');
  return jsonb_build_object('ok', true, 'email', p.email, 'perfil_id', p.id, 'nome', p.nome);
end $$;
revoke all on function public.ponto_acesso(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ponto_acesso(uuid, text, text) to service_role;

-- ---------- Retenção do registro de acessos: 12 meses ----------
create or replace function public.expurgar_acessos_antigos() returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int;
begin
  delete from public.acessos_log where created_at < now() - interval '12 months';
  get diagnostics n = row_count;
  delete from public.liberacoes_acesso where ate < now() - interval '12 months';
  return n;
end $$;
revoke all on function public.expurgar_acessos_antigos() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('ge-expurgo-acessos') where exists (select 1 from cron.job where jobname = 'ge-expurgo-acessos');
    perform cron.schedule('ge-expurgo-acessos', '25 6 * * *', 'select public.expurgar_acessos_antigos()');
  end if;
exception when others then null;
end $$;

-- ---------- Menos superfície para quem não tem login ----------
-- Estas funções só servem às políticas e às telas do painel (usuário logado); o visitante anônimo não precisa chamá-las.
revoke all on function public.eh_admin(), public.eh_gestao(), public.eh_plataforma(), public.meu_escritorio(), public.papel_atual(), public.cnj_normalizar(text) from public, anon;
grant execute on function public.eh_admin(), public.eh_gestao(), public.eh_plataforma(), public.meu_escritorio(), public.papel_atual(), public.cnj_normalizar(text) to authenticated, service_role;

insert into public.schema_versao (versao, nome) values (14, 'limite de taxa e entrada automatica pelo ponto') on conflict (versao) do nothing;
