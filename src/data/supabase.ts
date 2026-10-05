/**
 * Implementação com Supabase. O schema está em supabase/migrations.
 *
 * Isolamento entre escritórios: este arquivo NUNCA envia `escritorio_id` nas gravações — o banco o preenche com o
 * escritório do usuário logado (`meu_escritorio()`) e as políticas RLS recusam qualquer outro valor. Ou seja, mesmo
 * um front-end adulterado não alcança dados de outro escritório.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { base64ParaBlob } from '@/lib/anexos';
import { mesclarConfig } from '@/lib/config';
import { ErroNegocio, PONTO_ERRO_MSG, traduzirErroBanco, type PontoErro } from '@/lib/erros';
import type {
  AcessoSensivel, Andamento, AnexoMeta, ChecklistItem, ChecklistModelo, Cliente, Config, DadosConsultaProcesso, DocumentoArquivo, DriveStatus, Escala, EscritorioPlataforma, Folha,
  FuncionarioBasico, GoogleStatus, LinkEnvio, Movimento, Processo, ResultadoConsulta, SyncGoogle, Tarefa, Usuario,
} from '@/lib/types';
import { porCategoria } from '@/lib/processos';
import type { AnexoAberto, ArquivoAnexo, ArquivosRepo, Crud, Db, ProcessosRepo, DocumentoVerificado, FolhasRepo, PeriodoFechado, PessoaPonto, PontoApi, PontoResp, ResumoExpurgo, Sessao } from './db';

function falha(e: { message?: string } | null): never {
  throw new Error(traduzirErroBanco(e?.message));
}

/** O erro indica que a função/tabela ainda não existe no banco (atualização pendente). */
function funcaoAusente(e: { code?: string; message?: string }): boolean {
  const m = (e.message ?? '').toLowerCase();
  return e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42883' || e.code === '42P01' || m.includes('could not find the function') || m.includes('could not find the table') || m.includes('schema cache');
}

