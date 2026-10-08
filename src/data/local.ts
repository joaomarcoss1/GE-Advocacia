/**
 * Banco em memória persistido no localStorage: modo demonstração/teste, sem servidor.
 *
 * Multiescritório: cada escritório tem o SEU próprio "banco" (chaves `ge.v1.e.<slug>.<tabela>`), e todas as operações
 * resolvem o escritório pela SESSÃO — não existe caminho de código que leia ou grave no escritório de outro usuário.
 * As regras de integridade espelham as do Postgres (migrações 0002 e 0003): duplicidade de marcação, histórico que impede
 * exclusão, período fechado congelado, decisões só do administrador, rastro de acessos a atestados, retenção.
 */
import { CONFIG_PADRAO, mesclarConfig } from '@/lib/config';
import { addDays, agoraBR, brParaIso, definirFuso, hhmmParaMin, hojeMais, isoParaBR } from '@/lib/datetime';
import { gerarCodigoDocumento } from '@/lib/codigo';
import { ErroNegocio, erro } from '@/lib/erros';
import { semAcento } from '@/lib/format';
import { classificar, distanciaMetros, exigeJustificativa, previstoDoTipo, turnoDaData } from '@/lib/ponto';
import { RETENCAO_TENTATIVAS_DIAS, SCHEMA_ESPERADO, periodoFechado, temHistorico, validarMudancaFolha } from '@/lib/regras';
import { validarPin as validarFormatoPin, validarSenha } from '@/lib/seguranca';
import { base64ParaBlob } from '@/lib/anexos';
import { normalizarCnj } from '@/lib/cnj';
import { MAX_DOCUMENTO_DEMO, MODELOS_INICIAIS, mimeDoNome } from '@/lib/checklist';
import type { ModeloDocumento } from '@/lib/modelos';
import { normalizarParametros, type PropostaHonorarios } from '@/lib/precificacao';
import { exigeProvidencia, prazoNoTexto } from '@/lib/intimacoes';
import { ehCategoria, sugerirCategoria, type CategoriaDoc } from '@/lib/organizacao';
import { calcularPrazo, chaveMovimento, classificarMovimento, porCategoria, tarefaDoMovimento, tribunalDeCnj, type Classificacao, type MovimentoBruto } from '@/lib/processos';
import { STATUS_ROTULO } from '@/lib/tarefas';
import type {
  AcessoSensivel, AjusteDia, AjusteFolha, Andamento, AnexoMeta, Auditoria, Cargo, Config, Escala, EscritorioInfo, EscritorioPlataforma, Feriado, Folha,
  ChecklistItem, ChecklistModelo, Cliente, DadosConsultaProcesso, DocumentoArquivo, EnvioPublicoInfo, LinkEnvio, Movimento, Processo, ResultadoConsulta,
  Funcionario, Intimacao, IntimacoesSync, Ocorrencia, Papel, RegistroPonto, StatusTarefa, Tarefa, TarefaFunc, Usuario,
} from '@/lib/types';
import type {
  AnexarArgs, AnexoAberto, ArquivosRepo, BaterArgs, Crud, Db, DocumentoVerificado, FolhasRepo, ProcessosRepo, JustificarAusenciaArgs, JustificativaFunc, MarcacaoHistorico,
  PontoApi, PontoErro, ResumoExpurgo, RetroativoArgs, Sessao,
} from './db';
import { DEMO_ESCRITORIOS, DEMO_PLATAFORMA, baseEscritorioNovo, gerarSeedEscritorio, hashSecreto } from './seed';
import { HISTORICO_SIMULADO, NOVOS_SIMULADOS } from './simulacao';

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
      novo.processo_id = novo.processo_id ?? null; novo.origem_movimento_id = novo.origem_movimento_id ?? null;
      if (novo.processo_id) {                                        // tarefa de processo cadastrado: número, cliente e área vêm do cadastro
        const pr = lerTab<Processo>(a.slug, 'processos').find(x => x.id === novo.processo_id);
        if (!pr) throw erro('PROCESSO_INVALIDO');
        novo.processo_numero = pr.numero;
        if (!novo.cliente && pr.cliente_id) novo.cliente = lerTab<Cliente>(a.slug, 'clientes').find(c => c.id === pr.cliente_id)?.nome ?? null;
        novo.area = novo.area ?? pr.area;
      }
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

  // ---------------------------------------------------------------- clientes, processos, documentos (espelha a migração 0007)
  const GESTAO: Papel[] = ['admin', 'gerente'];
  type MovimentoLocal = Movimento & { chave: string };
  type ArquivoLocal = DocumentoArquivo & { enviado_por: string | null };
  type LinkLocal = LinkEnvio & { token_hash: string };
  type AcessoDoc = { id: string; documento_id: string; usuario: string; created_at: string };
  const clientesDe = (slug: string) => lerTab<Cliente>(slug, 'clientes');
  const processosDe = (slug: string) => lerTab<Processo>(slug, 'processos');
  const movimentosDe = (slug: string) => lerTab<MovimentoLocal>(slug, 'movimentos');
  const itensDe = (slug: string) => lerTab<ChecklistItem>(slug, 'checklist_itens');
  const arquivosDe = (slug: string) => lerTab<ArquivoLocal>(slug, 'arquivos');
  const linksDe = (slug: string) => lerTab<LinkLocal>(slug, 'links');
  const semDados = <T extends object>(l: T): Omit<T, 'token_hash'> => { const { token_hash: _t, ...r } = l as T & { token_hash?: string }; return r as Omit<T, 'token_hash'>; };

  const clientes = crud<Cliente>('clientes', {
    le: DELEGA, ins: DELEGA, upd: DELEGA, del: GESTAO,
    antes(op, velho, novo, a) {
      if (op === 'del') {
        if (processosDe(a.slug).some(p => p.cliente_id === velho?.id) || arquivosDe(a.slug).some(d => d.cliente_id === velho?.id)) throw erro('CLIENTE_COM_VINCULOS');
        return;
      }
      if (!novo) return;
      novo.nome = (novo.nome ?? '').trim();
      if (novo.nome.length < 2 || novo.nome.length > 200) throw erro('NOME_OBRIGATORIO');
      Object.assign(novo, {
        tipo: novo.tipo ?? 'pf', documento: (novo.documento ?? '').replace(/[^0-9A-Za-z]/g, '') || null, email: novo.email?.trim() || null, telefone: novo.telefone?.trim() || null,
        observacoes: novo.observacoes?.trim() || null, ativo: novo.ativo ?? true, updated_at: agoraIso(), drive_folder_id: velho?.drive_folder_id ?? null,
        rg: novo.rg?.trim() || null, estado_civil: novo.estado_civil?.trim() || null, profissao: novo.profissao?.trim() || null, nacionalidade: novo.nacionalidade?.trim() || null, endereco: novo.endereco?.trim() || null,
      });
    },
    depois(op, velho, novo, a) {
      if (op === 'ins' && novo) auditarLocal(a, 'Criado · clientes', novo.nome, 'clientes', novo.id);
      if (op === 'upd' && novo) auditarLocal(a, 'Alterado · clientes', novo.nome, 'clientes', novo.id);
      if (op === 'del' && velho) auditarLocal(a, 'Excluído · clientes', velho.nome, 'clientes', velho.id);
    },
  });

  const processosBase = crud<Processo>('processos', {
    le: DELEGA, ins: DELEGA, upd: DELEGA, del: GESTAO,
    antes(op, velho, novo, a) {
      if (op === 'del') {
        if (lerTab<Tarefa>(a.slug, 'tarefas').some(t => t.processo_id === velho?.id) || arquivosDe(a.slug).some(d => d.processo_id === velho?.id)) throw erro('PROCESSO_COM_VINCULOS');
        return;
      }
      if (!novo) return;
      const n = normalizarCnj(novo.numero);
      if (!n) throw erro('PROCESSO_INVALIDO');
      novo.numero = n;
      if (processosDe(a.slug).some(p => p.id !== novo.id && p.numero === n)) throw erro('PROCESSO_EXISTE');
      if (novo.cliente_id && !clientesDe(a.slug).some(c => c.id === novo.cliente_id)) throw erro('NAO_ENCONTRADO');
      if (novo.responsavel_id && !lerTab<Funcionario>(a.slug, 'funcionarios').some(f => f.id === novo.responsavel_id)) throw erro('RESPONSAVEL_INVALIDO');
      Object.assign(novo, {
        cliente_id: novo.cliente_id ?? null, titulo: novo.titulo?.trim() || null, polo: novo.polo ?? 'ativo', parte_contraria: novo.parte_contraria?.trim() || null, area: novo.area ?? null,
        classe: novo.classe ?? null, assunto: novo.assunto ?? null, orgao_julgador: novo.orgao_julgador ?? null, grau: novo.grau ?? null, data_ajuizamento: novo.data_ajuizamento ?? null,
        tribunal: novo.tribunal ?? tribunalDeCnj(n)?.alias ?? null, valor_causa: novo.valor_causa ?? null, situacao: novo.situacao ?? 'ativo', fase: novo.fase ?? 'conhecimento',
        responsavel_id: novo.responsavel_id ?? null, monitorar: novo.monitorar ?? true, sigiloso: !!novo.sigiloso, observacoes: novo.observacoes?.trim() || null, updated_at: agoraIso(),
        // consulta ao tribunal é do servidor: o painel não altera
        ultima_consulta: velho?.ultima_consulta ?? null, ultima_consulta_erro: velho?.ultima_consulta_erro ?? null, ultima_movimentacao_em: velho?.ultima_movimentacao_em ?? null,
      });
    },
    depois(op, velho, novo, a) {
      if (op === 'ins' && novo) auditarLocal(a, 'Criado · processos', novo.numero, 'processos', novo.id);
      if (op === 'upd' && novo) auditarLocal(a, 'Alterado · processos', novo.numero, 'processos', novo.id);
      if (op === 'del' && velho) {
        gravarTab(a.slug, 'movimentos', movimentosDe(a.slug).filter(m => m.processo_id !== velho.id));
        gravarTab(a.slug, 'checklist_itens', itensDe(a.slug).filter(i => i.processo_id !== velho.id));
        gravarTab(a.slug, 'links', linksDe(a.slug).filter(l => l.processo_id !== velho.id));
        auditarLocal(a, 'Excluído · processos', velho.numero, 'processos', velho.id);
      }
    },
  });

  /** Grava andamentos novos (sem repetir), classifica e cria a tarefa dos que exigem ação. Primeira leitura = "linha de base": o histórico entra como lido, sem tarefas. */
  function ingerirMovimentos(a: Ator, proc: Processo, brutos: MovimentoBruto[], origem: Movimento['origem'], baseline: boolean): { novos: number; tarefas: number } {
    const todos = movimentosDe(a.slug);
    const chaves = new Set(todos.filter(m => m.processo_id === proc.id).map(m => m.chave));
    const cfg = cfgDe(a.slug);
    const feriados = new Set(lerTab<Feriado>(a.slug, 'feriados').map(f => f.data));
    const cli = proc.cliente_id ? clientesDe(a.slug).find(c => c.id === proc.cliente_id)?.nome ?? null : null;
    const tarefas = lerTab<Tarefa>(a.slug, 'tarefas');
    let novos = 0, criadas = 0, ultima = proc.ultima_movimentacao_em;
    for (const b of brutos) {
      const chave = chaveMovimento(origem === 'simulada' ? 'sim' : 'dj', b);
      if (chaves.has(chave)) continue;
      chaves.add(chave);
      const c: Classificacao = classificarMovimento(b);
      const recente = Date.now() - Date.parse(b.dataHora) <= 7 * 86_400_000;
      const m: MovimentoLocal = {
        id: uuid(), processo_id: proc.id, origem, codigo: b.codigo ?? null, nome: b.nome, complemento: b.complemento ?? null, data_hora: b.dataHora, categoria: c.categoria,
        exige_acao: c.exige_acao, prazo_sugerido_dias: c.prazo_sugerido_dias, lido: baseline && !(recente && c.exige_acao), tarefa_id: null, criado_por_nome: null, created_at: agoraIso(), chave,
      };
      if (cfg.automacao.tarefa_andamento && c.exige_acao && (!baseline || recente)) {
        const sug = tarefaDoMovimento({ id: proc.id, numero: proc.numero, titulo: proc.titulo, cliente: cli, responsavel_id: proc.responsavel_id }, b, c, feriados);
        const t: Tarefa = {
          id: uuid(), ...sug, status: 'a_fazer', area: proc.area, inicio: null, fim: null, dia_inteiro: false, prazo_fatal: false, lembrete_min: 60, local: null, revisor_id: null,
          participantes: [], origem_movimento_id: m.id, criado_por: null, criado_por_nome: 'Acompanhamento de processos', concluida_em: null, created_at: agoraIso(), updated_at: agoraIso(),
        };
        tarefas.push(t); m.tarefa_id = t.id; criadas++;
      }
      todos.push(m); novos++;
      if (!ultima || b.dataHora > ultima) ultima = b.dataHora;
    }
    gravarTab(a.slug, 'movimentos', todos);
    if (criadas) gravarTab(a.slug, 'tarefas', tarefas);
    const procs = processosDe(a.slug);
    const i = procs.findIndex(p => p.id === proc.id);
    if (i >= 0) { procs[i] = { ...procs[i], ultima_consulta: agoraIso(), ultima_consulta_erro: null, ultima_movimentacao_em: ultima }; gravarTab(a.slug, 'processos', procs); }
    return { novos, tarefas: criadas };
  }
  function consultarSimulado(a: Ator, proc: Processo): { novos: number; tarefas: number } {
    const jaSimulados = movimentosDe(a.slug).filter(m => m.processo_id === proc.id && m.origem === 'simulada');
    if (!proc.ultima_consulta) {
      const hist = HISTORICO_SIMULADO.map(h => ({ nome: h.nome, complemento: h.complemento ?? null, dataHora: new Date(Date.now() + h.dias * 86_400_000).toISOString() }));
      return ingerirMovimentos(a, proc, hist, 'simulada', true);
    }
    const prox = NOVOS_SIMULADOS[Math.max(0, jaSimulados.length - HISTORICO_SIMULADO.length) % NOVOS_SIMULADOS.length];
    return ingerirMovimentos(a, proc, [{ nome: prox.nome, complemento: prox.complemento ?? null, dataHora: new Date().toISOString() }], 'simulada', false);
  }

  /** Data do andamento, do mais novo para o mais antigo; empate = o gravado depois vem primeiro. */
  const maisNovosPrimeiro = <T extends { data_hora: string }>(l: T[]) => l.map((m, i) => ({ m, i })).sort((x, y) => y.m.data_hora.localeCompare(x.m.data_hora) || y.i - x.i).map(z => z.m);

  const processos: ProcessosRepo = {
    ...processosBase,
    async movimentos(id) {
      const a = tentaAtor();
      return a && DELEGA.includes(a.papel) ? maisNovosPrimeiro(movimentosDe(a.slug).filter(m => m.processo_id === id)).map(({ chave: _c, ...m }) => m) : [];
    },
    async naoLidos() {
      const a = tentaAtor();
      return a && DELEGA.includes(a.papel) ? maisNovosPrimeiro(movimentosDe(a.slug).filter(m => !m.lido)).map(({ chave: _c, ...m }) => m) : [];
    },
    async registrarMovimento(id, m) {
      const a = ator();
      if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
      if (!processosDe(a.slug).some(p => p.id === id)) throw erro('NAO_ENCONTRADO');
      const nome = m.nome.trim();
      if (!nome || nome.length > 300 || !m.data_hora) throw erro('NOME_OBRIGATORIO');
      const c = porCategoria(m.categoria);
      const novo: MovimentoLocal = {
        id: uuid(), processo_id: id, origem: 'manual', codigo: null, nome, complemento: m.complemento?.trim() || null, data_hora: m.data_hora, categoria: c.categoria,
        exige_acao: c.exige_acao, prazo_sugerido_dias: c.prazo_sugerido_dias, lido: true, tarefa_id: null, criado_por_nome: a.sessao.nome, created_at: agoraIso(), chave: `m|${uuid()}`,
      };
      gravarTab(a.slug, 'movimentos', [...movimentosDe(a.slug), novo]);
      const ps = processosDe(a.slug), i = ps.findIndex(p => p.id === id);
      if (i >= 0 && (!ps[i].ultima_movimentacao_em || m.data_hora > ps[i].ultima_movimentacao_em!)) { ps[i] = { ...ps[i], ultima_movimentacao_em: m.data_hora }; gravarTab(a.slug, 'processos', ps); }
      const { chave: _c, ...pub } = novo;
      return pub;
    },
    async marcarLidos(id) {
      const a = ator();
      if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
      gravarTab(a.slug, 'movimentos', movimentosDe(a.slug).map(m => (m.processo_id === id ? { ...m, lido: true } : m)));
    },
    async buscar(numero): Promise<DadosConsultaProcesso | null> {
      const a = ator();
      if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
      const n = normalizarCnj(numero);
      if (!n) throw erro('PROCESSO_INVALIDO');
      const t = tribunalDeCnj(n);
      if (!t) return null;
      return { classe: 'Procedimento Comum Cível', assunto: 'Dados de demonstração', orgao_julgador: 'Vara simulada', tribunal: t.sigla, grau: 'G1', data_ajuizamento: null, sigiloso: false };
    },
    async consultar(id) {
      const a = ator();
      if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
      const p = processosDe(a.slug).find(x => x.id === id);
      if (!p) throw erro('NAO_ENCONTRADO');
      const r = consultarSimulado(a, p);
      return { processos: 1, novos: r.novos, tarefas: r.tarefas, erros: 0, mensagem: 'Consulta simulada (demonstração).' };
    },
    async consultarTodos() {
      const a = ator();
      if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
      let novos = 0, tarefas = 0;
      const alvo = processosDe(a.slug).filter(p => p.monitorar && p.situacao === 'ativo');
      for (const p of alvo) { const r = consultarSimulado(a, p); novos += r.novos; tarefas += r.tarefas; }
      return { processos: alvo.length, novos, tarefas, erros: 0, mensagem: 'Consulta simulada (demonstração).' } satisfies ResultadoConsulta;
    },
    async fonte() { return { disponivel: true, simulada: true }; },
  };

  // ---- checklist
  const modelos = crud<ChecklistModelo>('checklist_modelos', {
    le: DELEGA, ins: GESTAO, upd: GESTAO, del: GESTAO,
    antes(op, _v, novo, a) {
      if (op === 'del' || !novo) return;
      novo.nome = (novo.nome ?? '').trim();
      if (novo.nome.length < 2) throw erro('NOME_OBRIGATORIO');
      if (lerTab<ChecklistModelo>(a.slug, 'checklist_modelos').some(m => m.id !== novo.id && m.nome.toLowerCase() === novo.nome.toLowerCase())) throw erro('NOME_EXISTE', 'Já existe um modelo com esse nome.');
      novo.itens = (novo.itens ?? []).filter(i => i.nome?.trim()).slice(0, 80).map(i => ({ nome: i.nome.trim(), ...(i.obrigatorio === false ? { obrigatorio: false } : {}) }));
      novo.ativo = novo.ativo ?? true; novo.area = novo.area ?? null; novo.tipo = novo.tipo?.trim() || null; novo.descricao = novo.descricao?.trim() || null;
    },
  });
  const modelosDocumentos = crud<ModeloDocumento>('modelos_documentos', {
    le: DELEGA, ins: GESTAO, upd: GESTAO, del: GESTAO,
    antes(op, velho, novo, a) {
      if (op === 'del' || !novo) return;
      novo.titulo = (novo.titulo ?? '').trim();
      if (novo.titulo.length < 2 || novo.titulo.length > 160) throw erro('NOME_OBRIGATORIO');
      if (lerTab<ModeloDocumento>(a.slug, 'modelos_documentos').some(m => m.id !== novo.id && m.titulo.toLowerCase() === novo.titulo.toLowerCase())) throw erro('NOME_EXISTE', 'Já existe um modelo com esse título.');
      if (!novo.conteudo || novo.conteudo.length < 20 || novo.conteudo.length > 80000) throw erro('ARQUIVO_INVALIDO', 'O texto do modelo deve ter de 20 a 80.000 caracteres.');
      novo.categoria = novo.categoria ?? 'manifestacoes'; novo.area = novo.area ?? null; novo.descricao = novo.descricao?.trim() || null; novo.ativo = novo.ativo ?? true;
      novo.versao = op === 'upd' && velho && velho.conteudo !== novo.conteudo ? (velho.versao ?? 1) + 1 : (velho?.versao ?? 1);
      novo.updated_at = agoraIso();
    },
  });
  // ---- intimações do DJEN: no modo demonstração a "busca" gera comunicações de exemplo para os processos cadastrados
  const IMUTAVEIS_INTIMACAO = ['djen_id', 'tribunal', 'texto', 'tipo_comunicacao', 'numero_processo', 'data_disponibilizacao', 'orgao', 'classe', 'link', 'destinatarios', 'advogados', 'hash', 'created_at'] as const;
  const intimacoesBase = crud<Intimacao>('intimacoes', {
    le: DELEGA, ins: [], upd: DELEGA, del: GESTAO,
    antes(op, velho, novo, a) {
      if (op === 'del' || !novo || !velho) return;
      for (const k of IMUTAVEIS_INTIMACAO) if (JSON.stringify(novo[k]) !== JSON.stringify(velho[k])) throw erro('CAMPO_IMUTAVEL', 'O conteúdo da intimação vem do tribunal e não pode ser alterado.');
      if (!['nova', 'lida', 'tratada', 'descartada'].includes(novo.status)) throw erro('ARQUIVO_INVALIDO', 'Situação inválida.');
      if (novo.status === 'tratada' || novo.status === 'descartada') { novo.tratada_em = velho.tratada_em ?? agoraIso(); novo.tratada_por_nome = velho.tratada_por_nome ?? a.sessao.nome; }
      else { novo.tratada_em = null; novo.tratada_por_nome = null; }
      novo.updated_at = agoraIso();
    },
  });
  const MODELOS_DEMO_INTIMACAO = [
    { tipo: 'Intimação', doc: 'Decisão (expediente)', texto: 'Fica a parte autora intimada para, no prazo de 15 (quinze) dias, manifestar-se sobre a contestação e os documentos juntados pela parte ré.', dias: 1 },
    { tipo: 'Intimação', doc: 'Despacho (expediente)', texto: 'Intime-se a parte ré para apresentar contrarrazões ao recurso no prazo de 15 (quinze) dias úteis.', dias: 2 },
    { tipo: 'Intimação', doc: 'Ato ordinatório', texto: 'Audiência de conciliação designada. Ficam as partes e seus advogados intimados a comparecer. Não há prazo a cumprir.', dias: 3 },
  ];
  const intimacoes: Db['intimacoes'] = {
    list: intimacoesBase.list, update: intimacoesBase.update, remove: intimacoesBase.remove,
    async novas() { const a = tentaAtor(); return a && DELEGA.includes(a.papel) ? lerTab<Intimacao>(a.slug, 'intimacoes').filter(i => i.status === 'nova').length : 0; },
    async sync() { const a = tentaAtor(); return a && DELEGA.includes(a.papel) ? lerJson<IntimacoesSync | null>(kt(a.slug, 'intimacoes_sync'), null) : null; },
    async buscar() {
      const a = ator();
      if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
      const procs = processosDe(a.slug).filter(p => p.situacao === 'ativo').slice(0, 3);
      const oabs = lerTab<Funcionario>(a.slug, 'funcionarios').filter(f => f.oab).map(f => f.oab as string);
      const existentes = lerTab<Intimacao>(a.slug, 'intimacoes');
      const fer = new Set(lerTab<{ data: string }>(a.slug, 'feriados').map(f => f.data));
      const hoje = agoraBR().data;
      let novas = 0;
      const gravar: Intimacao[] = [];
      procs.forEach((p, k) => {
        const m = MODELOS_DEMO_INTIMACAO[k % MODELOS_DEMO_INTIMACAO.length];
        const djen = 900_000_000 + [...(p.id + m.doc)].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 99_999_999, 7);
        if (existentes.some(x => x.djen_id === djen) || gravar.some(x => x.djen_id === djen)) return;
        const data = addDays(hoje, -m.dias);
        const providencia = exigeProvidencia(m.tipo, m.texto), pz = providencia ? prazoNoTexto(m.texto) : null;
        const calc = pz ? calcularPrazo({ marco: data, tipo: 'disponibilizacao', dias: pz.dias, regime: pz.regime, feriados: fer }) : null;
        gravar.push({
          id: uuid(), djen_id: djen, hash: null, tribunal: tribunalDeCnj(p.numero)?.sigla ?? 'TJMA', tipo_comunicacao: m.tipo, tipo_documento: m.doc, orgao: p.orgao_julgador ?? '1ª Vara Cível', classe: p.classe ?? 'Procedimento Comum Cível',
          numero_processo: p.numero, processo_id: p.id, texto: m.texto, link: null, data_disponibilizacao: data, meio: 'D', cancelada: false, destinatarios: p.parte_contraria ? [{ nome: p.parte_contraria, polo: 'P' }] : [],
          advogados: [], oab_busca: oabs[0] ?? null, exige_providencia: providencia, prazo_dias: pz?.dias ?? null, prazo_regime: pz?.regime ?? null, prazo_fim: calc?.vencimento ?? null, status: 'nova',
          responsavel_id: p.responsavel_id ?? null, tarefa_id: null, tratada_em: null, tratada_por_nome: null, created_at: agoraIso(), updated_at: agoraIso(),
        });
        novas++;
      });
      if (gravar.length) gravarTab(a.slug, 'intimacoes', [...existentes, ...gravar]);
      const mensagem = !procs.length ? 'Cadastre processos para ver intimações de exemplo.' : novas ? `${novas} intimação(ões) de exemplo (demonstração).` : 'Nenhuma intimação nova (demonstração).';
      const sync: IntimacoesSync = { executada_em: agoraIso(), oabs: oabs.slice(0, 5), novas, erros: 0, mensagem };
      gravarJson(kt(a.slug, 'intimacoes_sync'), sync);
      return { oabs: oabs.length, novas, tarefas: 0, erros: 0, mensagem };
    },
  };
  const propostas = crud<PropostaHonorarios>('honorarios_propostas', {
    le: ['admin'], ins: ['admin'], upd: ['admin'], del: ['admin'],
    antes(op, velho, novo) {
      if (op === 'del' || !novo) return;
      novo.titulo = (novo.titulo ?? '').trim();
      if (novo.titulo.length < 2 || novo.titulo.length > 200) throw erro('NOME_OBRIGATORIO');
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0);
      novo.valor_recomendado = num(novo.valor_recomendado); novo.valor_proposto = num(novo.valor_proposto); novo.exito_pct = Math.min(100, num(novo.exito_pct));
      novo.status = novo.status ?? 'rascunho'; novo.cliente_id = novo.cliente_id ?? null; novo.processo_id = novo.processo_id ?? null; novo.forma_pagamento = novo.forma_pagamento?.trim() || null;
      novo.observacoes = novo.observacoes?.trim() || null; novo.updated_at = agoraIso(); novo.created_at = velho?.created_at ?? novo.created_at ?? agoraIso();
    },
  });
  const itens = crud<ChecklistItem>('checklist_itens', {
    le: DELEGA, ins: DELEGA, upd: DELEGA, del: GESTAO,
    antes(op, velho, novo, a) {
      if (op === 'del' || !novo) return;
      novo.nome = (novo.nome ?? '').trim();
      if (!novo.nome) throw erro('NOME_OBRIGATORIO');
      if (novo.processo_id) {
        const pr = processosDe(a.slug).find(p => p.id === novo.processo_id);
        if (!pr) throw erro('NAO_ENCONTRADO');
        novo.cliente_id = novo.cliente_id ?? pr.cliente_id;
      }
      if (!novo.cliente_id && !novo.processo_id) throw erro('NAO_ENCONTRADO');
      Object.assign(novo, { obrigatorio: novo.obrigatorio ?? true, status: novo.status ?? 'pendente', observacao: novo.observacao ?? null, ordem: novo.ordem ?? 0, cliente_id: novo.cliente_id ?? null, processo_id: novo.processo_id ?? null });
      if (novo.status === 'recebido' || novo.status === 'conferido') novo.recebido_em = velho?.recebido_em ?? agoraIso(); else novo.recebido_em = null;
    },
  });
  const aplicarChecklist: Db['checklist']['aplicar'] = async (modeloId, alvo) => {
    const a = ator();
    if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
    const m = lerTab<ChecklistModelo>(a.slug, 'checklist_modelos').find(x => x.id === modeloId);
    if (!m) throw erro('NAO_ENCONTRADO');
    let clienteId = alvo.cliente_id ?? null;
    const processoId = alvo.processo_id ?? null;
    if (processoId) { const p = processosDe(a.slug).find(x => x.id === processoId); if (!p) throw erro('NAO_ENCONTRADO'); clienteId = p.cliente_id; }
    else if (!clienteId || !clientesDe(a.slug).some(c => c.id === clienteId)) throw erro('NAO_ENCONTRADO');
    const todos = itensDe(a.slug);
    const doDossie = todos.filter(i => (processoId ? i.processo_id === processoId : !i.processo_id && i.cliente_id === clienteId));
    let ordem = Math.max(0, ...doDossie.map(i => i.ordem));
    let n = 0;
    for (const it of m.itens) {
      if (doDossie.some(x => x.nome.toLowerCase() === it.nome.toLowerCase())) continue;
      todos.push({ id: uuid(), cliente_id: clienteId, processo_id: processoId, nome: it.nome, obrigatorio: it.obrigatorio !== false, status: 'pendente', observacao: null, ordem: ++ordem, recebido_em: null, created_at: agoraIso() });
      n++;
    }
    gravarTab(a.slug, 'checklist_itens', todos);
    return n;
  };

  // ---- arquivos (documentos dos clientes)
  const conteudoDe = (slug: string, id: string) => lerJson<Record<string, string>>(kt(slug, 'arquivos_conteudo'), {})[id];
  function guardarArquivo(slug: string, quem: { id: string | null; nome: string }, origem: DocumentoArquivo['origem'], x: { cliente_id: string; processo_id?: string | null; item_id?: string | null; categoria?: CategoriaDoc | null; arquivo: { nome: string; mime: string; tamanho: number; conteudo: string } }): DocumentoArquivo {
    const { cliente_id, arquivo } = x;
    const processo_id = x.processo_id ?? null, item_id = x.item_id ?? null;
    if (!clientesDe(slug).some(c => c.id === cliente_id)) throw erro('NAO_ENCONTRADO');
    const proc = processo_id ? processosDe(slug).find(p => p.id === processo_id) : null;
    if (processo_id && (!proc || (proc.cliente_id && proc.cliente_id !== cliente_id))) throw erro('CLIENTE_DIFERENTE');
    const item = item_id ? itensDe(slug).find(i => i.id === item_id) : null;
    if (item_id && (!item || !(item.processo_id === processo_id || (!item.processo_id && item.cliente_id === cliente_id)))) throw erro('ITEM_INVALIDO');
    const mime = mimeDoNome(arquivo.nome);
    if (!mime || mime !== arquivo.mime && !arquivo.mime.startsWith('image/') || arquivo.conteudo.length < 20) throw erro('ARQUIVO_INVALIDO', 'Tipo de arquivo não aceito. Envie PDF, imagem ou documento do Office.');
    if (arquivo.tamanho > MAX_DOCUMENTO_DEMO) throw erro('ARQUIVO_INVALIDO', 'No modo demonstração o limite é de 1,5 MB por arquivo (o navegador guarda pouco). No sistema real o limite é de 20 MB.');
    const doc: ArquivoLocal = {
      id: uuid(), cliente_id, processo_id, item_id, nome: arquivo.nome.slice(0, 200), mime, tamanho: arquivo.tamanho, sha256: null, origem, enviado_por: quem.id, enviado_por_nome: quem.nome,
      conferido: false, conferido_em: null, drive_status: 'desligado', drive_link: null, drive_erro: null,
      categoria: x.categoria && ehCategoria(x.categoria) ? x.categoria : sugerirCategoria(arquivo.nome, item?.nome), created_at: agoraIso(),
    };
    const cont = lerJson<Record<string, string>>(kt(slug, 'arquivos_conteudo'), {});
    cont[doc.id] = arquivo.conteudo;
    try { gravarJson(kt(slug, 'arquivos_conteudo'), cont); } catch { throw erro('ARQUIVO_INVALIDO', 'Sem espaço no navegador (modo demonstração).'); }
    gravarTab(slug, 'arquivos', [...arquivosDe(slug), doc]);
    if (item_id) gravarTab(slug, 'checklist_itens', itensDe(slug).map(i => (i.id === item_id && i.status === 'pendente' ? { ...i, status: 'recebido' as const, recebido_em: agoraIso() } : i)));
    return doc;
  }
  const arquivos: ArquivosRepo = {
    async list(f) {
      const a = tentaAtor();
      if (!a || !DELEGA.includes(a.papel)) return [];
      return arquivosDe(a.slug).filter(d => (!f?.cliente_id || d.cliente_id === f.cliente_id) && (!f?.processo_id || d.processo_id === f.processo_id)).sort((x, y) => y.created_at.localeCompare(x.created_at)).map(({ enviado_por: _e, ...d }) => ({ ...d, categoria: d.categoria ?? 'outros' })); // dados de demonstração antigos não têm categoria
    },
    async enviar(x) {
      const a = ator();
      if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
      const guardado = guardarArquivo(a.slug, { id: a.sessao.id, nome: a.sessao.nome }, 'painel', x) as ArquivoLocal;
      // impressão digital do conteúdo (igual à do servidor): permite avisar de arquivo repetido também na demonstração
      try {
        const bin = atob(x.arquivo.conteudo), bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
        guardado.sha256 = h;
        gravarTab(a.slug, 'arquivos', arquivosDe(a.slug).map(d => (d.id === guardado.id ? { ...d, sha256: h } : d)));
      } catch { /* sem hash: só não avisa de repetido */ }
      const { enviado_por: _e, ...d } = guardado;
      auditarLocal(a, 'Documento recebido', d.nome, 'documentos', d.id);
      return d;
    },
    async reclassificar(id, categoria) {
      const a = ator();
      if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
      if (!ehCategoria(categoria)) throw erro('ARQUIVO_INVALIDO', 'Categoria inválida.');
      if (!arquivosDe(a.slug).some(d => d.id === id)) throw erro('NAO_ENCONTRADO');
      gravarTab(a.slug, 'arquivos', arquivosDe(a.slug).map(d => (d.id === id ? { ...d, categoria } : d)));
    },
    async abrir(id) {
      const a = ator();
      if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
      const d = arquivosDe(a.slug).find(x => x.id === id), c = conteudoDe(a.slug, id);
      if (!d || !c) throw erro('NAO_ENCONTRADO');
      gravarTab(a.slug, 'arquivos_acessos', [...lerTab<AcessoDoc>(a.slug, 'arquivos_acessos'), { id: uuid(), documento_id: id, usuario: `${a.sessao.nome} <${a.sessao.email}>`, created_at: agoraIso() }]);
      const url = URL.createObjectURL(base64ParaBlob(c, d.mime));
      return { nome: d.nome, mime: d.mime, url, revogar: () => URL.revokeObjectURL(url) };
    },
    async conferir(id, conferido) {
      const a = ator();
      if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
      gravarTab(a.slug, 'arquivos', arquivosDe(a.slug).map(d => (d.id === id ? { ...d, conferido, conferido_em: conferido ? agoraIso() : null } : d)));
    },
    async remover(id) {
      const a = ator();
      if (!GESTAO.includes(a.papel)) throw erro('SEM_PERMISSAO');
      const d = arquivosDe(a.slug).find(x => x.id === id);
      if (!d) return;
      gravarTab(a.slug, 'arquivos', arquivosDe(a.slug).filter(x => x.id !== id));
      const cont = lerJson<Record<string, string>>(kt(a.slug, 'arquivos_conteudo'), {}); delete cont[id]; gravarJson(kt(a.slug, 'arquivos_conteudo'), cont);
      if (d.item_id && !arquivosDe(a.slug).some(x => x.item_id === d.item_id)) gravarTab(a.slug, 'checklist_itens', itensDe(a.slug).map(i => (i.id === d.item_id && (i.status === 'recebido' || i.status === 'conferido') ? { ...i, status: 'pendente' as const, recebido_em: null } : i)));
      auditarLocal(a, 'Excluído · documentos', d.nome, 'documentos', d.id);
    },
    async resumo() {
      const a = tentaAtor();
      const ds = a && DELEGA.includes(a.papel) ? arquivosDe(a.slug) : [];
      return { total: ds.length, sem_conferir: ds.filter(d => !d.conferido).length, drive_pendente: ds.filter(d => d.drive_status === 'pendente' || d.drive_status === 'erro').length };
    },
    links: {
      async list() { const a = tentaAtor(); return a && DELEGA.includes(a.papel) ? linksDe(a.slug).map(semDados) : []; },
      async criar(x) {
        const a = ator();
        if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
        if (!clientesDe(a.slug).some(c => c.id === x.cliente_id)) throw erro('NAO_ENCONTRADO');
        if (x.processo_id && !processosDe(a.slug).some(p => p.id === x.processo_id && p.cliente_id === x.cliente_id)) throw erro('NAO_ENCONTRADO');
        const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
        const token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const link: LinkLocal = {
          id: uuid(), cliente_id: x.cliente_id, processo_id: x.processo_id ?? null, rotulo: x.rotulo?.slice(0, 120) ?? null, ativo: true, max_arquivos: 40, usos: 0, ultimo_uso: null,
          expira_em: new Date(Date.now() + Math.max(1, Math.min(60, x.dias ?? 14)) * 86_400_000).toISOString(), created_at: agoraIso(), token_hash: await hashSecreto('link', token),
        };
        gravarTab(a.slug, 'links', [...linksDe(a.slug), link]);
        return { link: semDados(link), token };
      },
      async revogar(id) {
        const a = ator();
        if (!DELEGA.includes(a.papel)) throw erro('SEM_PERMISSAO');
        if (!linksDe(a.slug).some(l => l.id === id)) throw erro('NAO_ENCONTRADO');
        gravarTab(a.slug, 'links', linksDe(a.slug).map(l => (l.id === id ? { ...l, ativo: false } : l)));
      },
    },
    // O Drive depende do servidor (OAuth e tokens): na demonstração fica indisponível; os arquivos ficam organizados por cliente e processo no sistema.
    drive: {
      async status() { return { disponivel: false, conectado: false }; },
      async conectar(): Promise<string> { throw erro('GOOGLE_INDISPONIVEL'); },
      async desconectar() { /* nada a desconectar */ },
      async sincronizar() { return { enviados: 0, erros: 0 }; },
      async pasta(): Promise<string> { throw erro('GOOGLE_INDISPONIVEL'); },
    },
    publico: {
      async info(token) {
        const r = await acharLink(token);
        if ('erro' in r) return { ok: false, erro: r.erro };
        const { e, l } = r;
        const cli = clientesDe(e.slug).find(c => c.id === l.cliente_id);
        const proc = l.processo_id ? processosDe(e.slug).find(p => p.id === l.processo_id) : null;
        const lista = itensDe(e.slug).filter(i => i.status !== 'dispensado' && (l.processo_id ? i.processo_id === l.processo_id : !i.processo_id && i.cliente_id === l.cliente_id));
        return { ok: true, escritorio: e.nome, cliente: cli?.nome ?? '', processo: proc?.numero ?? null, expira_em: l.expira_em, restantes: Math.max(0, l.max_arquivos - l.usos),
          itens: lista.sort((x, y) => x.ordem - y.ordem).map(i => ({ id: i.id, nome: i.nome, obrigatorio: i.obrigatorio, status: i.status })) } satisfies EnvioPublicoInfo;
      },
      async enviar(token, itemId, arquivo) {
        const r = await acharLink(token);
        if ('erro' in r) return { ok: false, erro: r.erro };
        const { e, l } = r;
        if (l.usos >= l.max_arquivos) return { ok: false, erro: 'Limite de arquivos deste link atingido. Peça um novo link ao escritório.' };
        if (itemId && !itensDe(e.slug).some(i => i.id === itemId && (l.processo_id ? i.processo_id === l.processo_id : !i.processo_id && i.cliente_id === l.cliente_id))) return { ok: false, erro: 'Item não encontrado.' };
        try { guardarArquivo(e.slug, { id: null, nome: 'Cliente (link de envio)' }, 'link_cliente', { cliente_id: l.cliente_id, processo_id: l.processo_id, item_id: itemId, arquivo }); }
        catch (x) { return { ok: false, erro: (x as Error).message }; }
        gravarTab(e.slug, 'links', linksDe(e.slug).map(z => (z.id === l.id ? { ...z, usos: z.usos + 1, ultimo_uso: agoraIso() } : z)));
        return { ok: true };
      },
    },
  };
  /** Localiza o link pelo HASH do token (o token em si nunca é guardado) e confere validade. */
  async function acharLink(token: string): Promise<{ e: EscritorioLocal; l: LinkLocal } | { erro: string }> {
    const h = await hashSecreto('link', (token ?? '').trim());
    for (const e of escritorios()) {
      const l = linksDe(e.slug).find(x => x.token_hash === h);
      if (!l) continue;
      if (!e.ativo) return { erro: 'Este endereço está indisponível.' };
      if (!l.ativo || Date.parse(l.expira_em) < Date.now()) return { erro: 'Este link expirou ou foi cancelado. Peça um novo ao escritório.' };
      return { e, l };
    }
    return { erro: 'Link inválido. Confira o endereço recebido do escritório.' };
  }

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

  const modelosIniciais = (): ChecklistModelo[] => MODELOS_INICIAIS.map(m => ({ id: uuid(), nome: m.nome, area: m.area, itens: m.itens, ativo: true, created_at: agoraIso() }));

  // ---------------------------------------------------------------- inicialização (dados de demonstração)
  const init = async () => {
    if (ls().getItem(K.seeded) === 'v4') return;
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
      gravarTab(e.slug, 'clientes', s.clientes); gravarTab(e.slug, 'processos', s.processos); gravarTab(e.slug, 'movimentos', s.movimentos);
      gravarTab(e.slug, 'checklist_modelos', s.modelos); gravarTab(e.slug, 'checklist_itens', s.itens); gravarTab(e.slug, 'arquivos', s.arquivos);
      gravarJson(kt(e.slug, 'arquivos_conteudo'), s.conteudos);
    }
    gravarJson(K.esc, esc);
    gravarJson(K.plat, [{ id: 'plat-1', email: DEMO_PLATAFORMA.email, nome: DEMO_PLATAFORMA.nome, papel: 'admin', ativo: true, senha_hash: await hashSecreto(DEMO_PLATAFORMA.email, DEMO_PLATAFORMA.senha) }]);
    definirFuso('America/Fortaleza');
    ls().setItem(K.seeded, 'v4');
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
    clientes,
    processos,
    checklist: { modelos, itens, aplicar: aplicarChecklist },
    arquivos,
    modelosDocumentos,
    intimacoes,
    honorarios: {
      parametros: {
        async get() { const a = tentaAtor(); return normalizarParametros(a?.papel === 'admin' ? lerJson(kt(a.slug, 'honorarios_parametros'), {}) : {}); },
        async save(p) { const a = exigeAdmin(); gravarJson(kt(a.slug, 'honorarios_parametros'), normalizarParametros(p)); auditarLocal(a, 'Alterado · honorarios_parametros', 'Parâmetros de honorários', 'honorarios_parametros', a.slug); },
      },
      propostas,
    },
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
        for (const t of ['funcionarios', 'registros', 'ocorrencias', 'ajustes', 'ajustes_dia', 'folhas', 'auditoria', 'anexos', 'tarefas', 'andamentos', 'clientes', 'processos', 'movimentos', 'checklist_itens', 'arquivos', 'links']) gravarTab(slug, t, []);
        gravarTab(slug, 'checklist_modelos', modelosIniciais());
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
        if (lerTab<Funcionario>(e.slug, 'funcionarios').length || clientesDe(e.slug).length || processosDe(e.slug).length) throw erro('ESCRITORIO_COM_DADOS');
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
