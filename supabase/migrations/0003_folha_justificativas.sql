-- =====================================================================
-- GE ADVOCACIA · 0003 · ocorrências, atestados, ajustes, folha e integridade dos dados
--  1.2  funcionário com histórico não pode ser excluído (RESTRICT + gatilho com mensagem clara)
--  1.3  período com folha fechada/paga é congelado (marcações, ocorrências e ajustes); reabrir exige motivo
--  *    atestados/atrasos passam por análise do administrador (aceitar/recusar)
--  *    anexos ficam no Storage privado (aqui só metadados); documentos com selo de autenticidade
-- Idempotente.
-- =====================================================================

-- ---------- Ocorrências ----------
create table if not exists public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  funcionario_id uuid not null,
  data_inicio date not null,
  data_fim date not null,
  tipo text not null check (tipo in ('atestado', 'declaracao', 'audiencia_externa', 'folga_compensacao', 'ferias', 'licenca', 'outro')),
  remunerado boolean not null default true,
  observacao text,
  status_analise text not null default 'aceita' check (status_analise in ('pendente', 'aceita', 'recusada')),
  origem text not null default 'painel' check (origem in ('painel', 'funcionario')),
  motivo_decisao text,
  decidido_por uuid,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  check (data_fim >= data_inicio),
  unique (escritorio_id, id),
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete restrict
);
create index if not exists ocorrencias_func_idx on public.ocorrencias (funcionario_id, data_inicio);
create index if not exists ocorrencias_pendentes_idx on public.ocorrencias (status_analise) where status_analise = 'pendente';

-- ---------- Folha ----------
create table if not exists public.ajustes_folha (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  funcionario_id uuid not null,
  data date not null,
  tipo text not null check (tipo in ('adicional', 'hora_extra', 'desconto', 'adiantamento')),
  valor numeric(12,2) not null default 0 check (valor >= 0),
  quantidade_horas numeric(8,2),
  motivo text not null,
  observacao text,
  created_at timestamptz not null default now(),
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete restrict
);
create index if not exists ajustes_folha_func_idx on public.ajustes_folha (funcionario_id, data);

create table if not exists public.ajustes_dia (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  funcionario_id uuid not null,
  data date not null,
  situacao text not null check (situacao in ('presente', 'abonado', 'falta')),
  observacao text,
  created_at timestamptz not null default now(),
  unique (funcionario_id, data),
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete restrict
);

create table if not exists public.folhas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  funcionario_id uuid not null,
  periodo_inicio date not null,
  periodo_fim date not null,
  salario_mensal numeric(12,2) not null default 0,
  valor_diaria numeric(12,2) not null default 0,
  dias_previstos int not null default 0,
  dias_trabalhados int not null default 0,
  dias_abonados int not null default 0,
  faltas int not null default 0,
  atrasos int not null default 0,
  saidas_antecipadas int not null default 0,
  minutos_atraso int not null default 0,
  dias_extras int not null default 0,
  pendencias int not null default 0,
  horas_extras numeric(8,2) not null default 0,
  valor_bruto numeric(12,2) not null default 0,
  desconto_faltas numeric(12,2) not null default 0,
  desconto_atrasos numeric(12,2) not null default 0,
  adicionais numeric(12,2) not null default 0,
  descontos numeric(12,2) not null default 0,
  valor_final numeric(12,2) not null default 0,
  status text not null default 'aberta' check (status in ('aberta', 'fechada', 'paga')),
  detalhe jsonb not null default '[]',
  observacoes text,
  motivo_reabertura text,
  reaberta_em timestamptz,
  reaberta_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funcionario_id, periodo_inicio, periodo_fim),
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete restrict
);

-- ---------- Anexos (atestados): o arquivo fica no Storage privado; aqui só os metadados ----------
create table if not exists public.anexos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  funcionario_id uuid not null,
  ocorrencia_id uuid,
  registro_id uuid,
  nome text not null,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  tamanho int not null check (tamanho between 1 and 2097152),
  storage_path text,
  sha256 text,
  created_at timestamptz not null default now(),
  check ((ocorrencia_id is not null) <> (registro_id is not null)),
  foreign key (escritorio_id, funcionario_id) references public.funcionarios (escritorio_id, id) on delete restrict,
  foreign key (escritorio_id, ocorrencia_id) references public.ocorrencias (escritorio_id, id) on delete cascade,
  foreign key (escritorio_id, registro_id) references public.registros_ponto (escritorio_id, id) on delete cascade
);
create index if not exists anexos_ocorrencia_idx on public.anexos (ocorrencia_id);
create index if not exists anexos_registro_idx on public.anexos (registro_id);

