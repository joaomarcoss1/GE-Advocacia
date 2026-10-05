/**
 * Todas as datas de negócio são strings 'YYYY-MM-DD'; horas são 'HH:MM'.
 * Cada escritório tem o seu fuso (campo `fuso` do escritório). O padrão é America/Fortaleza (UTC-3, sem horário de verão);
 * ao entrar num escritório o app chama `definirFuso`. Nada aqui assume um fuso fixo além do padrão.
 */
let FUSO = 'America/Fortaleza';
const fmtCache = new Map<string, Intl.DateTimeFormat>();
export function definirFuso(iana: string | null | undefined): void {
  const f = iana || 'America/Fortaleza';
  try { new Intl.DateTimeFormat('en-US', { timeZone: f }); FUSO = f; } catch { FUSO = 'America/Fortaleza'; }
}
export const fusoAtual = () => FUSO;
/** Fusos brasileiros oferecidos no cadastro do escritório. */
export const FUSOS_BR: { id: string; rotulo: string }[] = [
  { id: 'America/Fortaleza', rotulo: 'Brasília sem horário de verão · AL, BA, CE, MA, PB, PE, PI, RN, SE, TO, PA, AP' },
  { id: 'America/Sao_Paulo', rotulo: 'Brasília · SP, RJ, MG, ES, PR, SC, RS, DF, GO' },
  { id: 'America/Cuiaba', rotulo: 'Mato Grosso (UTC−4)' },
  { id: 'America/Campo_Grande', rotulo: 'Mato Grosso do Sul (UTC−4)' },
  { id: 'America/Manaus', rotulo: 'Amazonas, Rondônia, Roraima (UTC−4)' },
  { id: 'America/Rio_Branco', rotulo: 'Acre (UTC−5)' },
  { id: 'America/Noronha', rotulo: 'Fernando de Noronha (UTC−2)' },
];
/** Deslocamento do fuso (em minutos, negativo a oeste de Greenwich) no instante `ms`. */
function offsetMin(ms: number): number {
  let f = fmtCache.get(FUSO);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); fmtCache.set(FUSO, f); }
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}
const pad = (n: number) => String(n).padStart(2, '0');

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
export function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}
export function diaSemana(s: string): number {
  return parseISO(s).getUTCDay();
}
export function eachDay(ini: string, fim: string): string[] {
  const out: string[] = [];
  for (let d = ini; d <= fim; d = addDays(d, 1)) out.push(d);
  return out;
}
export function ultimoDiaDoMes(ano: number, mes1a12: number): number {
  return new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();
}
export function mesRange(ano: number, mes1a12: number): { inicio: string; fim: string } {
  return { inicio: `${ano}-${pad(mes1a12)}-01`, fim: `${ano}-${pad(mes1a12)}-${pad(ultimoDiaDoMes(ano, mes1a12))}` };
}
export function primeiroDoMes(s: string): string { return s.slice(0, 8) + '01'; }
export function ultimoDoMes(s: string): string {
  const [y, m] = s.split('-').map(Number);
  return mesRange(y, m).fim;
}

export function hhmmParaMin(h: string): number {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
}
export function minParaHhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export interface AgoraBR { data: string; hhmm: string; minutos: number; iso: string }
export function isoParaBR(iso: string): AgoraBR {
  const ms = new Date(iso).getTime();
  const t = new Date(ms + offsetMin(ms) * 60_000);
  const s = t.toISOString();
  const hhmm = s.slice(11, 16);
  return { data: s.slice(0, 10), hhmm, minutos: hhmmParaMin(hhmm), iso };
}
export function agoraBR(): AgoraBR {
  return isoParaBR(new Date().toISOString());
}
/** Converte data + hora locais do escritório em instante ISO/UTC. */
export function brParaIso(data: string, hhmm: string): string {
  const [y, m, d] = data.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const local = Date.UTC(y, m - 1, d, h, mi);
  let ms = local - offsetMin(local) * 60_000;
  ms = local - offsetMin(ms) * 60_000;          // segunda passada: correta mesmo perto de mudanças de offset
  return new Date(ms).toISOString();
}

/** Data (AAAA-MM-DD) de hoje no fuso do escritório, deslocada em `dias`. */
export const hojeMais = (dias: number): string => addDays(agoraBR().data, dias);

/** Data por extenso, no fuso do escritório. */
export function dataExtensa(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: FUSO });
}

export function fmtData(s: string | null | undefined): string {
  if (!s) return '—';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function fmtDataCurta(s: string): string {
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
}
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function nomeMes(s: string): string {
  const [y, m] = s.split('-').map(Number);
  return `${MESES[m - 1]} de ${y}`;
}
