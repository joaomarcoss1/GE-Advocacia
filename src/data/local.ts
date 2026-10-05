/**
 * Banco em memória persistido no localStorage: modo demonstração/teste, sem servidor.
 *
 * Multiescritório: cada escritório tem o SEU próprio "banco" (chaves `ge.v1.e.<slug>.<tabela>`), e todas as operações
 * resolvem o escritório pela SESSÃO — não existe caminho de código que leia ou grave no escritório de outro usuário.
 * As regras de integridade espelham as do Postgres (migrações 0002 e 0003): duplicidade de marcação, histórico que impede
 * exclusão, período fechado congelado, decisões só do administrador, rastro de acessos a atestados, retenção.
 */
import { CONFIG_PADRAO, mesclarConfig } from '@/lib/config';
import { agoraBR, brParaIso, definirFuso, hhmmParaMin, hojeMais, isoParaBR } from '@/lib/datetime';
import { gerarCodigoDocumento } from '@/lib/codigo';
import { ErroNegocio, erro } from '@/lib/erros';
import { semAcento } from '@/lib/format';
import { classificar, distanciaMetros, exigeJustificativa, previstoDoTipo, turnoDaData } from '@/lib/ponto';
import { RETENCAO_TENTATIVAS_DIAS, SCHEMA_ESPERADO, periodoFechado, temHistorico, validarMudancaFolha } from '@/lib/regras';
import { validarPin as validarFormatoPin, validarSenha } from '@/lib/seguranca';
import { base64ParaBlob } from '@/lib/anexos';
import { normalizarCnj } from '@/lib/cnj';
import { STATUS_ROTULO } from '@/lib/tarefas';
import type {
  AcessoSensivel, AjusteDia, AjusteFolha, Andamento, AnexoMeta, Auditoria, Cargo, Config, Escala, EscritorioInfo, EscritorioPlataforma, Feriado, Folha,
  Funcionario, Ocorrencia, Papel, RegistroPonto, StatusTarefa, Tarefa, TarefaFunc, Usuario,
} from '@/lib/types';
import type {
  AnexarArgs, AnexoAberto, BaterArgs, Crud, Db, DocumentoVerificado, FolhasRepo, JustificarAusenciaArgs, JustificativaFunc, MarcacaoHistorico,
  PontoApi, PontoErro, ResumoExpurgo, RetroativoArgs, Sessao,
} from './db';
import { DEMO_ESCRITORIOS, DEMO_PLATAFORMA, baseEscritorioNovo, gerarSeedEscritorio, hashSecreto } from './seed';

const NS = 'ge.v1.';
const K = { esc: `${NS}plataforma.escritorios`, plat: `${NS}plataforma.admins`, sessao: `${NS}sessao`, seeded: `${NS}seeded`, docs: `${NS}documentos` };
const SLUG_OK = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

interface EscritorioLocal extends EscritorioInfo { ativo: boolean; created_at: string }
type UsuarioLocal = Usuario & { senha_hash: string };
type AnexoLocal = AnexoMeta & { conteudo: string };
type AcessoLocal = AcessoSensivel;
type Tentativas = Record<string, number[]>;

const ls = () => globalThis.localStorage;
const lerJson = <T,>(k: string, padrao: T): T => { try { const v = ls().getItem(k); return v ? (JSON.parse(v) as T) : padrao; } catch { return padrao; } };
const gravarJson = (k: string, v: unknown) => ls().setItem(k, JSON.stringify(v));
const kt = (slug: string, tabela: string) => `${NS}e.${slug}.${tabela}`;
const lerTab = <T,>(slug: string, tabela: string): T[] => lerJson<T[]>(kt(slug, tabela), []);
const gravarTab = (slug: string, tabela: string, rows: unknown[]) => gravarJson(kt(slug, tabela), rows);
const uuid = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const agoraIso = () => new Date().toISOString();
const emailValido = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

interface Ator { slug: string; papel: Papel; sessao: Sessao }

interface Regras<T> {
  le: Papel[]; ins?: Papel[]; upd?: Papel[]; del?: Papel[];
  /** "Gatilhos" do banco: validam e podem ajustar a linha antes de gravar. */
  antes?(op: 'ins' | 'upd' | 'del', velho: T | null, novo: T | null, a: Ator): void;
  depois?(op: 'ins' | 'upd' | 'del', velho: T | null, novo: T | null, a: Ator): void;
}