-- Arquivos cujo registro foi apagado: o caminho vai para a lixeira e o objeto é removido do Storage pela função de limpeza.
create table if not exists public.anexos_lixeira (
  id bigserial primary key,
  escritorio_id uuid not null references public.escritorios(id) on delete restrict,
  storage_path text not null,
  removido_em timestamptz not null default now()
);
alter table public.anexos_lixeira enable row level security;
revoke all on public.anexos_lixeira from anon, authenticated;
revoke all on sequence public.anexos_lixeira_id_seq from anon, authenticated;

create or replace function public._trg_anexo_lixeira() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if old.storage_path is not null then
    insert into public.anexos_lixeira (escritorio_id, storage_path) values (old.escritorio_id, old.storage_path);
  end if;
  return old;
end $$;
drop trigger if exists trg_lixeira on public.anexos;
create trigger trg_lixeira before delete on public.anexos for each row execute function public._trg_anexo_lixeira();

-- ---------- Documentos emitidos (selo de autenticidade dos PDFs) ----------
create table if not exists public.documentos_emitidos (
  codigo text primary key,
  escritorio_id uuid not null default public.meu_escritorio() references public.escritorios(id) on delete restrict,
  tipo text not null check (tipo in ('folha', 'holerite', 'frequencia', 'espelho')),
  titulo text not null,
  periodo text not null,
  resumo jsonb not null default '{}'::jsonb,
  hash text not null,
  emitido_por text not null,
  emitido_em timestamptz not null default now()
);

-- ---------- RLS ----------
select public._aplicar_rls_tenant('ocorrencias', true, true, true, true);
select public._aplicar_rls_tenant('ajustes_folha');
select public._aplicar_rls_tenant('ajustes_dia', true);
select public._aplicar_rls_tenant('folhas');
select public._aplicar_rls_tenant('documentos_emitidos', false, false, false, false, false);
select public._aplicar_rls_tenant('anexos', false, false, false, false, false);
-- anexos: o administrador lê os metadados e pode apagar; criar/alterar só pelo fluxo controlado (função de envio)
drop policy if exists "tenant admin remove" on public.anexos;
create policy "tenant admin remove" on public.anexos for delete to authenticated
  using (escritorio_id = (select public.meu_escritorio()) and (select public.eh_admin()));
revoke insert, update, truncate on public.anexos from anon, authenticated;
revoke insert, update, delete, truncate on public.documentos_emitidos from anon, authenticated;

select public._auditar_tabela(t) from unnest(array['ocorrencias', 'ajustes_folha', 'ajustes_dia', 'folhas', 'anexos']) t;

-- ---------- 1.2 · Funcionário com histórico não pode ser excluído ----------
create or replace function public._trg_funcionario_historico() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if exists (select 1 from public.registros_ponto where funcionario_id = old.id)
     or exists (select 1 from public.ocorrencias where funcionario_id = old.id)
     or exists (select 1 from public.ajustes_folha where funcionario_id = old.id)
     or exists (select 1 from public.ajustes_dia where funcionario_id = old.id)
     or exists (select 1 from public.folhas where funcionario_id = old.id)
     or exists (select 1 from public.anexos where funcionario_id = old.id) then
    raise exception 'FUNCIONARIO_COM_HISTORICO';
  end if;
  return old;
end $$;
drop trigger if exists trg_historico on public.funcionarios;
create trigger trg_historico before delete on public.funcionarios for each row execute function public._trg_funcionario_historico();

-- ---------- 1.3 · Período fechado é congelado ----------
create or replace function public._periodo_fechado(p_func uuid, p_ini date, p_fim date default null) returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from public.folhas f
                  where f.funcionario_id = p_func and f.status in ('fechada', 'paga')
                    and f.periodo_inicio <= coalesce(p_fim, p_ini) and f.periodo_fim >= p_ini)
$$;

