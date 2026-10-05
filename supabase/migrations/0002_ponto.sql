-- =====================================================================
-- GE ADVOCACIA · 0002 · ponto por PIN (cerca de GPS, bloqueio de tentativas, marcações)
--  * a tela pública de ponto é por escritório: /ponto/<slug>
--  * toda função pública deriva o escritório do PRÓPRIO funcionário (nunca de um parâmetro solto)
--  * marcação duplicada impedida pelo banco (índice único) — duas abas/dois toques geram uma só linha
-- Idempotente.
-- =====================================================================

-- ---------- Marcações ----------
create table if not exists public.registros_ponto (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  funcionario_id uuid not null,
  data date not null,
  tipo text not null check (tipo in ('entrada', 'saida_intervalo', 'retorno_intervalo', 'saida')),
  horario_previsto text,
  horario_real timestamptz not null default now(),
  diferenca_minutos int,
  status text not null default 'no_horario'
    check (status in ('no_horario', 'tolerancia', 'atraso', 'saida_antecipada', 'extra', 'manual', 'pendente')),
  justificativa text,
  latitude double precision,
  longitude double precision,
  status_aprovacao text not null default 'aprovado' check (status_aprovacao in ('aprovado', 'pendente', 'rejeitado')),
  retroativo boolean not null default false,
  motivo_rejeicao text,
  aprovado_por uuid,
  aprovado_em timestamptz,
  -- análise do administrador sobre atraso / saída antecipada acima do limite
  analise text check (analise in ('pendente', 'aceita', 'recusada')),
  motivo_decisao text,
  decidido_por uuid,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  unique (escritorio_id, id),
  -- RESTRICT: apagar funcionário nunca leva o histórico junto (a regra completa está em 0003)
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete restrict
);
create index if not exists registros_func_data_idx on public.registros_ponto (funcionario_id, data);
create index if not exists registros_escritorio_data_idx on public.registros_ponto (escritorio_id, data);
create index if not exists registros_pendentes_idx on public.registros_ponto (status_aprovacao) where status_aprovacao = 'pendente';
create index if not exists registros_analise_idx on public.registros_ponto (analise) where analise = 'pendente';

-- 1.1 · Duplicidades que já existam (mesmo funcionário, dia e tipo, não rejeitadas): fica a mais antiga,
-- as demais viram "rejeitado" com motivo explícito. A migração nunca falha por causa de duplicatas antigas.
with dup as (
  select id, row_number() over (partition by funcionario_id, data, tipo order by horario_real, created_at, id) as n
    from public.registros_ponto where status_aprovacao <> 'rejeitado'
)
update public.registros_ponto r
   set status_aprovacao = 'rejeitado', motivo_rejeicao = 'Duplicidade removida na migração 0002'
  from dup where dup.id = r.id and dup.n > 1;

create unique index if not exists registros_ponto_unico_idx
  on public.registros_ponto (funcionario_id, data, tipo) where status_aprovacao <> 'rejeitado';

select public._aplicar_rls_tenant('registros_ponto', true, true, true, false);
select public._auditar_tabela('registros_ponto');

-- ---------- Feriados ----------
create table if not exists public.feriados (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  data date not null,
  nome text not null,
  tipo text not null check (tipo in ('nacional', 'estadual', 'municipal', 'facultativo', 'recesso')),
  unique (escritorio_id, data)
);
select public._aplicar_rls_tenant('feriados', true);
select public._auditar_tabela('feriados');

-- ---------- Funções de apoio ----------
create or replace function public._turno_previsto(p_dias jsonb, p_dow int, p_tipo text) returns text
language sql immutable as $$
  select case when coalesce((p_dias -> p_dow::text ->> 'ativo')::boolean, false)
              then nullif(p_dias -> p_dow::text ->> p_tipo, '') end
$$;

create or replace function public._distancia_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language plpgsql immutable as $$
declare a double precision;
begin
  a := sin(radians(lat2 - lat1) / 2) ^ 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) ^ 2;
  return 6371000 * 2 * atan2(sqrt(a), sqrt(1 - a));
end $$;

create or replace function public._hhmm_min(p text) returns int language sql immutable as $$
  select split_part(p, ':', 1)::int * 60 + split_part(p, ':', 2)::int
$$;

