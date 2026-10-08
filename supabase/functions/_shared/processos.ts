/**
 * Regras de acompanhamento de processos, SEM dependência de Deno nem do navegador.
 * Um único arquivo usado pelo app (modo demonstração e telas) e pelas Edge Functions — assim o servidor e a tela
 * classificam o andamento e calculam o prazo exatamente do mesmo jeito.
 *
 * Apoio técnico: prazos e classificações são SUGESTÕES para o advogado conferir no ato; não substituem a leitura da decisão.
 */

// ---------------------------------------------------------------- tribunal a partir do número CNJ
// NNNNNNN-DD.AAAA.J.TR.OOOO  ·  J = ramo da Justiça · TR = tribunal
const UF: Record<string, string> = {
  '01': 'ac', '02': 'al', '03': 'ap', '04': 'am', '05': 'ba', '06': 'ce', '07': 'dft', '08': 'es', '09': 'go', '10': 'ma', '11': 'mt', '12': 'ms', '13': 'mg',
  '14': 'pa', '15': 'pb', '16': 'pr', '17': 'pe', '18': 'pi', '19': 'rj', '20': 'rn', '21': 'rs', '22': 'ro', '23': 'rr', '24': 'sc', '25': 'se', '26': 'sp', '27': 'to',
};

export interface Tribunal { alias: string; sigla: string }
/** Tribunal (nome usado na API pública do DataJud) a partir dos 20 dígitos. Null se o ramo não é consultável (STF, CNJ) ou o número é inválido. */
export function tribunalDeCnj(numero: string): Tribunal | null {
  const d = (numero ?? '').replace(/\D/g, '');
  if (d.length !== 20) return null;
  const j = d[13], tr = d.slice(14, 16);
  let alias: string | null = null;
  if (j === '3' && tr === '00') alias = 'stj';
  else if (j === '4' && /^0[1-6]$/.test(tr)) alias = `trf${Number(tr)}`;
  else if (j === '5') alias = tr === '00' ? 'tst' : Number(tr) >= 1 && Number(tr) <= 24 ? `trt${Number(tr)}` : null;
  else if (j === '6') alias = tr === '00' ? 'tse' : UF[tr] && tr !== '07' ? `tre-${UF[tr]}` : tr === '07' ? 'tre-dft' : null;
  else if (j === '7' && tr === '00') alias = 'stm';
  else if (j === '8') alias = UF[tr] ? `tj${UF[tr]}` : null;
  else if (j === '9') alias = ({ '13': 'tjmmg', '21': 'tjmrs', '26': 'tjmsp' } as Record<string, string>)[tr] ?? null;
  return alias ? { alias, sigla: alias.toUpperCase() } : null;
}

export const urlDatajud = (alias: string) => `https://api-publica.datajud.cnj.jus.br/api_publica_${alias}/_search`;
export const corpoConsultaDatajud = (numero: string) => ({ size: 10, query: { match: { numeroProcesso: numero.replace(/\D/g, '') } } });

// ---------------------------------------------------------------- andamentos
export type Categoria = 'sentenca' | 'decisao' | 'despacho' | 'intimacao' | 'citacao' | 'audiencia' | 'juntada' | 'peticao' | 'recurso' | 'transito' | 'arquivamento' | 'distribuicao' | 'conclusao' | 'outros';
export type Prioridade = 'baixa' | 'normal' | 'alta' | 'urgente';
export interface MovimentoBruto { codigo?: number | null; nome: string; dataHora: string; complemento?: string | null }
export interface Classificacao { categoria: Categoria; exige_acao: boolean; prazo_sugerido_dias: number | null; prioridade: Prioridade }

export const CATEGORIA_ROTULO: Record<Categoria, string> = {
  sentenca: 'Sentença', decisao: 'Decisão', despacho: 'Despacho', intimacao: 'Intimação', citacao: 'Citação', audiencia: 'Audiência', juntada: 'Juntada',
  peticao: 'Petição', recurso: 'Recurso', transito: 'Trânsito em julgado', arquivamento: 'Arquivamento', distribuicao: 'Distribuição', conclusao: 'Conclusão', outros: 'Andamento',
};