create or replace function public._trg_periodo_fechado() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_ini date; v_fim date; v_func uuid; r record;
begin
  if public._bypass_expurgo() then return coalesce(new, old); end if;
  for r in select * from (values (case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end),
                                 (case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end)) as x(j) where j is not null loop
    v_func := (r.j ->> 'funcionario_id')::uuid;
    if tg_table_name = 'ocorrencias' then
      v_ini := (r.j ->> 'data_inicio')::date; v_fim := (r.j ->> 'data_fim')::date;
    else
      v_ini := (r.j ->> 'data')::date; v_fim := v_ini;
    end if;
    if public._periodo_fechado(v_func, v_ini, v_fim) then raise exception 'PERIODO_FECHADO'; end if;
  end loop;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['registros_ponto', 'ocorrencias', 'ajustes_dia', 'ajustes_folha'] loop
    execute format('drop trigger if exists trg_periodo_fechado on public.%I', t);
    execute format('create trigger trg_periodo_fechado before insert or update or delete on public.%I for each row execute function public._trg_periodo_fechado()', t);
  end loop;
end $$;

-- A própria folha: fechada/paga só muda de status; reabrir exige motivo (e fica na auditoria).
create or replace function public._trg_folha_regras() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_fecha boolean;
begin
  if tg_op = 'DELETE' then
    if old.status in ('fechada', 'paga') and not public._bypass_expurgo() then raise exception 'PERIODO_FECHADO'; end if;
    return old;
  end if;

  v_fecha := new.status in ('fechada', 'paga') and (tg_op = 'INSERT' or old.status = 'aberta');
  if v_fecha then
    -- não fecha com atestado/atraso ainda em análise
    if exists (select 1 from public.ocorrencias o where o.funcionario_id = new.funcionario_id and o.status_analise = 'pendente'
                  and o.data_inicio <= new.periodo_fim and o.data_fim >= new.periodo_inicio)
       or exists (select 1 from public.registros_ponto r where r.funcionario_id = new.funcionario_id and r.analise = 'pendente'
                  and r.status_aprovacao <> 'rejeitado' and r.data between new.periodo_inicio and new.periodo_fim) then
      raise exception 'ANALISES_PENDENTES';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status in ('fechada', 'paga') then
    if new.status = 'aberta' then
      if not public.eh_admin() then raise exception 'SO_ADMINISTRADOR'; end if;
      if length(trim(coalesce(new.motivo_reabertura, ''))) < 5 or new.motivo_reabertura is not distinct from old.motivo_reabertura then
        raise exception 'MOTIVO_REABERTURA';
      end if;
      new.reaberta_em := now(); new.reaberta_por := auth.uid();
      insert into public.auditoria (escritorio_id, usuario, usuario_id, acao, detalhe, tabela, registro_id, origem)
      values (new.escritorio_id,
              coalesce((select nome || ' <' || email || '>' from public.perfis where id = auth.uid()), 'Sistema'), auth.uid(),
              'Folha reaberta', left(public._rotulo_registro('folhas', to_jsonb(new)) || ' · motivo: ' || trim(new.motivo_reabertura), 500),
              'folhas', new.id::text, nullif(public._origem(), ''));
    else
      -- continua fechada/paga: só o status pode mudar
      if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
        raise exception 'FOLHA_FECHADA';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_folha_regras on public.folhas;
create trigger trg_folha_regras before insert or update or delete on public.folhas for each row execute function public._trg_folha_regras();

-- ---------- Só o administrador decide atestados e atrasos ----------
create or replace function public._trg_decisao_ocorrencia() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if new.status_analise is distinct from old.status_analise then
    if not public.eh_admin() then raise exception 'SO_ADMINISTRADOR'; end if;
    new.decidido_por := auth.uid(); new.decidido_em := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_decisao on public.ocorrencias;
create trigger trg_decisao before update on public.ocorrencias for each row execute function public._trg_decisao_ocorrencia();

create or replace function public._trg_decisao_registro() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if new.analise is distinct from old.analise then
    if not public.eh_admin() then raise exception 'SO_ADMINISTRADOR'; end if;
    new.decidido_por := auth.uid(); new.decidido_em := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_decisao on public.registros_ponto;
create trigger trg_decisao before update on public.registros_ponto for each row execute function public._trg_decisao_registro();

