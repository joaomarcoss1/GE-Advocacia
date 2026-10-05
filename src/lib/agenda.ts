import { isoParaBR } from './datetime';
import { AREA_ROTULO, TIPO_ROTULO } from './tarefas';
import type { Tarefa, TarefaFunc } from './types';

type Compromisso = Pick<Tarefa, 'id' | 'tipo' | 'titulo' | 'descricao' | 'inicio' | 'fim' | 'dia_inteiro' | 'local' | 'processo_numero' | 'cliente' | 'area' | 'prazo_fatal'>
  | Pick<TarefaFunc, 'id' | 'tipo' | 'titulo' | 'descricao' | 'inicio' | 'fim' | 'dia_inteiro' | 'local' | 'processo_numero' | 'cliente' | 'area' | 'prazo_fatal'>;

const compacto = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const soData = (iso: string) => isoParaBR(iso).data.replace(/-/g, '');
const diaSeguinte = (aaaammdd: string) => { const d = new Date(Date.UTC(+aaaammdd.slice(0, 4), +aaaammdd.slice(4, 6) - 1, +aaaammdd.slice(6, 8) + 1)); return d.toISOString().slice(0, 10).replace(/-/g, ''); };

/** Título que aparece na agenda: tipo + título; prazo fatal é destacado. */
export function tituloAgenda(t: Compromisso): string {
  const rot = t.prazo_fatal ? 'PRAZO FATAL' : TIPO_ROTULO[t.tipo];
  return `${rot}: ${t.titulo}`;
}
export function descricaoAgenda(t: Compromisso): string {
  const linhas = [
    t.processo_numero && `Processo: ${t.processo_numero}`,
    t.cliente && `Cliente: ${t.cliente}`,
    t.area && `Área: ${AREA_ROTULO[t.area]}`,
    t.descricao,
  ].filter(Boolean) as string[];
  return linhas.join('\n');
}

/** Intervalo no formato do Google/ICS: dia inteiro usa datas (fim exclusivo); com hora usa instantes UTC. */
function intervalo(t: Compromisso): { ini: string; fim: string; diaInteiro: boolean } | null {
  if (!t.inicio) return null;
  if (t.dia_inteiro) {
    const d = soData(t.inicio);
    const f = t.fim ? soData(t.fim) : d;
    return { ini: d, fim: diaSeguinte(f), diaInteiro: true };
  }
  const fim = t.fim ?? new Date(new Date(t.inicio).getTime() + 3_600_000).toISOString();
  return { ini: compacto(t.inicio), fim: compacto(fim), diaInteiro: false };
}

/** Link "Adicionar ao Google Agenda": funciona sem login no sistema e sem configurar nada (cada pessoa adiciona o seu). */
export function linkGoogleAgenda(t: Compromisso): string | null {
  const i = intervalo(t);
  if (!i) return null;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: tituloAgenda(t), dates: `${i.ini}/${i.fim}`, details: descricaoAgenda(t) });
  if (t.local) q.set('location', t.local);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
function dobrar(l: string): string {
  // linhas ICS têm no máximo 75 octetos; continua com espaço
  const out: string[] = []; let resto = l;
  while (new TextEncoder().encode(resto).length > 74) {
    let corte = 74; while (new TextEncoder().encode(resto.slice(0, corte)).length > 74) corte--;
    out.push(resto.slice(0, corte)); resto = ' ' + resto.slice(corte);
  }
  out.push(resto);
  return out.join('\r\n');
}

/** Arquivo .ics (Google Agenda, Outlook, Apple). `lembreteMin` cria o alarme. */
export function gerarIcs(itens: (Compromisso & { lembrete_min?: number })[], nomeEscritorio: string): string {
  const agora = compacto(new Date().toISOString());
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GE Advocacia//Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(nomeEscritorio)}`];
  for (const t of itens) {
    const i = intervalo(t);
    if (!i) continue;
    linhas.push('BEGIN:VEVENT', `UID:${t.id}@geadvocacia`, `DTSTAMP:${agora}`);
    if (i.diaInteiro) linhas.push(`DTSTART;VALUE=DATE:${i.ini}`, `DTEND;VALUE=DATE:${i.fim}`);
    else linhas.push(`DTSTART:${i.ini}`, `DTEND:${i.fim}`);
    linhas.push(`SUMMARY:${esc(tituloAgenda(t))}`);
    const d = descricaoAgenda(t); if (d) linhas.push(`DESCRIPTION:${esc(d)}`);
    if (t.local) linhas.push(`LOCATION:${esc(t.local)}`);
    if (t.lembrete_min != null) linhas.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(tituloAgenda(t))}`, `TRIGGER:-PT${t.lembrete_min}M`, 'END:VALARM');
    linhas.push('END:VEVENT');
  }
  linhas.push('END:VCALENDAR');
  return linhas.map(dobrar).join('\r\n') + '\r\n';
}

export function baixarIcs(itens: Parameters<typeof gerarIcs>[0], nomeEscritorio: string, arquivo = 'agenda.ics'): void {
  const blob = new Blob([gerarIcs(itens, nomeEscritorio)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = arquivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