const sa = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Regra padrão de cada categoria (usada também quando a pessoa registra o andamento à mão e escolhe o tipo). */
export function porCategoria(categoria: Categoria): Classificacao {
  const base = { citacao: [true, 15, 'alta'], sentenca: [true, 15, 'alta'], intimacao: [true, 15, 'alta'], decisao: [true, 15, 'alta'], audiencia: [true, null, 'alta'],
    despacho: [true, 5, 'normal'], transito: [true, null, 'normal'], arquivamento: [true, null, 'normal'] } as Record<string, [boolean, number | null, Prioridade]>;
  const b = base[categoria];
  return { categoria, exige_acao: b ? b[0] : false, prazo_sugerido_dias: b ? b[1] : null, prioridade: b ? b[2] : 'baixa' };
}

/** Classifica pelo texto do andamento (nome + complementos). A ordem importa: o primeiro que casa vale. */
export function classificarMovimento(m: Pick<MovimentoBruto, 'nome' | 'complemento'>): Classificacao {
  // "cumprimento/execução/liquidação de sentença" é a fase do processo, não uma sentença nova
  const t = sa(`${m.nome} ${m.complemento ?? ''}`).replace(/(cumprimento|execucao|liquidacao)( provisori[oa]| definitiv[oa])?( de| da| do)? sentenca/g, 'fase de cumprimento');
  const r = (categoria: Categoria, exige_acao: boolean, prazo: number | null, prioridade: Prioridade): Classificacao => ({ categoria, exige_acao, prazo_sugerido_dias: prazo, prioridade });
  if (/transito em julgado|transitad[oa] em julgado/.test(t)) return r('transito', true, null, 'normal');
  if (/(^|\W)sentenca|julgad[oa] (procedente|improcedente|parcialmente)|\b(im)?procedencia\b|extint[oa] (o )?(processo|execucao|feito)|extincao d[oa] (processo|execucao)|homologa\w* (a |o )?(transacao|acordo)/.test(t)) return r('sentenca', true, 15, 'alta');
  if (/\bcitacao|\bcitad[oa]\b/.test(t)) return r('citacao', true, 15, 'alta');
  if (/audiencia/.test(t)) return /realizad|ata de audiencia|cancelad|dispensad/.test(t) ? r('audiencia', false, null, 'baixa') : r('audiencia', true, null, 'alta');
  if (/intimacao|intimad[oa]|publicacao|disponibiliza|ciencia (ao|a|do|da) (advogad|parte|procurador)|ato ordinatorio/.test(t)) return r('intimacao', true, 15, 'alta');
  if (/decisao|liminar|tutela|antecipacao|indeferid|deferid[oa]|concedid[oa]|pronunciamento/.test(t)) return r('decisao', true, 15, 'alta');
  if (/despacho|determinad[oa]|ordem judicial/.test(t)) return r('despacho', true, 5, 'normal');
  if (/arquiv|baixa definitiva|baixad[oa]/.test(t)) return r('arquivamento', true, null, 'normal');
  if (/recurso|apelacao|agravo|embargos|contrarrazoes|razoes/.test(t)) return r('recurso', false, null, 'baixa');
  if (/juntad/.test(t)) return r('juntada', false, null, 'baixa');
  if (/peticao|requerimento|manifestacao/.test(t)) return r('peticao', false, null, 'baixa');
  if (/conclus/.test(t)) return r('conclusao', false, null, 'baixa');
  if (/distribui|autuacao|recebimento/.test(t)) return r('distribuicao', false, null, 'baixa');
  return r('outros', false, null, 'baixa');
}

/** Chave que identifica o andamento (a mesma lida duas vezes não duplica). */
export function chaveMovimento(origem: string, m: Pick<MovimentoBruto, 'codigo' | 'nome' | 'dataHora'>): string {
  const t = Date.parse(m.dataHora);
  return `${origem}|${m.codigo ?? ''}|${Number.isFinite(t) ? Math.floor(t / 1000) : m.dataHora}|${m.nome.slice(0, 80)}`;
}