-- ---------- API pública do ponto (continuação) ----------
create or replace function public.ponto_historico(p_func_id uuid, p_pin text, p_limite int default 12) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  return jsonb_build_object('ok', true,
    'registros', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.horario_real desc) from (
        select r.id, r.data, r.tipo, r.horario_previsto, r.horario_real, r.diferenca_minutos, r.status, r.justificativa,
               r.status_aprovacao, r.retroativo, r.motivo_rejeicao, r.analise, r.motivo_decisao
          from public.registros_ponto r where r.funcionario_id = p_func_id
         order by r.horario_real desc limit greatest(least(p_limite, 60), 1)) x), '[]'::jsonb),
    'justificativas', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at desc) from (
        select o.id, o.data_inicio, o.data_fim, o.tipo, o.status_analise, o.motivo_decisao, o.observacao, o.created_at,
               (select count(*) from public.anexos a where a.ocorrencia_id = o.id)::int as anexos
          from public.ocorrencias o where o.funcionario_id = p_func_id and o.origem = 'funcionario'
         order by o.created_at desc limit 10) o), '[]'::jsonb));
end $$;

create or replace function public.ponto_retroativo(
  p_func_id uuid, p_pin text, p_data date, p_tipo text, p_hora text, p_justificativa text
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text; v_esc uuid; v_dias jsonb; v_prev text; v_id uuid; v_diff int; v_hoje date;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  select escritorio_id into v_esc from public.funcionarios where id = p_func_id;
  v_hoje := public._hoje(v_esc);
  if p_tipo not in ('entrada', 'saida_intervalo', 'retorno_intervalo', 'saida') then return public._erro('TIPO_INVALIDO'); end if;
  if p_hora is null or p_hora !~ '^[0-2][0-9]:[0-5][0-9]$' or substr(p_hora, 1, 2)::int > 23 then return public._erro('HORA_INVALIDA'); end if;
  if p_data is null or p_data >= v_hoje then return public._erro('USE_PONTO_NORMAL'); end if;
  if p_data < v_hoje - 45 then return public._erro('DATA_MUITO_ANTIGA'); end if;
  if length(trim(coalesce(p_justificativa, ''))) < 5 then return public._erro('JUSTIFICATIVA_OBRIGATORIA'); end if;
  if public._periodo_fechado(p_func_id, p_data) then return public._erro('PERIODO_FECHADO'); end if;
  if exists (select 1 from public.registros_ponto where funcionario_id = p_func_id and data = p_data
              and tipo = p_tipo and status_aprovacao <> 'rejeitado') then
    return public._erro('JA_REGISTRADO');
  end if;
  select e.dias into v_dias from public.escalas e join public.funcionarios f on f.escritorio_id = e.escritorio_id and f.escala_id = e.id where f.id = p_func_id;
  v_prev := public._turno_previsto(v_dias, extract(dow from p_data)::int, p_tipo);
  v_diff := case when v_prev is null then 0 else public._hhmm_min(p_hora) - public._hhmm_min(v_prev) end;
  begin
    insert into public.registros_ponto (escritorio_id, funcionario_id, data, tipo, horario_previsto, horario_real, diferenca_minutos,
                                        status, justificativa, status_aprovacao, retroativo)
    values (v_esc, p_func_id, p_data, p_tipo, v_prev, ((p_data::text || ' ' || p_hora || ':00')::timestamp at time zone public._fuso(v_esc)), v_diff,
            'pendente', trim(p_justificativa), 'pendente', true)
    returning id into v_id;
  exception when unique_violation then
    return public._erro('JA_REGISTRADO');
  end;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Funcionário envia justificativa de ausência (atestado etc.). Fica pendente até o administrador decidir.
create or replace function public.ponto_justificar_ausencia(p_func_id uuid, p_pin text, p_inicio date, p_fim date, p_tipo text, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text; v_esc uuid; v_hoje date; v_id uuid;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  select escritorio_id into v_esc from public.funcionarios where id = p_func_id;
  v_hoje := public._hoje(v_esc);
  if p_tipo not in ('atestado', 'declaracao', 'audiencia_externa', 'outro') then return public._erro('TIPO_INVALIDO'); end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 30 then return public._erro('PERIODO_INVALIDO'); end if;
  if p_inicio < v_hoje - 45 then return public._erro('DATA_MUITO_ANTIGA'); end if;
  if p_fim > v_hoje + 30 then return public._erro('PERIODO_INVALIDO'); end if;
  if length(coalesce(p_obs, '')) > 600 then return public._erro('PERIODO_INVALIDO'); end if;
  if public._periodo_fechado(p_func_id, p_inicio, p_fim) then return public._erro('PERIODO_FECHADO'); end if;
  if exists (select 1 from public.ocorrencias where funcionario_id = p_func_id and status_analise <> 'recusada'
               and data_inicio <= p_fim and data_fim >= p_inicio) then
    return public._erro('JA_REGISTRADO');
  end if;
  insert into public.ocorrencias (escritorio_id, funcionario_id, data_inicio, data_fim, tipo, remunerado, observacao, origem, status_analise)
  values (v_esc, p_func_id, p_inicio, p_fim, p_tipo, true, nullif(trim(p_obs), ''), 'funcionario', 'pendente')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Anexos: o ARQUIVO só entra pela Edge Function "anexos" (service_role), que valida tipo real e tamanho e grava no
-- Storage privado. Esta função autoriza e registra os metadados; devolve o caminho onde o arquivo deve ser gravado.
create or replace function public.ponto_anexo_preparar(
  p_func_id uuid, p_pin text, p_registro_id uuid, p_ocorrencia_id uuid, p_nome text, p_mime text, p_tamanho int, p_sha256 text
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text; v_esc uuid; v_ok boolean := false; v_n int; v_id uuid := gen_random_uuid(); v_path text;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  select escritorio_id into v_esc from public.funcionarios where id = p_func_id;
  if (p_registro_id is null) = (p_ocorrencia_id is null) then return public._erro('NAO_ENCONTRADO'); end if;
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') or coalesce(p_tamanho, 0) not between 1 and 2097152 then
    return public._erro('ARQUIVO_INVALIDO', 'Envie PDF ou foto (JPG, PNG) de até 2 MB');
  end if;
  if p_ocorrencia_id is not null then
    select true into v_ok from public.ocorrencias where id = p_ocorrencia_id and funcionario_id = p_func_id and origem = 'funcionario' and status_analise = 'pendente';
    select count(*) into v_n from public.anexos where ocorrencia_id = p_ocorrencia_id;
  else
    select true into v_ok from public.registros_ponto where id = p_registro_id and funcionario_id = p_func_id
       and analise = 'pendente' and created_at > now() - interval '48 hours';
    select count(*) into v_n from public.anexos where registro_id = p_registro_id;
  end if;
  if not coalesce(v_ok, false) then return public._erro('NAO_ENCONTRADO'); end if;
  if v_n >= 4 then return public._erro('LIMITE_ANEXOS'); end if;
  v_path := v_esc::text || '/' || p_func_id::text || '/' || v_id::text;
  insert into public.anexos (id, escritorio_id, funcionario_id, ocorrencia_id, registro_id, nome, mime, tamanho, storage_path, sha256)
  values (v_id, v_esc, p_func_id, p_ocorrencia_id, p_registro_id,
          left(regexp_replace(coalesce(p_nome, 'arquivo'), '[^A-Za-z0-9._ ()-]', '_', 'g'), 120), p_mime, p_tamanho, v_path, p_sha256);
  return jsonb_build_object('ok', true, 'id', v_id, 'path', v_path);
end $$;

-- Se o envio ao Storage falhar, a Edge Function desfaz o registro.
create or replace function public.ponto_anexo_cancelar(p_id uuid) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  delete from public.anexos where id = p_id
$$;

-- ---------- Autenticidade dos documentos ----------
drop function if exists public.registrar_documento(text, text, text, jsonb, text);
create or replace function public.registrar_documento(p_tipo text, p_titulo text, p_periodo text, p_resumo jsonb, p_hash text, p_codigo text default null)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_codigo text := upper(trim(coalesce(p_codigo, ''))); v_papel text := public.papel_atual(); v_hash text; v_esc uuid := public.meu_escritorio();
begin
  if v_papel is null then raise exception 'SEM_PERMISSAO'; end if;
  if p_hash !~ '^[0-9a-f]{64}$' then raise exception 'HASH_INVALIDO'; end if;
  if v_codigo <> '' then
    if v_codigo !~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' then raise exception 'CODIGO_INVALIDO'; end if;
    select hash into v_hash from public.documentos_emitidos where codigo = v_codigo and escritorio_id = v_esc;
    if found then
      if v_hash = p_hash then return v_codigo; end if;       -- repetição idempotente
      raise exception 'CODIGO_EXISTE';
    end if;
    if exists (select 1 from public.documentos_emitidos where codigo = v_codigo) then raise exception 'CODIGO_EXISTE'; end if;
  else
    loop
      v_codigo := upper(encode(gen_random_bytes(6), 'hex'));
      v_codigo := substr(v_codigo, 1, 4) || '-' || substr(v_codigo, 5, 4) || '-' || substr(v_codigo, 9, 4);
      exit when not exists (select 1 from public.documentos_emitidos where codigo = v_codigo);
    end loop;
  end if;
  insert into public.documentos_emitidos (codigo, escritorio_id, tipo, titulo, periodo, resumo, hash, emitido_por)
  values (v_codigo, v_esc, p_tipo, left(p_titulo, 160), left(p_periodo, 160), coalesce(p_resumo, '{}'::jsonb), p_hash,
          case v_papel when 'admin' then 'Administração' else 'Gerência' end);
  return v_codigo;
end $$;

-- Consulta pública por código (sem login): só o necessário para conferir o documento, sem dados pessoais.
create or replace function public.verificar_documento(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare d public.documentos_emitidos; v_nome text;
begin
  select * into d from public.documentos_emitidos where codigo = upper(trim(coalesce(p_codigo, '')));
  if not found then return jsonb_build_object('ok', false); end if;
  select e.nome into v_nome from public.escritorios e where e.id = d.escritorio_id;
  return jsonb_build_object('ok', true, 'codigo', d.codigo, 'tipo', d.tipo, 'titulo', d.titulo, 'periodo', d.periodo,
                            'resumo', d.resumo, 'hash', d.hash, 'emitido_por', d.emitido_por, 'emitido_em', d.emitido_em, 'escritorio', v_nome);
end $$;

-- Períodos fechados do escritório (a gerência não lê `folhas`, mas precisa saber o que está congelado para desabilitar botões).
create or replace function public.periodos_fechados()
returns table (funcionario_id uuid, periodo_inicio date, periodo_fim date, status text)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_gestao() then raise exception 'SEM_PERMISSAO'; end if;
  return query select f.funcionario_id, f.periodo_inicio, f.periodo_fim, f.status
                 from public.folhas f where f.escritorio_id = public.meu_escritorio() and f.status in ('fechada', 'paga');
end $$;

-- ---------- Permissões ----------
revoke all on function public.periodos_fechados() from public, anon;
grant execute on function public.periodos_fechados() to authenticated;
revoke all on function public._trg_periodo_fechado() from public, anon, authenticated;
revoke all on function public._trg_folha_regras() from public, anon, authenticated;
revoke all on function public._trg_funcionario_historico() from public, anon, authenticated;
revoke all on function public._trg_anexo_lixeira() from public, anon, authenticated;
revoke all on function public._trg_decisao_ocorrencia() from public, anon, authenticated;
revoke all on function public._trg_decisao_registro() from public, anon, authenticated;
revoke all on function public._periodo_fechado(uuid, date, date) from public, anon, authenticated;
revoke all on function public.ponto_historico(uuid, text, int) from public;
revoke all on function public.ponto_retroativo(uuid, text, date, text, text, text) from public;
revoke all on function public.ponto_justificar_ausencia(uuid, text, date, date, text, text) from public;
revoke all on function public.ponto_anexo_preparar(uuid, text, uuid, uuid, text, text, int, text) from public, anon, authenticated;
revoke all on function public.ponto_anexo_cancelar(uuid) from public, anon, authenticated;
revoke all on function public.registrar_documento(text, text, text, jsonb, text, text) from public, anon;
revoke all on function public.verificar_documento(text) from public;
grant execute on function public.ponto_historico(uuid, text, int) to anon, authenticated;
grant execute on function public.ponto_retroativo(uuid, text, date, text, text, text) to anon, authenticated;
grant execute on function public.ponto_justificar_ausencia(uuid, text, date, date, text, text) to anon, authenticated;
grant execute on function public.registrar_documento(text, text, text, jsonb, text, text) to authenticated;
grant execute on function public.verificar_documento(text) to anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ponto_anexo_preparar(uuid, text, uuid, uuid, text, text, int, text) to service_role;
    grant execute on function public.ponto_anexo_cancelar(uuid) to service_role;
  end if;
end $$;

insert into public.schema_versao (versao, nome) values (3, 'folha, atestados e integridade') on conflict (versao) do nothing;
