import { agoraBR, brParaIso, isoParaBR } from './datetime';
import type { AreaJuridica, PrioridadeTarefa, StatusTarefa, Tarefa, TipoTarefa } from './types';

export const TIPOS: { id: TipoTarefa; rotulo: string; agenda: boolean }[] = [
  { id: 'tarefa', rotulo: 'Tarefa', agenda: false },
  { id: 'prazo', rotulo: 'Prazo processual', agenda: true },
  { id: 'audiencia', rotulo: 'Audiência', agenda: true },
  { id: 'reuniao', rotulo: 'Reunião', agenda: true },
  { id: 'diligencia', rotulo: 'Diligência', agenda: true },
  { id: 'protocolo', rotulo: 'Protocolo', agenda: true },
  { id: 'atendimento', rotulo: 'Atendimento ao cliente', agenda: true },
];
export const TIPO_ROTULO = Object.fromEntries(TIPOS.map(t => [t.id, t.rotulo])) as Record<TipoTarefa, string>;

export const STATUS: { id: StatusTarefa; rotulo: string }[] = [
  { id: 'a_fazer', rotulo: 'A fazer' },
  { id: 'em_andamento', rotulo: 'Em andamento' },
  { id: 'em_revisao', rotulo: 'Em revisão' },
  { id: 'concluida', rotulo: 'Concluída' },
  { id: 'cancelada', rotulo: 'Cancelada' },
];
export const STATUS_ROTULO = Object.fromEntries(STATUS.map(s => [s.id, s.rotulo])) as Record<StatusTarefa, string>;

export const PRIORIDADES: { id: PrioridadeTarefa; rotulo: string }[] = [
  { id: 'baixa', rotulo: 'Baixa' }, { id: 'normal', rotulo: 'Normal' }, { id: 'alta', rotulo: 'Alta' }, { id: 'urgente', rotulo: 'Urgente' },
];
export const PRIORIDADE_ROTULO = Object.fromEntries(PRIORIDADES.map(p => [p.id, p.rotulo])) as Record<PrioridadeTarefa, string>;

export const AREAS: { id: AreaJuridica; rotulo: string }[] = [
  { id: 'civel', rotulo: 'Cível' }, { id: 'trabalhista', rotulo: 'Trabalhista' }, { id: 'tributario', rotulo: 'Tributário' },
  { id: 'criminal', rotulo: 'Criminal' }, { id: 'familia', rotulo: 'Família e sucessões' }, { id: 'empresarial', rotulo: 'Empresarial' },
  { id: 'previdenciario', rotulo: 'Previdenciário' }, { id: 'administrativo', rotulo: 'Administrativo' }, { id: 'outro', rotulo: 'Outra' },
];
export const AREA_ROTULO = Object.fromEntries(AREAS.map(a => [a.id, a.rotulo])) as Record<AreaJuridica, string>;

export const LEMBRETES: { min: number; rotulo: string }[] = [
  { min: 0, rotulo: 'No horário' }, { min: 15, rotulo: '15 minutos antes' }, { min: 60, rotulo: '1 hora antes' },
  { min: 1440, rotulo: '1 dia antes' }, { min: 4320, rotulo: '3 dias antes' }, { min: 10080, rotulo: '1 semana antes' },
];

export const ABERTA = (s: StatusTarefa) => s !== 'concluida' && s !== 'cancelada';
export const temAgenda = (t: Pick<Tarefa, 'tipo' | 'inicio'>) => !!t.inicio && (t.tipo !== 'tarefa' || !!t.inicio);

/** Data (YYYY-MM-DD) do compromisso no fuso do escritório já definido em `definirFuso`. */
export const diaDe = (t: Pick<Tarefa, 'inicio'>): string | null => (t.inicio ? isoParaBR(t.inicio).data : null);

/** Passou do prazo e ainda não foi concluída/cancelada? Dia inteiro vale até o fim do dia. */
export function atrasada(t: Tarefa, agora = new Date()): boolean {
  if (!ABERTA(t.status) || !t.inicio) return false;
  if (t.dia_inteiro) return (diaDe(t) as string) < agoraBR().data;
  return new Date(t.fim ?? t.inicio).getTime() < agora.getTime();
}

/** Dias até o compromisso (negativo = já passou). */
export function diasAte(t: Tarefa): number | null {
  const d = diaDe(t);
  if (!d) return null;
  return Math.round((Date.parse(d) - Date.parse(agoraBR().data)) / 86_400_000);
}

export function resumoPrazo(t: Tarefa): string {
  const n = diasAte(t);
  if (n === null) return 'Sem data';
  if (!ABERTA(t.status)) return '';
  if (n < 0) return `Atrasada há ${-n} dia${-n > 1 ? 's' : ''}`;
  if (n === 0) return 'Hoje';
  if (n === 1) return 'Amanhã';
  return `Em ${n} dias`;
}

/** Monta o ISO do instante a partir de data e hora locais do escritório. */
export function instante(data: string, hhmm: string): string { return brParaIso(data, hhmm); }

export interface Contagens { abertas: number; atrasadas: number; hoje: number; semana: number }
export function contar(ts: Tarefa[]): Contagens {
  const hoje = agoraBR().data;
  const abertas = ts.filter(t => ABERTA(t.status));
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter(t => atrasada(t)).length,
    hoje: abertas.filter(t => diaDe(t) === hoje).length,
    semana: abertas.filter(t => { const n = diasAte(t); return n !== null && n >= 0 && n <= 7; }).length,
  };
}