export function criarDbSupabase(url: string, key: string): Db {
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  let sessaoCache: Sessao | null = null;

  function crud<T extends { id: string }>(tabela: string, ordem?: string): Crud<T> {
    return {
      async list() {
        // Pagina de 1000 em 1000 (limite padrão do PostgREST); o RLS já filtra pelo escritório do usuário
        const out: T[] = [];
        for (let de = 0; ; de += 1000) {
          // ordem estável (desempate por id) para a paginação não repetir nem perder linhas
          let q = sb.from(tabela).select('*').range(de, de + 999);
          if (ordem) q = q.order(ordem);
          q = q.order('id');
          const { data, error } = await q;
          if (error) falha(error);
          out.push(...((data ?? []) as T[]));
          if (!data || data.length < 1000) break;
        }
        return out;
      },
      async insert(row) {
        const { id: _id, escritorio_id: _e, ...resto } = row as Record<string, unknown>;
        const { data, error } = await sb.from(tabela).insert(resto).select().single();
        if (error) falha(error);
        return data as T;
      },
      async update(id, patch) {
        const { id: _id, escritorio_id: _e, ...resto } = patch as Record<string, unknown>;
        const { data, error } = await sb.from(tabela).update(resto).eq('id', id).select().single();
        if (error) falha(error);
        return data as T;
      },
      async remove(id) {
        const { error } = await sb.from(tabela).delete().eq('id', id);
        if (error) falha(error);
      },
    };
  }

  const folhasBase = crud<Folha>('folhas');
  const folhas: FolhasRepo = {
    ...folhasBase,
    async upsertMany(rows) {
      if (!rows.length) return;
      const { error } = await sb.from('folhas').upsert(rows, { onConflict: 'funcionario_id,periodo_inicio,periodo_fim' });
      if (error) falha(error);
    },
    reabrir: (id, motivo) => folhasBase.update(id, { status: 'aberta', motivo_reabertura: motivo }),
  };

  async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(nome, args);
    if (error) falha(error);
    return data as T;
  }

  interface RespSessao { ok: boolean; erro?: string; tipo?: 'escritorio' | 'plataforma'; id?: string; nome?: string; email?: string; papel?: Sessao['papel']; escritorio?: Sessao['escritorio'] }
  async function lerSessao(): Promise<{ sessao: Sessao | null; erro?: string }> {
    const { data } = await sb.auth.getSession();
    if (!data.session?.user) return { sessao: null };
    const { data: r, error } = await sb.rpc('minha_sessao');
    if (error) return { sessao: null, erro: error.message };
    const s = r as RespSessao;
    if (!s?.ok) return { sessao: null, erro: s?.erro };
    return { sessao: { id: s.id!, email: s.email!, nome: s.nome!, papel: s.papel!, escritorio: s.escritorio ?? null } };
  }

  /** Chama a Edge Function "anexos" (service_role dentro dela): envio com PIN, abertura por URL assinada e limpeza. */
  async function funcaoAnexos<T>(corpo: FormData | Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.functions.invoke('anexos', { body: corpo });
    if (error) {
      let msg = error.message;
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.erro) msg = j.erro; } catch { /* sem corpo */ }
      throw new Error(traduzirErroBanco(msg));
    }
    return data as T;
  }

  /** Campos preenchidos pelo servidor (autoria, datas, conclusão): o app nunca os envia. */
  const SO_SERVIDOR = new Set(['criado_por', 'criado_por_nome', 'concluida_em', 'created_at', 'updated_at']);
  const semCamposDoServidor = <R extends object>(r: R): R => Object.fromEntries(Object.entries(r).filter(([k]) => !SO_SERVIDOR.has(k))) as R;
  const tarefasBase = crud<Tarefa>('tarefas', 'inicio');
  const tarefas: Crud<Tarefa> = {
    ...tarefasBase,
    insert: r => tarefasBase.insert(semCamposDoServidor(r)),
    update: (id, p) => tarefasBase.update(id, semCamposDoServidor(p)),
  };

  /** Edge Function "google-agenda" (OAuth e tokens ficam só no servidor; o app apenas pede). */
  async function funcaoGoogle<T>(corpo: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.functions.invoke('google-agenda', { body: corpo });
    if (error) {
      let msg = error.message;
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.erro) msg = j.erro; } catch { /* sem corpo */ }
      throw new Error(traduzirErroBanco(msg));
    }
    return data as T;
  }

  /** Campos que só o servidor preenche (o app nunca os envia). */
  const semServidor = (extra: string[]) => <R extends object>(r: R): R => Object.fromEntries(Object.entries(r).filter(([k]) => !SO_SERVIDOR.has(k) && !extra.includes(k))) as R;
  const limparCliente = semServidor(['drive_folder_id']);
  const limparProcesso = semServidor(['drive_folder_id', 'ultima_consulta', 'ultima_consulta_erro', 'ultima_movimentacao_em']);
  const clientesBase = crud<Cliente>('clientes', 'nome');
  const clientes: Crud<Cliente> = { ...clientesBase, insert: r => clientesBase.insert(limparCliente(r)), update: (id, p) => clientesBase.update(id, limparCliente(p)) };
  const processosBase = crud<Processo>('processos', 'numero');

  /** Edge Function "processos": consulta ao tribunal (DataJud) e criação das tarefas, com a service_role só dentro dela. */
  async function funcaoProcessos<T>(corpo: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.functions.invoke('processos', { body: corpo });
    if (error) {
      let msg = error.message;
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.erro) msg = j.erro; } catch { /* sem corpo */ }
      throw new Error(traduzirErroBanco(msg));
    }
    return data as T;
  }
  const processos: ProcessosRepo = {
    ...processosBase,
    insert: r => processosBase.insert(limparProcesso(r)),
    update: (id, p) => processosBase.update(id, limparProcesso(p)),
    async movimentos(id) {
      const { data, error } = await sb.from('processo_movimentos').select('*').eq('processo_id', id).order('data_hora', { ascending: false }).order('created_at', { ascending: false }).limit(500);
      if (error) falha(error);
      return (data ?? []) as Movimento[];
    },
    async naoLidos() {
      const { data, error } = await sb.from('processo_movimentos').select('*').eq('lido', false).order('data_hora', { ascending: false }).order('created_at', { ascending: false }).limit(500);
      if (error) { if (funcaoAusente(error)) return []; falha(error); }
      return (data ?? []) as Movimento[];
    },
    async registrarMovimento(id, m) {
      const c = porCategoria(m.categoria);
      const { data, error } = await sb.from('processo_movimentos').insert({
        processo_id: id, nome: m.nome.trim(), complemento: m.complemento?.trim() || null, data_hora: m.data_hora, categoria: c.categoria, exige_acao: c.exige_acao,
        prazo_sugerido_dias: c.prazo_sugerido_dias, lido: true, chave: '',
      }).select().single();
      if (error) falha(error);
      return data as Movimento;
    },
    async marcarLidos(id) {
      const { error } = await sb.from('processo_movimentos').update({ lido: true }).eq('processo_id', id).eq('lido', false);
      if (error) falha(error);
    },
    async buscar(numero) { return (await funcaoProcessos<{ dados: DadosConsultaProcesso | null }>({ acao: 'buscar', numero })).dados; },
    consultar: id => funcaoProcessos<ResultadoConsulta>({ acao: 'consultar', processo_id: id }),
    consultarTodos: () => funcaoProcessos<ResultadoConsulta>({ acao: 'consultar_todos' }),
    async fonte() {
      try { const r = await funcaoProcessos<{ disponivel: boolean }>({ acao: 'fonte' }); return { disponivel: !!r.disponivel, simulada: false }; }
      catch { return { disponivel: false, simulada: false }; }
    },
  };

  const itensBase = crud<ChecklistItem>('checklist_itens', 'ordem');
  const checklistItens: Crud<ChecklistItem> = { ...itensBase, insert: r => itensBase.insert(semServidor(['recebido_em'])(r)), update: (id, p) => itensBase.update(id, semServidor(['recebido_em'])(p)) };

  /** Edge Function "documentos": envio ao Storage privado, abertura por URL assinada, Google Drive e página pública do cliente. */
  async function funcaoDocumentos<T>(corpo: FormData | Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.functions.invoke('documentos', { body: corpo });
    if (error) {
      let msg = error.message;
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.erro) msg = j.erro; } catch { /* sem corpo */ }
      throw new Error(traduzirErroBanco(msg));
    }
    return data as T;
  }
  const formArquivo = (campos: Record<string, string | null | undefined>, a: ArquivoAnexo) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) if (v) f.append(k, v);
    f.append('nome', a.nome);
    f.append('arquivo', base64ParaBlob(a.conteudo, a.mime), a.nome);
    return f;
  };
  const COLS_DOC = 'id,cliente_id,processo_id,item_id,nome,mime,tamanho,sha256,origem,enviado_por_nome,conferido,conferido_em,drive_status,drive_link,drive_erro,created_at';
  const arquivos: ArquivosRepo = {
    async list(f) {
      let q = sb.from('documentos').select(COLS_DOC).order('created_at', { ascending: false }).limit(1000);
      if (f?.cliente_id) q = q.eq('cliente_id', f.cliente_id);
      if (f?.processo_id) q = q.eq('processo_id', f.processo_id);
      const { data, error } = await q;
      if (error) { if (funcaoAusente(error)) return []; falha(error); }
      return (data ?? []) as DocumentoArquivo[];
    },
    async enviar(x) {
      const r = await funcaoDocumentos<{ documento: DocumentoArquivo }>(formArquivo({ acao: 'enviar', cliente_id: x.cliente_id, processo_id: x.processo_id, item_id: x.item_id }, x.arquivo));
      return r.documento;
    },
    abrir: id => funcaoDocumentos<AnexoAberto>({ acao: 'abrir', id }),
    async conferir(id, conferido) {
      const { error } = await sb.from('documentos').update({ conferido }).eq('id', id);
      if (error) falha(error);
    },
    async remover(id) {
      const { error } = await sb.from('documentos').delete().eq('id', id);
      if (error) falha(error);
      try { await funcaoDocumentos({ acao: 'limpar' }); } catch { /* a limpeza roda de novo na próxima exclusão ou no agendamento */ }
    },
    async resumo() {
      const { data, error } = await sb.rpc('documentos_resumo');
      if (error) { if (funcaoAusente(error)) return { total: 0, sem_conferir: 0, drive_pendente: 0 }; falha(error); }
      const r = (data ?? {}) as Partial<{ total: number; sem_conferir: number; drive_pendente: number }>;
      return { total: Number(r.total ?? 0), sem_conferir: Number(r.sem_conferir ?? 0), drive_pendente: Number(r.drive_pendente ?? 0) };
    },
    links: {
      async list() {
        const { data, error } = await sb.from('documento_links').select('id,cliente_id,processo_id,rotulo,expira_em,ativo,max_arquivos,usos,ultimo_uso,created_at').order('created_at', { ascending: false }).limit(500);
        if (error) { if (funcaoAusente(error)) return []; falha(error); }
        return (data ?? []) as LinkEnvio[];
      },
      async criar(x) {
        const r = await rpc<{ id: string; token: string }>('link_criar', { p_cliente: x.cliente_id, p_processo: x.processo_id ?? null, p_dias: x.dias ?? 14, p_rotulo: x.rotulo ?? null });
        const { data, error } = await sb.from('documento_links').select('id,cliente_id,processo_id,rotulo,expira_em,ativo,max_arquivos,usos,ultimo_uso,created_at').eq('id', r.id).single();
        if (error) falha(error);
        return { link: data as LinkEnvio, token: r.token };
      },
      async revogar(id) { await rpc('link_revogar', { p_id: id }); },
    },
    drive: {
      async status() {
        const { data, error } = await sb.rpc('drive_status');
        if (error) { if (funcaoAusente(error)) return { disponivel: false, conectado: false }; falha(error); }
        const r = (data ?? {}) as { conectado?: boolean; email?: string | null };
        return { disponivel: true, conectado: !!r.conectado, email: r.email ?? null } satisfies DriveStatus;
      },
      async conectar() { return (await funcaoDocumentos<{ url: string }>({ acao: 'drive_conectar', retorno: `${location.origin}/painel/configuracoes?aba=integracoes` })).url; },
      async desconectar() { await rpc('drive_desconectar'); },
      sincronizar: () => funcaoDocumentos<{ enviados: number; erros: number }>({ acao: 'drive_sincronizar' }),
    },
    publico: {
      async info(token) {
        try { return await funcaoDocumentos({ acao: 'publico_info', token }); } catch (e) { return { ok: false, erro: (e as Error).message }; }
      },
      async enviar(token, itemId, arquivo) {
        try { return await funcaoDocumentos(formArquivo({ acao: 'publico_enviar', token, item_id: itemId }, arquivo)); } catch (e) { return { ok: false, erro: (e as Error).message }; }
      },
    },
  };

  function pontoApi(slugBruto: string): PontoApi {
    const slug = (slugBruto ?? '').trim().toLowerCase();
    return {
      async buscar(termo) {
        const { data, error } = await sb.rpc('ponto_buscar', { p_slug: slug, p_termo: termo });
        if (error) falha(error);
        return (data ?? []) as PessoaPonto[];
      },
      async escala(escalaId) { return (await rpc<Escala | null>('ponto_escala', { p_slug: slug, p_escala_id: escalaId })) ?? null; },
      async contexto() {
        const c = await rpc<{ ok: boolean; erro?: string; ponto?: Partial<Config['ponto']>; escritorio_nome?: string; feriado?: string | null; fuso?: string }>('ponto_contexto', { p_slug: slug });
        if (!c.ok) return { ok: false, erro: c.erro === 'ESCRITORIO_SUSPENSO' ? 'ESCRITORIO_SUSPENSO' : 'ESCRITORIO_NAO_ENCONTRADO' };
        return { ok: true, ctx: { ponto: mesclarConfig({ ponto: c.ponto as Config['ponto'] }).ponto, escritorio_nome: c.escritorio_nome ?? '', feriado: c.feriado ?? null, fuso: c.fuso ?? 'America/Fortaleza' } };
      },
      bater: a => rpc<PontoResp<never>>('ponto_bater', {
        p_func_id: a.funcionario_id, p_pin: a.pin, p_tipo: a.tipo, p_justificativa: a.justificativa ?? null, p_lat: a.lat ?? null, p_lng: a.lng ?? null,
      }) as ReturnType<PontoApi['bater']>,
      historico: (fid, pin, limite = 12) => rpc('ponto_historico', { p_func_id: fid, p_pin: pin, p_limite: limite }) as ReturnType<PontoApi['historico']>,
      justificarAusencia: a => rpc('ponto_justificar_ausencia', {
        p_func_id: a.funcionario_id, p_pin: a.pin, p_inicio: a.inicio, p_fim: a.fim, p_tipo: a.tipo, p_obs: a.observacao ?? null,
      }) as ReturnType<PontoApi['justificarAusencia']>,
      async anexar(a) {
        const f = new FormData();
        f.append('acao', 'enviar');
        f.append('funcionario_id', a.funcionario_id);
        f.append('pin', a.pin);
        if (a.registro_id) f.append('registro_id', a.registro_id);
        if (a.ocorrencia_id) f.append('ocorrencia_id', a.ocorrencia_id);
        f.append('nome', a.arquivo.nome);
        f.append('arquivo', base64ParaBlob(a.arquivo.conteudo, a.arquivo.mime), a.arquivo.nome);
        try {
          return await funcaoAnexos<PontoResp<{ id: string }>>(f);
        } catch (e) {
          const msg = (e as Error).message;
          const codigo = (Object.keys(PONTO_ERRO_MSG) as PontoErro[]).find(c => msg === PONTO_ERRO_MSG[c] || msg.includes(c));
          return { ok: false, erro: codigo ?? 'ARQUIVO_INVALIDO', detalhe: codigo ? null : msg };
        }
      },
      tarefas: (fid, pin) => rpc('ponto_tarefas', { p_func_id: fid, p_pin: pin }) as ReturnType<PontoApi['tarefas']>,
      atualizarTarefa: a => rpc('ponto_tarefa_atualizar', {
        p_func_id: a.funcionario_id, p_pin: a.pin, p_id: a.id, p_status: a.status, p_nota: a.nota ?? null,
      }) as ReturnType<PontoApi['atualizarTarefa']>,
      retroativo: a => rpc('ponto_retroativo', {
        p_func_id: a.funcionario_id, p_pin: a.pin, p_data: a.data, p_tipo: a.tipo, p_hora: a.hora, p_justificativa: a.justificativa,
      }) as ReturnType<PontoApi['retroativo']>,
    };
  }

  const db: Db = {
    modo: 'supabase',
    cargos: crud('cargos', 'nome'),
    escalas: crud('escalas', 'nome'),
    funcionarios: crud('funcionarios', 'nome'),
    registros: crud('registros_ponto'),
    ocorrencias: crud('ocorrencias'),
    feriados: crud('feriados', 'data'),
    ajustes: crud('ajustes_folha'),
    ajustesDia: crud('ajustes_dia'),
    folhas,
    periodosFechados: () => rpc<PeriodoFechado[]>('periodos_fechados'),
    async versaoEsquema() {
      const { data, error } = await sb.from('schema_versao').select('versao').order('versao', { ascending: false }).limit(1);
      if (error) { if (funcaoAusente(error)) return null; falha(error); }
      return (data?.[0]?.versao as number | undefined) ?? null;
    },
    async ultimoBackup() {
      const { data, error } = await sb.rpc('backup_ultimo');
      if (error) { if (funcaoAusente(error)) return null; falha(error); }
      return (data as string | null) ?? null;
    },
    usuarios: {
      async list() {
        const { data, error } = await sb.from('perfis').select('id,nome,email,papel,ativo').order('nome');
        if (error) falha(error);
        return (data ?? []) as Usuario[];
      },
    },
    auditoria: crud('auditoria'),
    tarefas,
    clientes,
    processos,
    checklist: {
      modelos: crud<ChecklistModelo>('checklist_modelos', 'nome'),
      itens: checklistItens,
      aplicar: (modeloId, alvo) => rpc<number>('checklist_aplicar', { p_modelo: modeloId, p_processo: alvo.processo_id ?? null, p_cliente: alvo.cliente_id ?? null }),
    },
    arquivos,
    andamentos: {
      async list(tarefaId) {
        const { data, error } = await sb.from('tarefa_andamentos').select('id,tarefa_id,tipo,texto,autor_nome,created_at').eq('tarefa_id', tarefaId).order('created_at');
        if (error) falha(error);
        return (data ?? []) as Andamento[];
      },
      async add(tarefaId, texto) {
        const quem = sessaoCache ?? (await lerSessao()).sessao;
        if (!quem) throw new ErroNegocio('SEM_PERMISSAO');
        const { error } = await sb.from('tarefa_andamentos').insert({ tarefa_id: tarefaId, texto: texto.trim(), autor_nome: quem.nome, autor_usuario: quem.id });
        if (error) falha(error);
      },
    },
    google: {
      async status() {
        const { data, error } = await sb.rpc('google_status');
        if (error) { if (funcaoAusente(error)) return { disponivel: false, conectado: false }; falha(error); }
        const r = (data ?? {}) as { conectado?: boolean; email?: string | null };
        return { disponivel: true, conectado: !!r.conectado, email: r.email ?? null } satisfies GoogleStatus;
      },
      async conectar() { return (await funcaoGoogle<{ url: string }>({ acao: 'conectar', retorno: `${location.origin}/painel/agenda` })).url; },
      async desconectar() { await rpc('google_desconectar'); },
      async sincronizar(tarefaId) { await funcaoGoogle({ acao: 'sincronizar', tarefa_id: tarefaId }); },
      async remover(tarefaId) { await funcaoGoogle({ acao: 'remover', tarefa_id: tarefaId }); },
      async estados() {
        const { data, error } = await sb.from('tarefa_google').select('tarefa_id,event_id,sync_em,erro');
        if (error) { if (funcaoAusente(error)) return []; falha(error); }
        return (data ?? []) as SyncGoogle[];
      },
    },
    anexos: {
      async listar() {
        const { data, error } = await sb.from('anexos').select('id,funcionario_id,ocorrencia_id,registro_id,nome,mime,tamanho,created_at').order('created_at', { ascending: false });
        if (error) { if (funcaoAusente(error)) return []; falha(error); }
        return (data ?? []) as AnexoMeta[];
      },
      /** Só o administrador: a função confere o papel, grava o acesso em `acessos_sensiveis` e devolve uma URL de 60 s. */
      abrir: id => funcaoAnexos<AnexoAberto>({ acao: 'abrir', id }),
      async limparLixeira() { return (await funcaoAnexos<{ removidos: number }>({ acao: 'limpar' })).removidos ?? 0; },
    },
    acessosSensiveis: {
      async list() {
        const { data, error } = await sb.from('acessos_sensiveis').select('id,usuario,anexo_id,funcionario_id,acao,origem,created_at').order('created_at', { ascending: false }).limit(1000);
        if (error) { if (funcaoAusente(error)) return []; falha(error); }
        return (data ?? []) as AcessoSensivel[];
      },
    },
    retencao: {
      previa: () => rpc<ResumoExpurgo>('expurgo_executar', { p_confirmar: false }),
      async executar() {
        const r = await rpc<ResumoExpurgo>('expurgo_executar', { p_confirmar: true });
        try { await funcaoAnexos({ acao: 'limpar' }); } catch { /* a lixeira também é esvaziada pelo botão manual */ }
        return r;
      },
    },
    documentos: {
      registrar: d => rpc<string>('registrar_documento', { p_tipo: d.tipo, p_titulo: d.titulo, p_periodo: d.periodo, p_resumo: d.resumo, p_hash: d.hash, p_codigo: d.codigo ?? null }),
      async verificar(codigo) {
        const r = await rpc<{ ok: boolean } & Partial<DocumentoVerificado>>('verificar_documento', { p_codigo: codigo });
        return r?.ok ? (r as unknown as DocumentoVerificado) : null;
      },
    },
    config: {
      async get() {
        const { data } = await sb.from('configuracoes').select('dados').limit(1).maybeSingle();
        return mesclarConfig(data?.dados as Partial<Config> | undefined);
      },
      async save(c) {
        const esc = sessaoCache?.escritorio?.id ?? (await lerSessao()).sessao?.escritorio?.id;
        if (!esc) throw new ErroNegocio('SEM_PERMISSAO');
        const { error } = await sb.from('configuracoes').upsert({ escritorio_id: esc, dados: c });
        if (error) falha(error);
      },
    },
    auth: {
      async sessao() { sessaoCache = (await lerSessao()).sessao; return sessaoCache; },
      async entrar(email, senha) {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) {
          const m = (error.message || '').toLowerCase();
          if (m.includes('invalid login credentials')) throw new Error('E-mail ou senha incorretos.');
          if (m.includes('email not confirmed')) throw new Error('O e-mail deste usuário ainda não foi confirmado no Supabase (Authentication → Users → Confirm user).');
          if (m.includes('invalid api key') || m.includes('apikey')) throw new Error('Chave do Supabase inválida na configuração do site (VITE_SUPABASE_ANON_KEY).');
          throw new Error(`Falha ao entrar (${error.status ?? 'sem status'}): ${error.message}. Abra /diagnostico para ver os detalhes.`);
        }
        const { sessao, erro } = await lerSessao();
        if (!sessao) {
          await sb.auth.signOut();
          throw new ErroNegocio(erro ?? 'SEM_PERFIL');
        }
        sessaoCache = sessao;
        return sessao;
      },
      async sair() { sessaoCache = null; await sb.auth.signOut(); },
    },
    equipe: () => rpc<FuncionarioBasico[]>('equipe'),
    async definirPin(fid, pin) { await rpc('definir_pin', { p_func_id: fid, p_pin: pin }); },
    async aprovarPonto(id, acao, motivo) { await rpc('aprovar_ponto', { p_id: id, p_acao: acao, p_motivo: motivo ?? null }); },
    acessos: {
      async criar(a) { await rpc('criar_usuario', { p_email: a.email, p_senha: a.senha, p_nome: a.nome, p_papel: a.papel }); },
      async atualizar(id, a) { await rpc('atualizar_usuario', { p_id: id, p_nome: a.nome, p_papel: a.papel, p_ativo: a.ativo }); },
      async redefinirSenha(id, senha) { await rpc('redefinir_senha_usuario', { p_id: id, p_senha: senha }); },
      async remover(id) { await rpc('remover_usuario', { p_id: id }); },
    },
    plataforma: {
      listar: () => rpc<EscritorioPlataforma[]>('plataforma_listar_escritorios'),
      async criar(a) {
        await rpc('plataforma_criar_escritorio', { p_nome: a.nome, p_slug: a.slug, p_admin_nome: a.adminNome, p_admin_email: a.adminEmail, p_admin_senha: a.adminSenha, p_fuso: a.fuso });
      },
      async atualizar(id, a) { await rpc('plataforma_atualizar_escritorio', { p_id: id, p_nome: a.nome, p_ativo: a.ativo, p_fuso: a.fuso }); },
      usuarios: id => rpc('plataforma_listar_usuarios', { p_escritorio_id: id }),
      async criarAdmin(id, a) { await rpc('plataforma_criar_admin', { p_escritorio_id: id, p_nome: a.nome, p_email: a.email, p_senha: a.senha }); },
      async redefinirSenha(uid, senha) { await rpc('plataforma_redefinir_senha', { p_usuario_id: uid, p_senha: senha }); },
      async excluir(id) { await rpc('plataforma_excluir_escritorio', { p_id: id }); },
    },
    ponto: { para: pontoApi },
  };
  return db;
}

export type { ArquivoAnexo };