// ---------------------------------------------------------------- resposta do DataJud
export interface DadosProcesso {
  classe: string | null; assunto: string | null; orgao_julgador: string | null; tribunal: string | null; grau: string | null;
  data_ajuizamento: string | null; sigiloso: boolean; movimentos: MovimentoBruto[];
}
type Obj = Record<string, unknown>;
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** O DataJud devolve datas como ISO ("2024-03-05T14:41:36.000Z") ou compactas ("20240305144136"). */
export function dataDatajud(v: unknown): string | null {
  const s = txt(v);
  if (!s) return null;
  const c = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/);
  const iso = c ? `${c[1]}-${c[2]}-${c[3]}T${c[4] ?? '00'}:${c[5] ?? '00'}:${c[6] ?? '00'}Z` : s;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Junta os documentos devolvidos (um por grau/sistema) em um só: dados do mais recente e andamentos de todos, sem repetir. */
export function lerRespostaDatajud(resp: unknown): DadosProcesso | null {
  const hits = (((resp as Obj)?.hits as Obj)?.hits as Obj[] | undefined) ?? [];
  const docs = hits.map(h => h._source as Obj).filter(Boolean);
  if (!docs.length) return null;
  docs.sort((a, b) => String(b.dataHoraUltimaAtualizacao ?? '').localeCompare(String(a.dataHoraUltimaAtualizacao ?? '')));
  const d = docs[0];
  const vistos = new Set<string>();
  const movimentos: MovimentoBruto[] = [];
  for (const doc of docs) {
    for (const mv of ((doc.movimentos as Obj[] | undefined) ?? [])) {
      const nome = txt(mv.nome);
      const dataHora = dataDatajud(mv.dataHora);
      if (!nome || !dataHora) continue;
      const compl = ((mv.complementosTabelados as Obj[] | undefined) ?? []).map(c => [txt(c.nome), txt(c.descricao)].filter(Boolean).join(': ')).filter(Boolean).join('; ');
      const m: MovimentoBruto = { codigo: typeof mv.codigo === 'number' ? mv.codigo : null, nome, dataHora, complemento: compl || null };
      const k = chaveMovimento('dj', m);
      if (vistos.has(k)) continue;
      vistos.add(k);
      movimentos.push(m);
    }
  }
  movimentos.sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  const assuntos = (d.assuntos as Obj[] | undefined) ?? [];
  const data = dataDatajud(d.dataAjuizamento);
  return {
    classe: txt((d.classe as Obj)?.nome), assunto: txt(assuntos[0]?.nome), orgao_julgador: txt((d.orgaoJulgador as Obj)?.nome), tribunal: txt(d.tribunal),
    grau: txt(d.grau), data_ajuizamento: data ? data.slice(0, 10) : null, sigiloso: Number(d.nivelSigilo ?? 0) > 0, movimentos,
  };
}

