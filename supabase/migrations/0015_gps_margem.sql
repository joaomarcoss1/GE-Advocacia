-- 0015 · GPS mais justo: tolerância configurável por escritório (geofence_margem_m)
-- A cerca passa a aceitar raio + margem (padrão 30 m, máximo 150 m). O servidor continua recalculando a distância a cada registro.
-- Idempotente: pode ser aplicada mais de uma vez.

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
    -- raio configurado + tolerância do GPS (o aparelho erra algumas dezenas de metros, principalmente dentro de prédios; padrão 30 m, máx. 150 m)
    v_raio := coalesce(nullif((v_pt ->> 'geofence_raio_m')::int, 0), 900)
              + least(greatest(round(coalesce((v_pt ->> 'geofence_margem_m')::numeric, 30))::int, 0), 150);
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

insert into public.schema_versao (versao, nome) values (15, 'tolerancia do GPS por escritorio') on conflict (versao) do nothing;