export function criarDbLocal(): Db {
  // ---------------------------------------------------------------- infraestrutura
  const escritorios = () => lerJson<EscritorioLocal[]>(K.esc, []);
  const escPorSlug = (slug: string) => escritorios().find(e => e.slug === (slug ?? '').trim().toLowerCase());
  const infoDe = (e: EscritorioLocal): EscritorioInfo => ({ id: e.id, nome: e.nome, slug: e.slug, fuso: e.fuso });
  const plataformaUsers = () => lerJson<UsuarioLocal[]>(K.plat, []);

  /** Sessão válida e ainda autorizada (usuário ativo, escritório ativo). */
  function sessaoValida(): Sessao | null {
    const s = lerJson<Sessao | null>(K.sessao, null);
    if (!s) return null;
    if (s.papel === 'plataforma') return plataformaUsers().some(u => u.id === s.id && u.ativo) ? s : null;
    const e = s.escritorio ? escPorSlug(s.escritorio.slug) : undefined;
    if (!e || !e.ativo) return null;
    const u = lerTab<UsuarioLocal>(e.slug, 'usuarios').find(x => x.id === s.id && x.ativo);
    return u ? { ...s, nome: u.nome, papel: u.papel, escritorio: infoDe(e) } : null;
  }
  function tentaAtor(): Ator | null {
    const s = sessaoValida();
    if (!s || s.papel === 'plataforma' || !s.escritorio) return null;
    definirFuso(s.escritorio.fuso);
    return { slug: s.escritorio.slug, papel: s.papel, sessao: s };
  }
  function ator(): Ator { const a = tentaAtor(); if (!a) throw erro('SEM_PERMISSAO'); return a; }
  const exigeAdmin = (): Ator => { const a = ator(); if (a.papel !== 'admin') throw erro('SEM_PERMISSAO'); return a; };
  function exigePlataforma(): Sessao {
    const s = sessaoValida();
    if (!s || s.papel !== 'plataforma') throw erro('SEM_PERMISSAO');
    return s;
  }

  /** Registra na auditoria do escritório (a trilha é só de inserção). */
  function auditarLocal(a: Ator, acao: string, detalhe = '', tabela?: string, registroId?: string) {
    const linhas = lerTab<Auditoria>(a.slug, 'auditoria');
    linhas.push({ id: uuid(), usuario: `${a.sessao.nome} <${a.sessao.email}>`, usuario_id: a.sessao.id, acao, detalhe, tabela: tabela ?? null, registro_id: registroId ?? null, created_at: agoraIso() });
    gravarTab(a.slug, 'auditoria', linhas);
  }

  function crud<T extends { id: string }>(tabela: string, r: Regras<T>): Crud<T> {
    const pode = (lista: Papel[] | undefined, a: Ator) => !!lista?.includes(a.papel);
    return {
      async list() { const a = tentaAtor(); return a && pode(r.le, a) ? lerTab<T>(a.slug, tabela) : []; },
      async insert(row) {
        const a = ator();
        if (!pode(r.ins, a)) throw erro('SEM_PERMISSAO');
        const novo = { created_at: agoraIso(), ...row, id: uuid() } as unknown as T;
        r.antes?.('ins', null, novo, a);
        gravarTab(a.slug, tabela, [...lerTab<T>(a.slug, tabela), novo]);
        r.depois?.('ins', null, novo, a);
        return novo;
      },
      async update(id, patch) {
        const a = ator();
        if (!pode(r.upd, a)) throw erro('SEM_PERMISSAO');
        const rows = lerTab<T>(a.slug, tabela);
        const i = rows.findIndex(x => x.id === id);
        if (i < 0) throw erro('NAO_ENCONTRADO');
        const velho = rows[i];
        const novo = { ...velho, ...patch } as T;
        r.antes?.('upd', velho, novo, a);
        rows[i] = novo;
        gravarTab(a.slug, tabela, rows);
        r.depois?.('upd', velho, novo, a);
        return novo;
      },
      async remove(id) {
        const a = ator();
        if (!pode(r.del, a)) throw erro('SEM_PERMISSAO');
        const rows = lerTab<T>(a.slug, tabela);
        const velho = rows.find(x => x.id === id);
        if (!velho) return;
        r.antes?.('del', velho, null, a);
        gravarTab(a.slug, tabela, rows.filter(x => x.id !== id));
        r.depois?.('del', velho, null, a);
      },
    };
  }

  const folhasDe = (slug: string) => lerTab<Folha>(slug, 'folhas');
  /** Trava de período fechado (espelho do gatilho `_trg_periodo_fechado`). */
  function travaPeriodo(slug: string, funcionarioId: string, ini: string, fim: string = ini) {
    if (periodoFechado(folhasDe(slug), funcionarioId, ini, fim)) throw erro('PERIODO_FECHADO');
  }

  // ---------------------------------------------------------------- tabelas do escritório
  const funcionarios = crud<Funcionario>('funcionarios', {
    le: ['admin'], ins: ['admin'], upd: ['admin'], del: ['admin'],
    antes(op, velho, _n, a) {
      if (op !== 'del' || !velho) return;
      if (lerTab<Tarefa>(a.slug, 'tarefas').some(t => t.responsavel_id === velho.id || t.revisor_id === velho.id)) throw erro('FUNCIONARIO_COM_HISTORICO');   // FK restrict do banco
      const anexos = lerTab<AnexoLocal>(a.slug, 'anexos');
      if (temHistorico(velho.id, {
        registros: lerTab<RegistroPonto>(a.slug, 'registros'), ocorrencias: lerTab<Ocorrencia>(a.slug, 'ocorrencias'),
        ajustes: lerTab<AjusteFolha>(a.slug, 'ajustes'), ajustesDia: lerTab<AjusteDia>(a.slug, 'ajustes_dia'), folhas: folhasDe(a.slug), anexos,
      })) throw erro('FUNCIONARIO_COM_HISTORICO');
    },
  });
  const registros = crud<RegistroPonto>('registros', {
    le: ['admin', 'gerente'], ins: ['admin', 'gerente'], upd: ['admin', 'gerente'], del: ['admin'],
    antes(op, velho, novo, a) {
      for (const r of [velho, novo]) if (r) travaPeriodo(a.slug, r.funcionario_id, r.data);
      if (op === 'upd' && velho && novo && (novo.analise ?? null) !== (velho.analise ?? null)) {
        if (a.papel !== 'admin') throw erro('SO_ADMINISTRADOR');
        novo.decidido_em = agoraIso();
      }
      if (op === 'ins' && novo) {
        const dup = lerTab<RegistroPonto>(a.slug, 'registros').some(x => x.funcionario_id === novo.funcionario_id && x.data === novo.data && x.tipo === novo.tipo
          && x.status_aprovacao !== 'rejeitado' && novo.status_aprovacao !== 'rejeitado');
        if (dup) throw erro('JA_REGISTRADO');
      }
    },
    depois(op, velho, _n, a) {
      if (op === 'del' && velho) gravarTab(a.slug, 'anexos', lerTab<AnexoLocal>(a.slug, 'anexos').filter(x => x.registro_id !== velho.id));
    },
  });
  const ocorrencias = crud<Ocorrencia>('ocorrencias', {
    le: ['admin', 'gerente'], ins: ['admin', 'gerente'], upd: ['admin', 'gerente'], del: ['admin', 'gerente'],
    antes(op, velho, novo, a) {
      for (const o of [velho, novo]) if (o) travaPeriodo(a.slug, o.funcionario_id, o.data_inicio, o.data_fim);
      if (op === 'upd' && velho && novo && (novo.status_analise ?? 'aceita') !== (velho.status_analise ?? 'aceita')) {
        if (a.papel !== 'admin') throw erro('SO_ADMINISTRADOR');
        novo.decidido_em = agoraIso();
      }
    },
    depois(op, velho, _n, a) {
      if (op === 'del' && velho) gravarTab(a.slug, 'anexos', lerTab<AnexoLocal>(a.slug, 'anexos').filter(x => x.ocorrencia_id !== velho.id));
    },
  });
  const ajustes = crud<AjusteFolha>('ajustes', {
    le: ['admin'], ins: ['admin'], upd: ['admin'], del: ['admin'],
    antes(_op, velho, novo, a) { for (const x of [velho, novo]) if (x) travaPeriodo(a.slug, x.funcionario_id, x.data); },
  });
  const ajustesDia = crud<AjusteDia>('ajustes_dia', {
    le: ['admin', 'gerente'], ins: ['admin'], upd: ['admin'], del: ['admin'],
    antes(_op, velho, novo, a) { for (const x of [velho, novo]) if (x) travaPeriodo(a.slug, x.funcionario_id, x.data); },
  });
  const cargos = crud<Cargo>('cargos', {
    le: ['admin', 'gerente'], ins: ['admin'], upd: ['admin'], del: ['admin'],
    antes(op, _v, novo, a) {
      if (op !== 'del' && novo && lerTab<Cargo>(a.slug, 'cargos').some(c => c.id !== novo.id && c.nome.trim().toLowerCase() === novo.nome.trim().toLowerCase())) throw erro('NOME_EXISTE', 'Já existe um cargo com esse nome.');
    },
    depois(op, velho, _n, a) {
      if (op === 'del' && velho) gravarTab(a.slug, 'funcionarios', lerTab<Funcionario>(a.slug, 'funcionarios').map(f => (f.cargo_id === velho.id ? { ...f, cargo_id: null } : f)));
    },
  });
  const escalas = crud<Escala>('escalas', {
    le: ['admin', 'gerente'], ins: ['admin'], upd: ['admin'], del: ['admin'],
    depois(op, velho, _n, a) {
      if (op === 'del' && velho) gravarTab(a.slug, 'funcionarios', lerTab<Funcionario>(a.slug, 'funcionarios').map(f => (f.escala_id === velho.id ? { ...f, escala_id: null } : f)));
    },
  });
  const feriados = crud<Feriado>('feriados', {
    le: ['admin', 'gerente'], ins: ['admin'], upd: ['admin'], del: ['admin'],
    antes(op, _v, novo, a) {
      if (op !== 'del' && novo && lerTab<Feriado>(a.slug, 'feriados').some(f => f.id !== novo.id && f.data === novo.data)) throw erro('DATA_EXISTE', 'Já existe um feriado nessa data.');
    },
  });


  // ---------------------------------------------------------------- delegação (espelha a migração 0006)
  const DELEGA: Papel[] = ['admin', 'gerente', 'coordenador'];
  const andamentosDe = (slug: string) => lerTab<Andamento>(slug, 'andamentos');
  function novoAndamento(slug: string, tarefaId: string, tipo: Andamento['tipo'], texto: string, autor: string) {
    gravarTab(slug, 'andamentos', [...andamentosDe(slug), { id: uuid(), tarefa_id: tarefaId, tipo, texto, autor_nome: autor, created_at: agoraIso() }]);
  }
  const tarefas = crud<Tarefa>('tarefas', {
    le: DELEGA, ins: DELEGA, upd: DELEGA, del: DELEGA,
    antes(op, velho, novo, a) {
      // coordenador altera e exclui somente o que ele mesmo criou
      if ((op === 'upd' || op === 'del') && a.papel === 'coordenador' && velho?.criado_por !== a.sessao.id) throw erro('SEM_PERMISSAO');
      if (op === 'del' || !novo) return;
      novo.titulo = (novo.titulo ?? '').trim();
      if (novo.titulo.length < 1 || novo.titulo.length > 200) throw erro('NOME_OBRIGATORIO', 'Informe o título (até 200 caracteres).');
      Object.assign(novo, {
        tipo: novo.tipo ?? 'tarefa', prioridade: novo.prioridade ?? 'normal', status: novo.status ?? 'a_fazer', descricao: novo.descricao?.trim() || null,
        area: novo.area ?? null, cliente: novo.cliente?.trim() || null, local: novo.local?.trim() || null, inicio: novo.inicio ?? null, fim: novo.fim ?? null,
        dia_inteiro: !!novo.dia_inteiro, prazo_fatal: !!novo.prazo_fatal, lembrete_min: novo.lembrete_min ?? 60, responsavel_id: novo.responsavel_id ?? null,
        revisor_id: novo.revisor_id ?? null, participantes: [...new Set(novo.participantes ?? [])], updated_at: agoraIso(),
      });
      if (novo.processo_numero && novo.processo_numero.trim()) {
        const n = normalizarCnj(novo.processo_numero);
        if (!n) throw erro('PROCESSO_INVALIDO');
        novo.processo_numero = n;
      } else novo.processo_numero = null;
      if (novo.tipo !== 'tarefa' && !novo.inicio) throw erro('DATAS_INVALIDAS');
      if (novo.inicio && novo.fim && novo.fim < novo.inicio) throw erro('DATAS_INVALIDAS');
      if (novo.dia_inteiro && novo.inicio && !novo.fim) novo.fim = novo.inicio;
      const equipe = new Set(lerTab<Funcionario>(a.slug, 'funcionarios').map(f => f.id));
      if (novo.responsavel_id && !equipe.has(novo.responsavel_id)) throw erro('RESPONSAVEL_INVALIDO');
      if (novo.revisor_id && !equipe.has(novo.revisor_id)) throw erro('RESPONSAVEL_INVALIDO');
      if (novo.participantes.some(p => !equipe.has(p))) throw erro('PARTICIPANTE_INVALIDO');
      if (op === 'ins') { novo.criado_por = a.sessao.id; novo.criado_por_nome = a.sessao.nome; novo.created_at = novo.created_at ?? agoraIso(); }
      else if (velho) { novo.criado_por = velho.criado_por; novo.criado_por_nome = velho.criado_por_nome; }
      if (novo.status === 'concluida') novo.concluida_em = velho?.status === 'concluida' ? velho.concluida_em : agoraIso();
      else novo.concluida_em = null;
    },
    depois(op, velho, novo, a) {
      const quem = a.sessao.nome;
      if (op === 'ins' && novo) auditarLocal(a, 'Criado · tarefas', novo.titulo, 'tarefas', novo.id);
      if (op === 'upd' && velho && novo) {
        if (velho.status !== novo.status) novoAndamento(a.slug, novo.id, 'status', `Status: ${STATUS_ROTULO[velho.status].toLowerCase()} → ${STATUS_ROTULO[novo.status].toLowerCase()}`, quem);
        if (velho.responsavel_id !== novo.responsavel_id) {
          const nome = (id: string | null) => lerTab<Funcionario>(a.slug, 'funcionarios').find(f => f.id === id)?.nome ?? 'ninguém';
          novoAndamento(a.slug, novo.id, 'sistema', `Responsável: ${nome(velho.responsavel_id)} → ${nome(novo.responsavel_id)}`, quem);
        }
        auditarLocal(a, 'Alterado · tarefas', novo.titulo, 'tarefas', novo.id);
      }
      if (op === 'del' && velho) {
        gravarTab(a.slug, 'andamentos', andamentosDe(a.slug).filter(x => x.tarefa_id !== velho.id));
        auditarLocal(a, 'Excluído · tarefas', velho.titulo, 'tarefas', velho.id);
      }
    },
  });
  const paraFuncionario = (t: Tarefa, fid: string, slug: string): TarefaFunc => ({
    id: t.id, tipo: t.tipo, titulo: t.titulo, descricao: t.descricao, prioridade: t.prioridade, status: t.status, area: t.area, processo_numero: t.processo_numero,
    cliente: t.cliente, inicio: t.inicio, fim: t.fim, dia_inteiro: t.dia_inteiro, prazo_fatal: t.prazo_fatal, local: t.local, delegado_por: t.criado_por_nome,
    papel: t.responsavel_id === fid ? 'responsavel' : t.revisor_id === fid ? 'revisor' : 'participante',
    andamentos: andamentosDe(slug).filter(x => x.tarefa_id === t.id).sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 10)
      .map(x => ({ texto: x.texto, autor: x.autor_nome, em: x.created_at, tipo: x.tipo })),
  });

  const folhasBase = crud<Folha>('folhas', {
    le: ['admin'], ins: ['admin'], upd: ['admin'], del: ['admin'],
    antes(op, velho, novo, a) {
      const ctx = { admin: a.papel === 'admin', ocorrencias: lerTab<Ocorrencia>(a.slug, 'ocorrencias'), registros: lerTab<RegistroPonto>(a.slug, 'registros') };
      if (op === 'del') { if (velho && velho.status !== 'aberta') throw erro('PERIODO_FECHADO'); return; }
      if (!novo) return;
      validarMudancaFolha(op === 'upd' ? velho : null, novo, ctx);
      if (op === 'upd' && velho && velho.status !== 'aberta' && novo.status === 'aberta') {
        novo.reaberta_em = agoraIso();
        auditarLocal(a, 'Folha reaberta', `${lerTab<Funcionario>(a.slug, 'funcionarios').find(f => f.id === novo.funcionario_id)?.nome ?? '?'} · ${novo.periodo_inicio} · motivo: ${novo.motivo_reabertura}`, 'folhas', novo.id);
      }
      novo.updated_at = agoraIso();
    },
  });
  const folhas: FolhasRepo = {
    ...folhasBase,
    async upsertMany(rows) {
      const a = exigeAdmin();
      const atuais = folhasDe(a.slug);
      const ctx = { admin: true, ocorrencias: lerTab<Ocorrencia>(a.slug, 'ocorrencias'), registros: lerTab<RegistroPonto>(a.slug, 'registros') };
      for (const r of rows) {
        const i = atuais.findIndex(x => x.funcionario_id === r.funcionario_id && x.periodo_inicio === r.periodo_inicio && x.periodo_fim === r.periodo_fim);
        const novo = { ...(i >= 0 ? atuais[i] : { id: uuid(), created_at: agoraIso() }), ...r, updated_at: agoraIso() } as Folha;
        validarMudancaFolha(i >= 0 ? atuais[i] : null, novo, ctx);
        if (i >= 0) atuais[i] = novo; else atuais.push(novo);
      }
      gravarTab(a.slug, 'folhas', atuais);
    },
    async reabrir(id, motivo) { return folhasBase.update(id, { status: 'aberta', motivo_reabertura: motivo }); },
  };

  const usuariosDoEscritorio = (slug: string) => lerTab<UsuarioLocal>(slug, 'usuarios');
  /** O e-mail já está em uso em QUALQUER escritório (ou na plataforma)? O Auth do Supabase também exige e-mail único. */
  function emailEmUso(email: string): boolean {
    return plataformaUsers().some(u => u.email === email) || escritorios().some(e => usuariosDoEscritorio(e.slug).some(u => u.email === email));
  }
  const adminsAtivos = (slug: string) => usuariosDoEscritorio(slug).filter(u => u.papel === 'admin' && u.ativo).length;

  // ---------------------------------------------------------------- PIN
  const tentativasDe = (slug: string) => lerJson<Tentativas>(kt(slug, 'pin_tentativas'), {});
  async function validarPin(slug: string, fid: string, pin: string): Promise<'ok' | 'PIN_INVALIDO' | 'PIN_BLOQUEADO'> {
    const t = tentativasDe(slug);
    const agora = Date.now();
    const recentes = (t[fid]?.filter(x => agora - x < 10 * 60_000)) ?? [];
    if (recentes.length >= 5) return 'PIN_BLOQUEADO';
    const hoje = agoraBR().data;
    const f = lerTab<Funcionario>(slug, 'funcionarios').find(x => x.id === fid && x.ativo && (!x.data_desligamento || x.data_desligamento >= hoje));
    const ok = !!f?.pin_hash && f.pin_hash === (await hashSecreto(fid, pin));
    const t2 = tentativasDe(slug);                               // relê: outra chamada pode ter gravado durante o await
    t2[fid] = ok ? [] : [...(t2[fid] ?? []).filter(x => agora - x < 10 * 60_000), agora];
    gravarJson(kt(slug, 'pin_tentativas'), t2);
    return ok ? 'ok' : 'PIN_INVALIDO';
  }
  const errP = (e: PontoErro, detalhe?: string): { ok: false; erro: PontoErro; detalhe?: string } => ({ ok: false, erro: e, detalhe });
  const cfgDe = (slug: string): Config => mesclarConfig(lerJson<Config | null>(kt(slug, 'config'), null));
  const escalaDoFunc = (slug: string, fid: string): Escala | null => {
    const f = lerTab<Funcionario>(slug, 'funcionarios').find(x => x.id === fid);
    return lerTab<Escala>(slug, 'escalas').find(e => e.id === f?.escala_id) ?? null;
  };

  // ---------------------------------------------------------------- ponto público (preso a UM escritório)
  function pontoApi(slugBruto: string): PontoApi {
    const slug = (slugBruto ?? '').trim().toLowerCase();
    /** Escritório do endereço; null se não existe ou está suspenso (e já ajusta o relógio para o fuso dele). */
    const alvo = (): { e: EscritorioLocal } | { erro: PontoErro } => {
      const e = escPorSlug(slug);
      if (!e) return { erro: 'ESCRITORIO_NAO_ENCONTRADO' };
      if (!e.ativo) return { erro: 'ESCRITORIO_SUSPENSO' };
      definirFuso(e.fuso);
      return { e };
    };
    const comAlvo = async <R,>(f: (e: EscritorioLocal) => Promise<R>): Promise<R | { ok: false; erro: PontoErro }> => {
      const t = alvo();
      return 'erro' in t ? errP(t.erro) : f(t.e);
    };
    return {
      async buscar(termo) {
        const t = alvo();
        const q = semAcento(termo.trim());
        if ('erro' in t || q.length < 3) return [];
        const cs = lerTab<{ id: string; nome: string }>(slug, 'cargos');
        const hoje = agoraBR().data;
        return lerTab<Funcionario>(slug, 'funcionarios')
          .filter(f => f.ativo && f.tem_pin && (!f.data_desligamento || f.data_desligamento >= hoje) && semAcento(f.nome).includes(q))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 5)
          .map(f => ({ id: f.id, nome: f.nome, cargo_nome: cs.find(c => c.id === f.cargo_id)?.nome ?? null, escala_id: f.escala_id }));
      },
      async escala(escalaId) { return 'erro' in alvo() ? null : lerTab<Escala>(slug, 'escalas').find(e => e.id === escalaId) ?? null; },
      async contexto() {
        const t = alvo();
        if ('erro' in t) return { ok: false, erro: t.erro === 'ESCRITORIO_SUSPENSO' ? 'ESCRITORIO_SUSPENSO' : 'ESCRITORIO_NAO_ENCONTRADO' };
        const c = cfgDe(slug);
        const fer = lerTab<{ data: string; nome: string }>(slug, 'feriados').find(f => f.data === agoraBR().data);
        return { ok: true, ctx: { ponto: c.ponto, escritorio_nome: c.escritorio.nome || t.e.nome, feriado: fer?.nome ?? null, fuso: t.e.fuso } };
      },
      async bater(a: BaterArgs) {
        return comAlvo(async () => {
          const pv = await validarPin(slug, a.funcionario_id, a.pin);
          if (pv !== 'ok') return errP(pv);
          const cfg = cfgDe(slug).ponto;
          const agora = agoraBR();
          if (cfg.geofence_ativo) {
            if (cfg.geofence_lat == null || cfg.geofence_lng == null) return errP('LOCAL_NAO_CONFIGURADO');
            if (a.lat == null || a.lng == null || Math.abs(a.lat) > 90 || Math.abs(a.lng) > 180) return errP('GPS_OBRIGATORIO');
            const d = distanciaMetros(a.lat, a.lng, cfg.geofence_lat, cfg.geofence_lng);
            if (d > cfg.geofence_raio_m) return errP('FORA_DA_AREA', `${Math.round(d)} m (máx. ${cfg.geofence_raio_m} m)`);
          }
          const turno = turnoDaData(escalaDoFunc(slug, a.funcionario_id), agora.data);
          const previsto = previstoDoTipo(turno, a.tipo);
          const c = classificar(a.tipo, previsto, agora.minutos, cfg);
          if (exigeJustificativa(c.status) && (a.justificativa ?? '').trim().length < 3) return errP('JUSTIFICATIVA_OBRIGATORIA', c.status);
          const analise = c.status === 'atraso' || c.status === 'saida_antecipada' ? ('pendente' as const) : null;
          // ---- seção crítica SÍNCRONA (sem await): checar e gravar de uma vez, como o índice único do banco ----
          const regs = lerTab<RegistroPonto>(slug, 'registros');
          if (regs.some(r => r.funcionario_id === a.funcionario_id && r.data === agora.data && r.tipo === a.tipo && r.status_aprovacao !== 'rejeitado')) return errP('JA_REGISTRADO');
          const novo: RegistroPonto = {
            id: uuid(), funcionario_id: a.funcionario_id, data: agora.data, tipo: a.tipo, horario_previsto: previsto, horario_real: agora.iso,
            diferenca_minutos: c.diferenca, status: c.status, justificativa: a.justificativa?.trim() || null,
            latitude: a.lat ?? null, longitude: a.lng ?? null, status_aprovacao: 'aprovado', retroativo: false,
            motivo_rejeicao: null, aprovado_por: null, aprovado_em: null, created_at: agoraIso(), analise,
          };
          gravarTab(slug, 'registros', [...regs, novo]);
          return { ok: true as const, id: novo.id, status: c.status, diferenca_minutos: c.diferenca, horario_real: agora.iso, analise };
        }) as ReturnType<PontoApi['bater']>;
      },
      async historico(fid, pin, limite = 12) {
        return comAlvo(async () => {
          const pv = await validarPin(slug, fid, pin);
          if (pv !== 'ok') return errP(pv);
          const regs = lerTab<RegistroPonto>(slug, 'registros').filter(r => r.funcionario_id === fid)
            .sort((a, b) => b.horario_real.localeCompare(a.horario_real)).slice(0, Math.min(Math.max(limite, 1), 60));
          const registrosOut: MarcacaoHistorico[] = regs.map(r => ({
            id: r.id, data: r.data, tipo: r.tipo, horario_previsto: r.horario_previsto, horario_real: r.horario_real,
            diferenca_minutos: r.diferenca_minutos, status: r.status, justificativa: r.justificativa,
            status_aprovacao: r.status_aprovacao, retroativo: r.retroativo, motivo_rejeicao: r.motivo_rejeicao,
            analise: r.analise ?? null, motivo_decisao: r.motivo_decisao ?? null,
          }));
          const anexosTodos = lerTab<AnexoLocal>(slug, 'anexos');
          const justificativas: JustificativaFunc[] = lerTab<Ocorrencia>(slug, 'ocorrencias')
            .filter(o => o.funcionario_id === fid && o.origem === 'funcionario')
            .sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 10)
            .map(o => ({
              id: o.id, data_inicio: o.data_inicio, data_fim: o.data_fim, tipo: o.tipo, status_analise: o.status_analise ?? 'aceita',
              motivo_decisao: o.motivo_decisao ?? null, observacao: o.observacao, created_at: o.created_at, anexos: anexosTodos.filter(x => x.ocorrencia_id === o.id).length,
            }));
          return { ok: true as const, registros: registrosOut, justificativas };
        }) as ReturnType<PontoApi['historico']>;
      },
      async justificarAusencia(a: JustificarAusenciaArgs) {
        return comAlvo(async () => {
          const pv = await validarPin(slug, a.funcionario_id, a.pin);
          if (pv !== 'ok') return errP(pv);
          const minimo = hojeMais(-45), maximo = hojeMais(30);
          if (!['atestado', 'declaracao', 'audiencia_externa', 'outro'].includes(a.tipo)) return errP('TIPO_INVALIDO');
          if (!a.inicio || !a.fim || a.fim < a.inicio || (Date.parse(a.fim) - Date.parse(a.inicio)) / 86400_000 > 30 || a.fim > maximo || (a.observacao ?? '').length > 600) return errP('PERIODO_INVALIDO');
          if (a.inicio < minimo) return errP('DATA_MUITO_ANTIGA');
          if (periodoFechado(folhasDe(slug), a.funcionario_id, a.inicio, a.fim)) return errP('PERIODO_FECHADO');
          const todas = lerTab<Ocorrencia>(slug, 'ocorrencias');
          if (todas.some(o => o.funcionario_id === a.funcionario_id && (o.status_analise ?? 'aceita') !== 'recusada' && o.data_inicio <= a.fim && o.data_fim >= a.inicio)) return errP('JA_REGISTRADO');
          const nova: Ocorrencia = {
            id: uuid(), funcionario_id: a.funcionario_id, data_inicio: a.inicio, data_fim: a.fim, tipo: a.tipo, remunerado: true,
            observacao: a.observacao?.trim() || null, origem: 'funcionario', status_analise: 'pendente', created_at: agoraIso(),
          };
          gravarTab(slug, 'ocorrencias', [...todas, nova]);
          return { ok: true as const, id: nova.id };
        }) as ReturnType<PontoApi['justificarAusencia']>;
      },
      async anexar(a: AnexarArgs) {
        return comAlvo(async () => {
          const pv = await validarPin(slug, a.funcionario_id, a.pin);
          if (pv !== 'ok') return errP(pv);
          if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(a.arquivo.mime) || a.arquivo.conteudo.length < 40 || a.arquivo.conteudo.length > 3_300_000) return errP('ARQUIVO_INVALIDO');
          const todos = lerTab<AnexoLocal>(slug, 'anexos');
          let permitido = false, n = 0;
          if (a.ocorrencia_id) {
            const o = lerTab<Ocorrencia>(slug, 'ocorrencias').find(x => x.id === a.ocorrencia_id);
            permitido = !!o && o.funcionario_id === a.funcionario_id && o.origem === 'funcionario' && o.status_analise === 'pendente';
            n = todos.filter(x => x.ocorrencia_id === a.ocorrencia_id).length;
          } else if (a.registro_id) {
            const r = lerTab<RegistroPonto>(slug, 'registros').find(x => x.id === a.registro_id);
            permitido = !!r && r.funcionario_id === a.funcionario_id && r.analise === 'pendente';
            n = todos.filter(x => x.registro_id === a.registro_id).length;
          }
          if (!permitido) return errP('NAO_ENCONTRADO');
          if (n >= 4) return errP('LIMITE_ANEXOS');
          const novo: AnexoLocal = {
            id: uuid(), funcionario_id: a.funcionario_id, ocorrencia_id: a.ocorrencia_id ?? null, registro_id: a.registro_id ?? null,
            nome: a.arquivo.nome, mime: a.arquivo.mime, tamanho: a.arquivo.tamanho, conteudo: a.arquivo.conteudo, created_at: agoraIso(),
          };
          try { gravarTab(slug, 'anexos', [...todos, novo]); } catch { return errP('ARQUIVO_INVALIDO', 'Sem espaço no navegador (modo demonstração)'); }
          return { ok: true as const, id: novo.id };
        }) as ReturnType<PontoApi['anexar']>;
      },
      async retroativo(a: RetroativoArgs) {
        return comAlvo(async () => {
          const pv = await validarPin(slug, a.funcionario_id, a.pin);
          if (pv !== 'ok') return errP(pv);
          const hoje = agoraBR().data;
          if (!['entrada', 'saida_intervalo', 'retorno_intervalo', 'saida'].includes(a.tipo)) return errP('TIPO_INVALIDO');
          if (!/^[0-2]\d:[0-5]\d$/.test(a.hora) || Number(a.hora.slice(0, 2)) > 23) return errP('HORA_INVALIDA');
          if (!a.data || a.data >= hoje) return errP('USE_PONTO_NORMAL');
          if (a.data < hojeMais(-45)) return errP('DATA_MUITO_ANTIGA');
          if (a.justificativa.trim().length < 5) return errP('JUSTIFICATIVA_OBRIGATORIA');
          if (periodoFechado(folhasDe(slug), a.funcionario_id, a.data)) return errP('PERIODO_FECHADO');
          const regs = lerTab<RegistroPonto>(slug, 'registros');
          if (regs.some(r => r.funcionario_id === a.funcionario_id && r.data === a.data && r.tipo === a.tipo && r.status_aprovacao !== 'rejeitado')) return errP('JA_REGISTRADO');
          const previsto = previstoDoTipo(turnoDaData(escalaDoFunc(slug, a.funcionario_id), a.data), a.tipo);
          const novo: RegistroPonto = {
            id: uuid(), funcionario_id: a.funcionario_id, data: a.data, tipo: a.tipo, horario_previsto: previsto, horario_real: brParaIso(a.data, a.hora),
            diferenca_minutos: previsto ? hhmmParaMin(a.hora) - hhmmParaMin(previsto) : 0, status: 'pendente', justificativa: a.justificativa.trim(),
            latitude: null, longitude: null, status_aprovacao: 'pendente', retroativo: true, motivo_rejeicao: null, aprovado_por: null, aprovado_em: null, created_at: agoraIso(),
          };
          gravarTab(slug, 'registros', [...regs, novo]);
          return { ok: true as const };
        }) as ReturnType<PontoApi['retroativo']>;
      },
      async tarefas(fid, pin) {
        return comAlvo(async () => {
          const pv = await validarPin(slug, fid, pin);
          if (pv !== 'ok') return errP(pv);
          const corte = Date.now() - 14 * 86400_000;
          const lista = lerTab<Tarefa>(slug, 'tarefas')
            .filter(t => t.status !== 'cancelada' && (t.responsavel_id === fid || t.revisor_id === fid || t.participantes.includes(fid))
              && (t.status !== 'concluida' || (t.concluida_em && Date.parse(t.concluida_em) > corte)))
            .sort((x, y) => Number(x.status === 'concluida') - Number(y.status === 'concluida') || (x.inicio ?? x.created_at).localeCompare(y.inicio ?? y.created_at))
            .map(t => paraFuncionario(t, fid, slug));
          return { ok: true as const, tarefas: lista };
        }) as ReturnType<PontoApi['tarefas']>;
      },
      async atualizarTarefa(a) {
        return comAlvo(async () => {
          const pv = await validarPin(slug, a.funcionario_id, a.pin);
          if (pv !== 'ok') return errP(pv);
          if (!['a_fazer', 'em_andamento', 'em_revisao', 'concluida'].includes(a.status)) return errP('STATUS_INVALIDO');
          const todas = lerTab<Tarefa>(slug, 'tarefas');
          const i = todas.findIndex(t => t.id === a.id && t.responsavel_id === a.funcionario_id && t.status !== 'cancelada');
          if (i < 0) return errP('NAO_ENCONTRADO');
          const velho = todas[i];
          todas[i] = { ...velho, status: a.status as StatusTarefa, concluida_em: a.status === 'concluida' ? agoraIso() : null, updated_at: agoraIso() };
          gravarTab(slug, 'tarefas', todas);
          const nome = lerTab<Funcionario>(slug, 'funcionarios').find(f => f.id === a.funcionario_id)?.nome ?? 'Funcionário';
          const nota = (a.nota ?? '').trim().slice(0, 1500);
          novoAndamento(slug, velho.id, 'status', `Status: ${STATUS_ROTULO[velho.status].toLowerCase()} → ${STATUS_ROTULO[a.status as StatusTarefa].toLowerCase()}${nota ? ` · ${nota}` : ''}`, nome);
          return { ok: true as const };
        }) as ReturnType<PontoApi['atualizarTarefa']>;
      },
    };
  }

  // ---------------------------------------------------------------- inicialização (dados de demonstração)
  const init = async () => {
    if (ls().getItem(K.seeded) === 'v3') return;
    const esc: EscritorioLocal[] = [];
    for (const def of DEMO_ESCRITORIOS) {
      const e: EscritorioLocal = { id: `esc-${def.slug}`, nome: def.nome, slug: def.slug, ativo: true, fuso: def.fuso, created_at: agoraIso() };
      esc.push(e);
      const s = await gerarSeedEscritorio(def, e.id);
      gravarTab(e.slug, 'cargos', s.cargos); gravarTab(e.slug, 'escalas', s.escalas); gravarTab(e.slug, 'funcionarios', s.funcionarios);
      gravarTab(e.slug, 'registros', s.registros); gravarTab(e.slug, 'ocorrencias', s.ocorrencias); gravarTab(e.slug, 'feriados', s.feriados);
      gravarTab(e.slug, 'ajustes', s.ajustes); gravarTab(e.slug, 'folhas', s.folhas); gravarTab(e.slug, 'usuarios', s.usuarios);
      gravarJson(kt(e.slug, 'config'), s.config);
      gravarTab(e.slug, 'tarefas', s.tarefas); gravarTab(e.slug, 'andamentos', s.andamentos);
    }
    gravarJson(K.esc, esc);
    gravarJson(K.plat, [{ id: 'plat-1', email: DEMO_PLATAFORMA.email, nome: DEMO_PLATAFORMA.nome, papel: 'admin', ativo: true, senha_hash: await hashSecreto(DEMO_PLATAFORMA.email, DEMO_PLATAFORMA.senha) }]);
    definirFuso('America/Fortaleza');
    ls().setItem(K.seeded, 'v3');
  };

  // ---------------------------------------------------------------- Db
  const db: Db = {
    modo: 'local',
    init,
    cargos, escalas, funcionarios, registros, ocorrencias, feriados, ajustes, ajustesDia, folhas,
    async periodosFechados() {
      const a = tentaAtor();
      return a && (a.papel === 'admin' || a.papel === 'gerente')
        ? folhasDe(a.slug).filter(f => f.status !== 'aberta').map(f => ({ funcionario_id: f.funcionario_id, periodo_inicio: f.periodo_inicio, periodo_fim: f.periodo_fim, status: f.status }))
        : [];
    },
    async versaoEsquema() { return SCHEMA_ESPERADO; },
    async ultimoBackup() { return null; },
    usuarios: {
      async list() {
        const a = tentaAtor();
        return a && a.papel === 'admin' ? usuariosDoEscritorio(a.slug).map(({ senha_hash: _s, ...u }) => u) : [];
      },
    },
    acessos: {
      async criar(x) {
        const a = exigeAdmin();
        const email = x.email.trim().toLowerCase();
        if (!emailValido(email)) throw erro('EMAIL_INVALIDO');
        { const e = validarSenha(x.senha); if (e) throw new ErroNegocio(x.senha.length < 10 ? 'SENHA_CURTA' : 'SENHA_FRACA', e); }
        if (x.nome.trim().length < 2) throw erro('NOME_OBRIGATORIO');
        if (emailEmUso(email)) throw erro('EMAIL_EXISTE');
        const us = usuariosDoEscritorio(a.slug);
        us.push({ id: uuid(), nome: x.nome.trim(), email, papel: x.papel, ativo: true, senha_hash: await hashSecreto(email, x.senha) });
        gravarTab(a.slug, 'usuarios', us);
        auditarLocal(a, 'Acesso criado', `${email} (${x.papel})`);
      },
      async atualizar(id, x) {
        const a = exigeAdmin();
        const us = usuariosDoEscritorio(a.slug);
        const i = us.findIndex(u => u.id === id);
        if (i < 0) throw erro('NAO_ENCONTRADO');
        const depois = us.map((u, k) => (k === i ? { ...u, nome: x.nome.trim() || u.nome, papel: x.papel, ativo: x.ativo } : u));
        if (depois.filter(u => u.papel === 'admin' && u.ativo).length < 1) throw erro('ULTIMO_ADMIN');
        gravarTab(a.slug, 'usuarios', depois);
        auditarLocal(a, 'Acesso alterado', `${us[i].email} → ${x.papel}${x.ativo ? '' : ' (inativo)'}`);
      },
      async redefinirSenha(id, senha) {
        const a = exigeAdmin();
        { const e = validarSenha(senha); if (e) throw new ErroNegocio(senha.length < 10 ? 'SENHA_CURTA' : 'SENHA_FRACA', e); }
        const us = usuariosDoEscritorio(a.slug);
        const i = us.findIndex(u => u.id === id);
        if (i < 0) throw erro('NAO_ENCONTRADO');
        us[i] = { ...us[i], senha_hash: await hashSecreto(us[i].email, senha) };
        gravarTab(a.slug, 'usuarios', us);
        auditarLocal(a, 'Senha redefinida', us[i].email);
      },
      async remover(id) {
        const a = exigeAdmin();
        if (a.sessao.id === id) throw erro('NAO_REMOVER_A_SI');
        const us = usuariosDoEscritorio(a.slug);
        const alvo = us.find(u => u.id === id);
        if (!alvo) throw erro('NAO_ENCONTRADO');
        if (us.filter(u => u.id !== id && u.papel === 'admin' && u.ativo).length < 1) throw erro('ULTIMO_ADMIN');
        gravarTab(a.slug, 'usuarios', us.filter(u => u.id !== id));
        auditarLocal(a, 'Acesso removido', alvo.email);
      },
    },
    tarefas,
    andamentos: {
      async list(tarefaId) { const a = tentaAtor(); return a && DELEGA.includes(a.papel) ? andamentosDe(a.slug).filter(x => x.tarefa_id === tarefaId).sort((x, y) => x.created_at.localeCompare(y.created_at)) : []; },
      async add(tarefaId, texto) {
        const a = ator();
        if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
        if (!lerTab<Tarefa>(a.slug, 'tarefas').some(t => t.id === tarefaId)) throw erro('NAO_ENCONTRADO');
        const t = texto.trim();
        if (t.length < 1 || t.length > 2000) throw erro('MOTIVO_OBRIGATORIO', 'Escreva o andamento (até 2000 caracteres).');
        novoAndamento(a.slug, tarefaId, 'comentario', t, a.sessao.nome);
      },
    },
    google: {
      // O Google Agenda depende do servidor (OAuth e tokens): no modo demonstração fica indisponível; o link e o .ics continuam funcionando.
      async status() { return { disponivel: false, conectado: false }; },
      async conectar(): Promise<string> { throw erro('GOOGLE_INDISPONIVEL'); },
      async desconectar() { /* nada a desconectar */ },
      async sincronizar() { throw erro('GOOGLE_INDISPONIVEL'); },
      async remover() { /* nada a remover */ },
      async estados() { return []; },
    },
    auditoria: {
      async list() { const a = tentaAtor(); return a && a.papel === 'admin' ? lerTab<Auditoria>(a.slug, 'auditoria') : []; },
      async insert(row) {
        const a = ator();
        const novo = { created_at: agoraIso(), usuario: a.sessao.nome, usuario_id: a.sessao.id, ...row, id: uuid() } as Auditoria;
        gravarTab(a.slug, 'auditoria', [...lerTab<Auditoria>(a.slug, 'auditoria'), novo]);
        return novo;
      },
      async update() { throw erro('REGISTRO_IMUTAVEL'); },
      async remove() { throw erro('REGISTRO_IMUTAVEL'); },
    },
    anexos: {
      async listar(): Promise<AnexoMeta[]> {
        const a = tentaAtor();
        return a && a.papel === 'admin' ? lerTab<AnexoLocal>(a.slug, 'anexos').map(({ conteudo: _c, ...meta }) => meta) : [];
      },
      async abrir(id: string): Promise<AnexoAberto> {
        const a = exigeAdmin();
        const x = lerTab<AnexoLocal>(a.slug, 'anexos').find(z => z.id === id);
        if (!x) throw erro('NAO_ENCONTRADO');
        // cada abertura deixa rastro (tabela só de inserção)
        const acessos = lerTab<AcessoLocal>(a.slug, 'acessos_sensiveis');
        acessos.push({ id: uuid(), usuario: `${a.sessao.nome} <${a.sessao.email}>`, anexo_id: x.id, funcionario_id: x.funcionario_id, acao: 'abrir', origem: null, created_at: agoraIso() });
        gravarTab(a.slug, 'acessos_sensiveis', acessos);
        const url = URL.createObjectURL(base64ParaBlob(x.conteudo, x.mime));
        return { nome: x.nome, mime: x.mime, url, revogar: () => URL.revokeObjectURL(url) };
      },
      async limparLixeira() { return 0; },
    },
    acessosSensiveis: {
      async list() { const a = tentaAtor(); return a && a.papel === 'admin' ? lerTab<AcessoLocal>(a.slug, 'acessos_sensiveis') : []; },
    },
    retencao: {
      async previa() { return retencao(false); },
      async executar() { return retencao(true); },
    },
    documentos: {
      // demonstração: os códigos ficam só neste navegador
      async registrar(d) {
        const a = ator();
        const codigo = d.codigo ?? gerarCodigoDocumento();
        const todos = lerJson<DocumentoVerificado[]>(K.docs, []);
        if (todos.some(x => x.codigo === codigo)) return codigo;
        todos.push({ ...d, codigo, emitido_por: a.papel === 'admin' ? 'Administração' : 'Gerência', emitido_em: agoraIso(), escritorio: a.sessao.escritorio?.nome });
        gravarJson(K.docs, todos);
        return codigo;
      },
      async verificar(codigo) { return lerJson<DocumentoVerificado[]>(K.docs, []).find(x => x.codigo === codigo.trim().toUpperCase()) ?? null; },
    },
    config: {
      async get() { const a = tentaAtor(); return a ? cfgDe(a.slug) : CONFIG_PADRAO; },
      async save(c) { const a = exigeAdmin(); gravarJson(kt(a.slug, 'config'), c); },
    },
    auth: {
      async sessao() { return sessaoValida(); },
      async entrar(email, senha) {
        const e = email.trim().toLowerCase();
        const hash = await hashSecreto(e, senha);
        const falha = () => new Error('E-mail ou senha incorretos.');
        const p = plataformaUsers().find(u => u.email === e);
        if (p) {
          if (!p.ativo || p.senha_hash !== hash) throw falha();
          const s: Sessao = { id: p.id, email: p.email, nome: p.nome, papel: 'plataforma', escritorio: null };
          gravarJson(K.sessao, s);
          return s;
        }
        for (const esc of escritorios()) {
          const u = usuariosDoEscritorio(esc.slug).find(x => x.email === e);
          if (!u) continue;
          if (u.senha_hash !== hash) throw falha();
          if (!u.ativo) throw erro('ACESSO_INATIVO');
          if (!esc.ativo) throw erro('ESCRITORIO_SUSPENSO');
          const s: Sessao = { id: u.id, email: u.email, nome: u.nome, papel: u.papel, escritorio: infoDe(esc) };
          gravarJson(K.sessao, s);
          definirFuso(esc.fuso);
          return s;
        }
        throw falha();
      },
      async sair() { ls().removeItem(K.sessao); },
    },
    async equipe() {
      const a = ator();
      return lerTab<Funcionario>(a.slug, 'funcionarios').map(f => ({
        id: f.id, nome: f.nome, cargo_id: f.cargo_id, escala_id: f.escala_id, ativo: f.ativo,
        data_admissao: f.data_admissao, data_desligamento: f.data_desligamento, vinculo: f.vinculo, tem_pin: f.tem_pin,
      }));
    },
    async definirPin(fid, pin) {
      const a = exigeAdmin();
      const problema = validarFormatoPin(pin);
      if (problema) throw new ErroNegocio(/^\d{6,8}$/.test(pin) ? 'PIN_FRACO' : 'PIN_FORMATO', problema);
      const fs = lerTab<Funcionario>(a.slug, 'funcionarios');
      const i = fs.findIndex(f => f.id === fid);
      if (i < 0) throw erro('NAO_ENCONTRADO');
      fs[i] = { ...fs[i], pin_hash: await hashSecreto(fid, pin), tem_pin: true, pin_curto: false };
      gravarTab(a.slug, 'funcionarios', fs);
      const t = tentativasDe(a.slug); delete t[fid]; gravarJson(kt(a.slug, 'pin_tentativas'), t);
    },
    async aprovarPonto(rid, acao, motivo) {
      const a = ator();
      const r = lerTab<RegistroPonto>(a.slug, 'registros').find(x => x.id === rid);
      if (!r) throw erro('NAO_ENCONTRADO');
      if (acao === 'rejeitar') {
        if (!motivo || motivo.trim().length < 3) throw erro('MOTIVO_OBRIGATORIO');
        await registros.update(rid, { status_aprovacao: 'rejeitado', motivo_rejeicao: motivo.trim(), aprovado_por: a.sessao.id, aprovado_em: agoraIso() });
        return;
      }
      const real = isoParaBR(r.horario_real);
      const c = classificar(r.tipo, r.horario_previsto, real.minutos, cfgDe(a.slug).ponto);
      await registros.update(rid, { status_aprovacao: 'aprovado', status: c.status, diferenca_minutos: c.diferenca, motivo_rejeicao: null, aprovado_por: a.sessao.id, aprovado_em: agoraIso() });
    },

    plataforma: {
      async listar(): Promise<EscritorioPlataforma[]> {
        exigePlataforma();
        return escritorios().map(e => ({
          ...infoDe(e), ativo: e.ativo, created_at: e.created_at,
          usuarios: usuariosDoEscritorio(e.slug).length, admins: adminsAtivos(e.slug), funcionarios: lerTab<Funcionario>(e.slug, 'funcionarios').filter(f => f.ativo).length,
        })).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
      },
      async criar(x) {
        exigePlataforma();
        const slug = x.slug.trim().toLowerCase();
        if (x.nome.trim().length < 2 || x.adminNome.trim().length < 2) throw erro('NOME_OBRIGATORIO');
        if (!SLUG_OK.test(slug)) throw erro('SLUG_INVALIDO');
        if (escPorSlug(slug)) throw erro('SLUG_EXISTE');
        const email = x.adminEmail.trim().toLowerCase();
        if (!emailValido(email)) throw erro('EMAIL_INVALIDO');
        { const e = validarSenha(x.adminSenha); if (e) throw new ErroNegocio(x.adminSenha.length < 10 ? 'SENHA_CURTA' : 'SENHA_FRACA', e); }
        if (emailEmUso(email)) throw erro('EMAIL_EXISTE');
        const e: EscritorioLocal = { id: uuid(), nome: x.nome.trim(), slug, ativo: true, fuso: x.fuso || 'America/Fortaleza', created_at: agoraIso() };
        definirFuso(e.fuso);
        const modelo = baseEscritorioNovo();
        gravarTab(slug, 'cargos', modelo.cargos); gravarTab(slug, 'escalas', modelo.escalas);
        for (const t of ['funcionarios', 'registros', 'ocorrencias', 'ajustes', 'ajustes_dia', 'folhas', 'auditoria', 'anexos', 'tarefas', 'andamentos']) gravarTab(slug, t, []);
        gravarTab(slug, 'feriados', modelo.feriados);
        gravarJson(kt(slug, 'config'), mesclarConfig({ escritorio: { ...CONFIG_PADRAO.escritorio, nome: e.nome } }));
        gravarTab(slug, 'usuarios', [{ id: uuid(), nome: x.adminNome.trim(), email, papel: 'admin', ativo: true, senha_hash: await hashSecreto(email, x.adminSenha) }]);
        gravarJson(K.esc, [...escritorios(), e]);
        definirFuso(sessaoValida()?.escritorio?.fuso);
      },
      async atualizar(id, x) {
        exigePlataforma();
        const lista = escritorios();
        const i = lista.findIndex(e => e.id === id);
        if (i < 0) throw erro('NAO_ENCONTRADO');
        if (x.nome.trim().length < 2) throw erro('NOME_OBRIGATORIO');
        lista[i] = { ...lista[i], nome: x.nome.trim(), ativo: x.ativo, fuso: x.fuso || lista[i].fuso };
        gravarJson(K.esc, lista);
      },
      async usuarios(escritorioId) {
        exigePlataforma();
        const e = escritorios().find(z => z.id === escritorioId);
        return e ? usuariosDoEscritorio(e.slug).map(({ senha_hash: _s, ...u }) => u) : [];
      },
      async criarAdmin(escritorioId, x) {
        exigePlataforma();
        const e = escritorios().find(z => z.id === escritorioId);
        if (!e) throw erro('NAO_ENCONTRADO');
        const email = x.email.trim().toLowerCase();
        if (!emailValido(email)) throw erro('EMAIL_INVALIDO');
        { const er = validarSenha(x.senha); if (er) throw new ErroNegocio(x.senha.length < 10 ? 'SENHA_CURTA' : 'SENHA_FRACA', er); }
        if (x.nome.trim().length < 2) throw erro('NOME_OBRIGATORIO');
        if (emailEmUso(email)) throw erro('EMAIL_EXISTE');
        gravarTab(e.slug, 'usuarios', [...usuariosDoEscritorio(e.slug), { id: uuid(), nome: x.nome.trim(), email, papel: 'admin', ativo: true, senha_hash: await hashSecreto(email, x.senha) }]);
      },
      async redefinirSenha(usuarioId, senha) {
        exigePlataforma();
        { const er = validarSenha(senha); if (er) throw new ErroNegocio(senha.length < 10 ? 'SENHA_CURTA' : 'SENHA_FRACA', er); }
        for (const e of escritorios()) {
          const us = usuariosDoEscritorio(e.slug);
          const i = us.findIndex(u => u.id === usuarioId);
          if (i < 0) continue;
          us[i] = { ...us[i], senha_hash: await hashSecreto(us[i].email, senha) };
          gravarTab(e.slug, 'usuarios', us);
          return;
        }
        throw erro('NAO_ENCONTRADO');
      },
      async excluir(escritorioId) {
        exigePlataforma();
        const e = escritorios().find(z => z.id === escritorioId);
        if (!e) throw erro('NAO_ENCONTRADO');
        if (lerTab<Funcionario>(e.slug, 'funcionarios').length) throw erro('ESCRITORIO_COM_DADOS');
        for (const k of Object.keys(ls()).filter(k => k.startsWith(kt(e.slug, '')))) ls().removeItem(k);
        gravarJson(K.esc, escritorios().filter(z => z.id !== escritorioId));
      },
    },

    ponto: { para: pontoApi },
  };

  // ---------------------------------------------------------------- retenção (LGPD)
  function retencao(executar: boolean): ResumoExpurgo {
    const a = exigeAdmin();
    const cfg = cfgDe(a.slug).privacidade;
    const hoje = agoraBR().data;
    const corteAnexos = new Date(); corteAnexos.setMonth(corteAnexos.getMonth() - cfg.anexos_meses);
    const corteGeo = hojeMais(-cfg.geolocalizacao_meses * 30);
    const corteTent = Date.now() - RETENCAO_TENTATIVAS_DIAS * 86400_000;
    const anexos = lerTab<AnexoLocal>(a.slug, 'anexos');
    const velhos = anexos.filter(x => new Date(x.created_at) < corteAnexos);
    const regs = lerTab<RegistroPonto>(a.slug, 'registros');
    const comGeo = regs.filter(r => r.data < corteGeo && (r.latitude != null || r.longitude != null));
    const t = tentativasDe(a.slug);
    const nTent = Object.values(t).reduce((s, v) => s + v.filter(x => x < corteTent).length, 0);
    if (executar) {
      gravarTab(a.slug, 'anexos', anexos.filter(x => !velhos.includes(x)));
      // a exceção ao congelamento do período vale só aqui (como a permissão transacional do banco)
      gravarTab(a.slug, 'registros', regs.map(r => (comGeo.includes(r) ? { ...r, latitude: null, longitude: null } : r)));
      gravarJson(kt(a.slug, 'pin_tentativas'), Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.filter(x => x >= corteTent)])));
      auditarLocal(a, 'Expurgo de retenção', `anexos: ${velhos.length} · geolocalização de marcações: ${comGeo.length} · tentativas de PIN: ${nTent}`, 'retencao');
    }
    void hoje;
    return { executado: executar, anexos: velhos.length, geolocalizacao: comGeo.length, tentativas_pin: nTent, arquivos_a_remover_do_storage: 0,
      regras: { anexos_meses: cfg.anexos_meses, geolocalizacao_meses: cfg.geolocalizacao_meses, tentativas_dias: RETENCAO_TENTATIVAS_DIAS } };
  }

  return db;
}