// ---------------------------------------------------------------- prazos em dias úteis
const parse = (d: string) => new Date(`${d}T12:00:00Z`);
export const somarDias = (d: string, n: number) => { const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const diaDaSemana = (d: string) => parse(d).getUTCDay();

/** Recesso forense: de 20/12 a 20/01 (CPC, art. 220) os prazos ficam suspensos. */
export const emRecesso = (d: string) => { const mmdd = d.slice(5); return mmdd >= '12-20' || mmdd <= '01-20'; };
export const diaUtil = (d: string, feriados: ReadonlySet<string> = new Set()) => { const w = diaDaSemana(d); return w !== 0 && w !== 6 && !feriados.has(d) && !emRecesso(d); };

export type RegimePrazo = 'uteis' | 'corridos';
/**
 * Vencimento a partir do marco (data da publicação/intimação/ciência).
 *  • úteis: não conta o dia do marco; o 1º dia é o 1º dia útil seguinte; sábados, domingos, feriados e recesso não contam (CPC, arts. 219, 224 e 220);
 *  • corridos: soma os dias e, se cair em dia sem expediente, passa para o próximo dia útil.
 * Os feriados vêm do cadastro do escritório (nacionais, estaduais e municipais); sem eles, só fins de semana e recesso são considerados.
 */
export function calcularVencimento(marco: string, dias: number, feriados: ReadonlySet<string> = new Set(), regime: RegimePrazo = 'uteis'): string {
  const n = Math.max(0, Math.floor(dias));
  let d = marco;
  if (regime === 'corridos') {
    d = somarDias(marco, n);
    while (!diaUtil(d, feriados)) d = somarDias(d, 1);
    return d;
  }
  let contados = 0;
  for (let guarda = 0; contados < n && guarda < 2000; guarda++) {
    d = somarDias(d, 1);
    if (diaUtil(d, feriados)) contados++;
  }
  if (n === 0) while (!diaUtil(d, feriados)) d = somarDias(d, 1);
  return d;
}

// ---------------------------------------------------------------- prazo processual completo (marco, dobro, passo a passo)
/** O que o número informado representa: determina onde começa a contagem. */
export type TipoMarco = 'disponibilizacao' | 'publicacao' | 'ciencia' | 'envio_portal';
export const TIPO_MARCO_ROTULO: Record<TipoMarco, string> = {
  disponibilizacao: 'Disponibilização no Diário (DJe/DJEN)',
  publicacao: 'Publicação (já considerada publicada)',
  ciencia: 'Ciência / juntada / citação cumprida',
  envio_portal: 'Intimação eletrônica sem consulta (portal)',
};
export interface OpcoesPrazo { marco: string; tipo?: TipoMarco; dias: number; regime?: RegimePrazo; dobro?: boolean; feriados?: ReadonlySet<string> }
export interface ResultadoPrazo { vencimento: string; inicio: string; publicacao: string | null; ciencia: string | null; dias: number; passos: string[] }

const proximoDiaUtil = (d: string, feriados: ReadonlySet<string>) => { let x = somarDias(d, 1); while (!diaUtil(x, feriados)) x = somarDias(x, 1); return x; };
const extenso = (d: string) => parse(d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

/**
 * Prazo processual com o marco correto (CPC e Lei 11.419/2006):
 *  • disponibilização no Diário: a publicação é o 1º dia útil seguinte e a contagem começa no dia útil depois dela (Lei 11.419, art. 4º, §§ 3º e 4º; CPC, art. 224, § 3º);
 *  • intimação eletrônica sem consulta: ciência tácita no 10º dia corrido após o envio (Lei 11.419, art. 5º, § 3º); se cair em dia sem expediente, vale o próximo dia útil;
 *  • prazo em dobro (Fazenda, Ministério Público, Defensoria e litisconsortes com advogados distintos: CPC, arts. 180, 183, 186 e 229).
 * É SUGESTÃO por regra geral: o advogado confere no ato (feriados locais, suspensões, regras do juízo).
 */
export function calcularPrazo(o: OpcoesPrazo): ResultadoPrazo {
  const feriados = o.feriados ?? new Set<string>();
  const regime = o.regime ?? 'uteis';
  const tipo = o.tipo ?? 'publicacao';
  const dias = Math.max(0, Math.floor(o.dias)) * (o.dobro ? 2 : 1);
  const passos: string[] = [];
  let publicacao: string | null = null;
  let ciencia: string | null = null;
  let referencia = o.marco;
  if (tipo === 'disponibilizacao') {
    passos.push(`Disponibilização: ${extenso(o.marco)}`);
    publicacao = proximoDiaUtil(o.marco, feriados);
    passos.push(`Publicação (1º dia útil seguinte): ${extenso(publicacao)}`);
    referencia = publicacao;
  } else if (tipo === 'envio_portal') {
    passos.push(`Envio da intimação: ${extenso(o.marco)}`);
    let c = somarDias(o.marco, 10);
    if (!diaUtil(c, feriados)) c = proximoDiaUtil(c, feriados);
    ciencia = c;
    passos.push(`Ciência tácita (10 dias corridos sem consulta): ${extenso(c)}`);
    referencia = c;
  } else {
    passos.push(`${tipo === 'publicacao' ? 'Publicação' : 'Ciência'}: ${extenso(o.marco)}`);
    if (tipo === 'ciencia') ciencia = o.marco;
    else publicacao = o.marco;
  }
  const inicio = regime === 'uteis' ? proximoDiaUtil(referencia, feriados) : somarDias(referencia, 1);
  passos.push(`Início da contagem: ${extenso(inicio)}`);
  passos.push(`Prazo: ${dias} dia${dias === 1 ? '' : 's'} ${regime === 'uteis' ? 'úteis' : 'corridos'}${o.dobro ? ' (em dobro)' : ''}`);
  const vencimento = calcularVencimento(referencia, dias, feriados, regime);
  passos.push(`Vencimento: ${extenso(vencimento)}`);
  return { vencimento, inicio, publicacao, ciencia, dias, passos };
}

// ---------------------------------------------------------------- prazo-padrão por tipo de justiça
/** Segmento da Justiça no número CNJ (1 = STF … 5 = Trabalho, 8 = Estadual …) ou null. */
export function segmentoDeCnj(numero: string): string | null {
  const d = (numero ?? '').replace(/\D/g, '');
  return d.length === 20 ? d[13] : null;
}
/**
 * Prazo-padrão sugerido conforme a Justiça: no CPC o recurso e a manifestação geral são de 15 dias úteis, mas na Justiça do Trabalho o
 * prazo recursal comum é de 8 dias (CLT, arts. 895 e 897). Sugerir 15 ali faria perder o prazo, então o padrão cai para 8.
 * Juizados Especiais (recurso inominado: 10 dias) não aparecem no número: a tela oferece o atalho.
 */
export function diasPadraoPorJustica(numero: string, base: number | null): number | null {
  if (base == null) return null;
  return segmentoDeCnj(numero) === '5' && base === 15 ? 8 : base;
}

// ---------------------------------------------------------------- tarefa criada a partir do andamento
export interface ProcessoResumo { id: string; numero: string; titulo?: string | null; cliente?: string | null; responsavel_id?: string | null }
export interface TarefaSugerida {
  tipo: 'tarefa'; titulo: string; descricao: string; prioridade: Prioridade; responsavel_id: string | null; processo_id: string; processo_numero: string; cliente: string | null;
}
/** Tarefa "analisar este andamento" para o responsável pelo processo (nunca decide o prazo: só o sugere, com aviso). */
export function tarefaDoMovimento(p: ProcessoResumo, m: MovimentoBruto, c: Classificacao, feriados: ReadonlySet<string> = new Set()): TarefaSugerida {
  const dia = m.dataHora.slice(0, 10);
  const linhas = [`${m.nome}${m.complemento ? ` — ${m.complemento}` : ''}`, `Processo ${p.numero}${p.cliente ? ` · ${p.cliente}` : ''}`, `Andamento de ${dia.split('-').reverse().join('/')}.`];
  const sug = diasPadraoPorJustica(p.numero, c.prazo_sugerido_dias);
  if (sug) {
    const v = calcularVencimento(dia, sug, feriados).split('-').reverse().join('/');
    linhas.push(`Prazo sugerido: ${sug} dias úteis a partir da publicação/ciência, vencendo em ${v}. Sugestão pela regra geral: confirme no ato e ajuste a data.`);
  }
  return {
    tipo: 'tarefa', titulo: `Analisar ${CATEGORIA_ROTULO[c.categoria].toLowerCase()} — ${p.titulo || p.numero}`.slice(0, 200), descricao: linhas.join('\n'),
    prioridade: c.prioridade, responsavel_id: p.responsavel_id ?? null, processo_id: p.id, processo_numero: p.numero, cliente: p.cliente ?? null,
  };
}