-- Classificação idêntica à do front (src/lib/ponto.ts). Casos de referência em src/lib/__fixtures__/casos-regra.json.
create or replace function public._classificar(p_tipo text, p_previsto text, p_real_min int, p_tol int, p_lim int, out diferenca int, out status text)
language plpgsql immutable as $$
declare entrando boolean := p_tipo in ('entrada', 'retorno_intervalo');
begin
  if p_previsto is null then diferenca := 0; status := 'extra'; return; end if;
  diferenca := p_real_min - public._hhmm_min(p_previsto);
  if abs(diferenca) <= p_tol then status := 'no_horario';
  elsif entrando and diferenca >= p_lim then status := 'atraso';
  elsif not entrando and diferenca <= -p_lim then status := 'saida_antecipada';
  elsif not entrando and diferenca > 0 then status := 'extra';
  else status := 'tolerancia';
  end if;
end $$;

create or replace function public._erro(p_codigo text, p_detalhe text default null) returns jsonb
language sql immutable as $$
  select jsonb_build_object('ok', false, 'erro', p_codigo, 'detalhe', p_detalhe)
$$;

-- Valida o PIN com bloqueio de 10 min. Devolve um código (não lança exceção: uma exceção desfaria a transação
-- e apagaria o registro da tentativa, anulando o bloqueio).
-- Bloqueios: 5 erros da mesma origem para a mesma pessoa; 15 erros da mesma origem em qualquer pessoa;
-- 25 erros de origens diferentes para a mesma pessoa. Um colega não consegue travar o outro.
-- O escritório precisa estar ativo (suspenso = ponto indisponível).
create or replace function public._validar_pin(p_id uuid, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_hash text; v_ok boolean; v_origem text := public._origem(); v_ult timestamptz; v_esc uuid; v_ativo boolean;
begin
  select f.escritorio_id, (f.ativo and e.ativo and (f.data_desligamento is null or f.data_desligamento >= public._hoje(f.escritorio_id)))
    into v_esc, v_ativo
    from public.funcionarios f join public.escritorios e on e.id = f.escritorio_id where f.id = p_id;
  if v_esc is not null and exists (select 1 from public.escritorios where id = v_esc and not ativo) then return 'ESCRITORIO_SUSPENSO'; end if;

  select coalesce(max(created_at), '-infinity') into v_ult from public.pin_tentativas
   where funcionario_id = p_id and sucesso and origem = v_origem;
  if (select count(*) from public.pin_tentativas where funcionario_id = p_id and origem = v_origem and not sucesso
        and created_at > now() - interval '10 minutes' and created_at > v_ult) >= 5 then return 'PIN_BLOQUEADO'; end if;
  if v_origem <> '' and (select count(*) from public.pin_tentativas where origem = v_origem and not sucesso
        and created_at > now() - interval '10 minutes') >= 15 then return 'PIN_BLOQUEADO'; end if;
  if (select count(*) from public.pin_tentativas where funcionario_id = p_id and not sucesso
        and created_at > now() - interval '10 minutes') >= 25 then return 'PIN_BLOQUEADO'; end if;

  select h.pin_hash into v_hash from public.funcionario_pins h where h.funcionario_id = p_id;
  v_ok := coalesce(v_ativo, false) and v_hash is not null and p_pin is not null and v_hash = crypt(p_pin, v_hash);
  if v_esc is not null then
    insert into public.pin_tentativas (funcionario_id, escritorio_id, sucesso, origem) values (p_id, v_esc, v_ok, v_origem);
  end if;
  return case when v_ok then 'ok' else 'PIN_INVALIDO' end;
end $$;

-- ---------- API pública do ponto (sem login, protegida por PIN) ----------
-- Devolve {"ok": false, "erro": "CODIGO"} para erros de negócio.

-- Busca no servidor: mínimo 3 letras, no máximo 5 resultados, só no escritório do endereço (/ponto/<slug>).
drop function if exists public.ponto_buscar(text);
create or replace function public.ponto_buscar(p_slug text, p_termo text)
returns table (id uuid, nome text, cargo_nome text, escala_id uuid)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  v text := replace(replace(replace(public._norm(trim(coalesce(p_termo, ''))), '\', ''), '%', ''), '_', '');
  v_esc uuid;
begin
  if length(v) < 3 then return; end if;
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

drop function if exists public.ponto_escala(uuid);
create or replace function public.ponto_escala(p_slug text, p_escala_id uuid) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object('id', s.id, 'nome', s.nome, 'dias', s.dias, 'ativo', s.ativo)
    from public.escalas s join public.escritorios e on e.id = s.escritorio_id
   where s.id = p_escala_id and e.slug = lower(trim(coalesce(p_slug, ''))) and e.ativo
$$;

drop function if exists public.ponto_contexto();
create or replace function public.ponto_contexto(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare e public.escritorios;
begin
  select * into e from public.escritorios where slug = lower(trim(coalesce(p_slug, '')));
  if not found then return public._erro('ESCRITORIO_NAO_ENCONTRADO'); end if;
  if not e.ativo then return public._erro('ESCRITORIO_SUSPENSO'); end if;
  return jsonb_build_object('ok', true,
    'ponto', coalesce((select dados -> 'ponto' from public.configuracoes where escritorio_id = e.id), '{}'::jsonb),
    'escritorio_nome', coalesce((select dados -> 'escritorio' ->> 'nome' from public.configuracoes where escritorio_id = e.id), e.nome),
    'fuso', e.fuso,
    'feriado', (select f.nome from public.feriados f where f.escritorio_id = e.id and f.data = (now() at time zone e.fuso)::date));
end $$;

create or replace function public.ponto_bater(
  p_func_id uuid, p_pin text, p_tipo text, p_justificativa text default null,
  p_lat double precision default null, p_lng double precision default null
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_pin text; v_esc uuid; v_pt jsonb; v_tz text; v_local timestamp; v_data date; v_min int; v_dias jsonb; v_prev text;
  v_c record; v_id uuid; v_dist double precision; v_raio int; v_analise text; v_agora timestamptz := now();
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  if p_tipo not in ('entrada', 'saida_intervalo', 'retorno_intervalo', 'saida') then return public._erro('TIPO_INVALIDO'); end if;
  select escritorio_id into v_esc from public.funcionarios where id = p_func_id;
  v_tz := public._fuso(v_esc);
  v_local := v_agora at time zone v_tz;
  v_data := v_local::date;
  v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  select coalesce(dados -> 'ponto', '{}'::jsonb) into v_pt from public.configuracoes where escritorio_id = v_esc;
  v_pt := coalesce(v_pt, '{}'::jsonb);

  -- Cerca de GPS: só registra dentro do raio do escritório. O servidor recalcula a distância (o navegador é só conveniência).
  if coalesce((v_pt ->> 'geofence_ativo')::boolean, false) then
    if (v_pt ->> 'geofence_lat') is null or (v_pt ->> 'geofence_lng') is null then return public._erro('LOCAL_NAO_CONFIGURADO'); end if;
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return public._erro('GPS_OBRIGATORIO'); end if;
    v_raio := coalesce(nullif((v_pt ->> 'geofence_raio_m')::int, 0), 900);
    v_dist := public._distancia_m(p_lat, p_lng, (v_pt ->> 'geofence_lat')::double precision, (v_pt ->> 'geofence_lng')::double precision);
    if v_dist > v_raio then return public._erro('FORA_DA_AREA', format('%s m (máx. %s m)', round(v_dist), v_raio)); end if;
  end if;

  if exists (select 1 from public.registros_ponto where funcionario_id = p_func_id and data = v_data
              and tipo = p_tipo and status_aprovacao <> 'rejeitado') then
    return public._erro('JA_REGISTRADO');
  end if;

  select e.dias into v_dias from public.escalas e join public.funcionarios f on f.escritorio_id = e.escritorio_id and f.escala_id = e.id where f.id = p_func_id;
  v_prev := public._turno_previsto(v_dias, extract(dow from v_data)::int, p_tipo);
  select * into v_c from public._classificar(p_tipo, v_prev, v_min,
      coalesce((v_pt ->> 'tolerancia_min')::int, 5), coalesce((v_pt ->> 'limite_atraso_min')::int, 30));

  if v_c.status in ('atraso', 'saida_antecipada') and length(trim(coalesce(p_justificativa, ''))) < 3 then
    return public._erro('JUSTIFICATIVA_OBRIGATORIA', v_c.status);
  end if;

  -- Atraso ou saída antecipada acima do limite vai para análise do administrador (aba Ocorrências).
  v_analise := case when v_c.status in ('atraso', 'saida_antecipada') then 'pendente' end;

  -- O índice único é a barreira final: duas chamadas simultâneas passam na checagem acima, mas só uma insere.
  begin
    insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, horario_previsto, horario_real, diferenca_minutos,
                                        status, justificativa, latitude, longitude, analise)
    values (v_esc, p_func_id, v_data, p_tipo, v_prev, v_agora, v_c.diferenca, v_c.status, nullif(trim(p_justificativa), ''), p_lat, p_lng, v_analise)
    returning id into v_id;
  exception when unique_violation then
    return public._erro('JA_REGISTRADO');
  end;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_c.status, 'diferenca_minutos', v_c.diferenca, 'horario_real', v_agora, 'analise', v_analise);
end $$;

-- ---------- Gestão ----------
create or replace function public.aprovar_ponto(p_id uuid, p_acao text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare r public.registros_ponto; v_c record; v_pt jsonb; v_tz text;
begin
  if not public.eh_gestao() then raise exception 'SEM_PERMISSAO'; end if;
  if p_acao not in ('aprovar', 'rejeitar') then raise exception 'ACAO_INVALIDA'; end if;
  if p_acao = 'rejeitar' and length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  select * into r from public.registros_ponto where id = p_id and escritorio_id = public.meu_escritorio();
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if p_acao = 'aprovar' then
    v_tz := public._fuso(r.escritorio_id);
    select coalesce(dados -> 'ponto', '{}'::jsonb) into v_pt from public.configuracoes where escritorio_id = r.escritorio_id;
    select * into v_c from public._classificar(r.tipo, r.horario_previsto,
       (extract(hour from r.horario_real at time zone v_tz)::int * 60 + extract(minute from r.horario_real at time zone v_tz)::int),
       coalesce((v_pt ->> 'tolerancia_min')::int, 5), coalesce((v_pt ->> 'limite_atraso_min')::int, 30));
    update public.registros_ponto set status_aprovacao = 'aprovado', status = v_c.status, diferenca_minutos = v_c.diferenca,
           aprovado_em = now(), aprovado_por = auth.uid(), motivo_rejeicao = null where id = p_id;
  else
    update public.registros_ponto set status_aprovacao = 'rejeitado', motivo_rejeicao = trim(p_motivo),
           aprovado_em = now(), aprovado_por = auth.uid() where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Equipe sem dados sensíveis (salário, CPF, banco) para a gerência
create or replace function public.equipe()
returns table (id uuid, nome text, cargo_id uuid, escala_id uuid, ativo boolean, data_admissao date,
               data_desligamento date, vinculo text, tem_pin boolean)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_gestao() then raise exception 'SEM_PERMISSAO'; end if;
  return query select f.id, f.nome, f.cargo_id, f.escala_id, f.ativo, f.data_admissao, f.data_desligamento, f.vinculo, f.tem_pin
                 from public.funcionarios f where f.escritorio_id = public.meu_escritorio() order by f.nome;
end $$;

create or replace function public.definir_pin(p_func_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_esc uuid := public.meu_escritorio();
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if not exists (select 1 from public.funcionarios where id = p_func_id and escritorio_id = v_esc) then raise exception 'NAO_ENCONTRADO'; end if;
  if p_pin !~ '^[0-9]{6,8}$' then raise exception 'PIN_FORMATO'; end if;
  if p_pin ~ '^(\d)\1+$' or position(p_pin in '01234567890123456789') > 0 or position(p_pin in '98765432109876543210') > 0
     or p_pin ~ '^(\d\d)\1+$' or p_pin ~ '^(\d\d\d)\1+$' or p_pin in ('123123', '112233', '121212', '654321') then
    raise exception 'PIN_FRACO';
  end if;
  insert into public.funcionario_pins (funcionario_id, escritorio_id, pin_hash) values (p_func_id, v_esc, crypt(p_pin, gen_salt('bf')))
  on conflict (funcionario_id) do update set pin_hash = excluded.pin_hash, atualizado_em = now();
  update public.funcionarios set tem_pin = true, pin_curto = false where id = p_func_id;
  delete from public.pin_tentativas where funcionario_id = p_func_id;
end $$;

-- ---------- Permissões ----------
revoke all on function public._validar_pin(uuid, text) from public, anon, authenticated;
revoke all on function public._erro(text, text) from public, anon, authenticated;
revoke all on function public.definir_pin(uuid, text) from public, anon;
revoke all on function public.aprovar_ponto(uuid, text, text) from public, anon;
revoke all on function public.equipe() from public, anon;
revoke all on function public.ponto_buscar(text, text) from public;
revoke all on function public.ponto_escala(text, uuid) from public;
revoke all on function public.ponto_contexto(text) from public;
revoke all on function public.ponto_bater(uuid, text, text, text, double precision, double precision) from public;
grant execute on function public.ponto_buscar(text, text) to anon, authenticated;
grant execute on function public.ponto_escala(text, uuid) to anon, authenticated;
grant execute on function public.ponto_contexto(text) to anon, authenticated;
grant execute on function public.ponto_bater(uuid, text, text, text, double precision, double precision) to anon, authenticated;
grant execute on function public.definir_pin(uuid, text) to authenticated;
grant execute on function public.aprovar_ponto(uuid, text, text) to authenticated;
grant execute on function public.equipe() to authenticated;

insert into public.schema_versao (versao, nome) values (2, 'ponto por PIN') on conflict (versao) do nothing;
