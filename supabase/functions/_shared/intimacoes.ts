// Intimações do DJEN (Diário de Justiça Eletrônico Nacional, CNJ): leitura da API pública de comunicações, por OAB.
// Módulo puro (sem rede e sem Deno): a Edge Function e o app usam o mesmo código, e os testes rodam no vitest.
// A API só responde a partir do Brasil (CloudFront bloqueia o exterior): a função é chamada na região sa-east-1 (São Paulo).
import type { RegimePrazo } from './processos.ts';

export const DJEN_BASE = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';

export interface OabBusca { numero: string; uf: string }
/** Lê "OAB/MA 12.345", "12345 MA", "MA-12345", "OAB MA nº 12345-A"... Sem número ou sem UF válida, devolve null. */
export function parseOab(texto: string | null | undefined): OabBusca | null {
  const t = (texto ?? '').toUpperCase();
  const uf = t.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)?.[1];
  const n = t.replace(/OAB/g, ' ').match(/\d[\d.]*/)?.[0]?.replace(/\./g, '');
  if (!uf || !n || n.length > 7) return null;
  return { numero: String(Number(n)), uf };
}

/** Número CNJ em 20 dígitos → NNNNNNN-DD.AAAA.J.TR.OOOO (o formato guardado no cadastro de processos). */
export function mascararCnj(v: string | null | undefined): string | null {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length === 20 ? `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d[13]}.${d.slice(14, 16)}.${d.slice(16)}` : null;
}

export interface ParamsDjen { oab?: OabBusca; sigla?: string; inicio: string; fim: string; pagina?: number; porPagina?: 5 | 100 }
export function urlDjen(p: ParamsDjen): string {
  const q = new URLSearchParams();
  if (p.oab) { q.set('numeroOab', p.oab.numero); q.set('ufOab', p.oab.uf); }
  if (p.sigla) q.set('siglaTribunal', p.sigla.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12));
  q.set('dataDisponibilizacaoInicio', p.inicio); q.set('dataDisponibilizacaoFim', p.fim);
  q.set('itensPorPagina', String(p.porPagina ?? 100)); q.set('pagina', String(p.pagina ?? 1));
  return `${DJEN_BASE}?${q.toString()}`;
}

export interface IntimacaoLinha {
  djen_id: number; hash: string | null; tribunal: string; tipo_comunicacao: string; tipo_documento: string | null; orgao: string | null; classe: string | null;
  numero_processo: string | null; texto: string; link: string | null; data_disponibilizacao: string; meio: string | null; cancelada: boolean;
  destinatarios: { nome: string; polo: string | null }[]; advogados: { nome: string; oab: string | null; uf: string | null }[];
}
const txt = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
/** Tira marcação HTML do texto da comunicação, preservando parágrafos. */
export const limparTexto = (s: string) => s.replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
function dataIso(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/) ?? null;
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const b = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return b ? `${b[3]}-${b[2]}-${b[1]}` : null;
}
/** Converte um item bruto da API na nossa linha. Item sem identificador, tribunal ou data é descartado (null). */
export function lerComunicacao(it: unknown): IntimacaoLinha | null {
  if (!it || typeof it !== 'object') return null;
  const o = it as Record<string, unknown>;
  const id = typeof o.id === 'number' ? o.id : Number(o.id);
  const data = dataIso(o.data_disponibilizacao ?? o.datadisponibilizacao);
  const tribunal = txt(o.siglaTribunal, 20);
  if (!Number.isFinite(id) || id <= 0 || !data || !tribunal) return null;
  const dest = Array.isArray(o.destinatarios) ? o.destinatarios : [];
  const advs = Array.isArray(o.destinatarioadvogados) ? o.destinatarioadvogados : [];
  return {
    djen_id: id, hash: txt(o.hash, 80), tribunal, tipo_comunicacao: txt(o.tipoComunicacao, 80) ?? 'Comunicação', tipo_documento: txt(o.tipoDocumento, 120),
    orgao: txt(o.nomeOrgao, 300), classe: txt(o.nomeClasse, 300), numero_processo: mascararCnj(String(o.numeroprocessocommascara ?? o.numero_processo ?? '')) ?? txt(o.numeroprocessocommascara ?? o.numero_processo, 40),
    texto: limparTexto(typeof o.texto === 'string' ? o.texto : '').slice(0, 20000), link: txt(o.link, 500), data_disponibilizacao: data, meio: txt(o.meiocompleto ?? o.meio, 80),
    cancelada: o.ativo === false || !!txt(o.data_cancelamento, 40),
    destinatarios: dest.map(d => d as Record<string, unknown>).filter(d => txt(d.nome, 200)).slice(0, 30).map(d => ({ nome: txt(d.nome, 200)!, polo: txt(d.polo, 10) })),
    advogados: advs.map(a => ((a as Record<string, unknown>).advogado ?? a) as Record<string, unknown>).filter(a => txt(a.nome, 200)).slice(0, 30)
      .map(a => ({ nome: txt(a.nome, 200)!, oab: a.numero_oab != null ? String(a.numero_oab).slice(0, 12) : null, uf: txt(a.uf_oab, 2) })),
  };
}

/** Prazo escrito no texto da intimação ("no prazo de 15 (quinze) dias", "em 5 dias úteis"). Nunca inventa: sem menção clara, devolve null. */
export function prazoNoTexto(texto: string): { dias: number; regime: RegimePrazo } | null {
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const m = t.match(/(?:prazo(?: comum| legal| improrrogavel)?(?: de| para)?|no prazo de|em ate|dentro de|em)\s+(\d{1,3})\s*(?:\([^)]{1,40}\)\s*)?(?:\(?\w+\)?\s+)?dias?(\s+uteis|\s+corridos)?/);
  if (!m) return null;
  const dias = Number(m[1]);
  if (!dias || dias > 180) return null;
  return { dias, regime: m[2]?.includes('corridos') ? 'corridos' : 'uteis' };
}

/** A comunicação exige providência do advogado? (intimação, citação, notificação, vista, publicação de decisão…). Listas e editais genéricos, não. */
export function exigeProvidencia(tipo: string, texto: string): boolean {
  const t = `${tipo} ${texto.slice(0, 400)}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/lista de distribuicao|pauta de julgamento|edital de cita/.test(t) && !/intim/.test(tipo.toLowerCase())) return /cita/.test(t);
  return /intima|citac|notifica|vista|prazo|manifest|apresentar|cumpra|audiencia|pericia|sentenca|decisao|despacho/.test(t);
}
