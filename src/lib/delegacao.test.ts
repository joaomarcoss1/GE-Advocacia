import { beforeEach, describe, expect, it } from 'vitest';
import { baixarIcs, descricaoAgenda, gerarIcs, linkGoogleAgenda, tituloAgenda } from './agenda';
import { digitoCnj, mascararCnj, montarCnj, normalizarCnj } from './cnj';
import { brParaIso, definirFuso } from './datetime';
import { atrasada, contar, resumoPrazo } from './tarefas';
import type { Tarefa } from './types';

const base: Tarefa = {
  id: 't1', tipo: 'prazo', titulo: 'Contestação', descricao: 'Pedir, juntar; "documentos"\nsegunda linha', prioridade: 'alta', status: 'a_fazer', area: 'civel',
  processo_numero: '0001234-77.2024.8.26.0001', cliente: 'Beta Ltda', inicio: null, fim: null, dia_inteiro: false, prazo_fatal: true, lembrete_min: 60, local: 'Fórum, sala 3',
  responsavel_id: null, revisor_id: null, participantes: [], processo_id: null, origem_movimento_id: null, criado_por: null, criado_por_nome: null, concluida_em: null, created_at: '', updated_at: '',
};
beforeEach(() => definirFuso('America/Fortaleza'));

describe('número CNJ', () => {
  it('valida o dígito verificador e aplica a máscara', () => {
    expect(montarCnj('1234', '2024', '826', '0001')).toBe('0001234-77.2024.8.26.0001');
    expect(normalizarCnj('00012347720248260001')).toBe('0001234-77.2024.8.26.0001');
    expect(normalizarCnj('0001234-78.2024.8.26.0001')).toBeNull();      // dígito errado
    expect(normalizarCnj('123')).toBeNull();
    expect(normalizarCnj(null)).toBeNull();
    expect(digitoCnj('1234', '2024', '826', '1')).toBe('77');
  });
  it('máscara progressiva durante a digitação', () => {
    expect(mascararCnj('0001234')).toBe('0001234');
    expect(mascararCnj('000123477')).toBe('0001234-77');
    expect(mascararCnj('00012347720248260001999')).toBe('0001234-77.2024.8.26.0001');
  });
});

describe('Google Agenda e .ics', () => {
  it('link do Google com título, datas em UTC, local e detalhes', () => {
    const t = { ...base, inicio: brParaIso('2026-10-07', '14:00'), fim: brParaIso('2026-10-07', '15:30') };
    const u = new URL(linkGoogleAgenda(t)!);
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('text')).toBe('PRAZO FATAL: Contestação');
    expect(u.searchParams.get('dates')).toBe('20261007T170000Z/20261007T183000Z');     // Fortaleza = UTC−3
    expect(u.searchParams.get('location')).toBe('Fórum, sala 3');
    expect(u.searchParams.get('details')).toContain('Processo: 0001234-77.2024.8.26.0001');
  });
  it('dia inteiro usa datas e o término é exclusivo (dia seguinte)', () => {
    const t = { ...base, dia_inteiro: true, inicio: brParaIso('2026-10-07', '00:00'), fim: brParaIso('2026-10-08', '00:00') };
    expect(new URL(linkGoogleAgenda(t)!).searchParams.get('dates')).toBe('20261007/20261009');
  });
  it('sem data não há link', () => { expect(linkGoogleAgenda(base)).toBeNull(); });
  it('título e descrição', () => {
    expect(tituloAgenda({ ...base, prazo_fatal: false, tipo: 'audiencia' })).toBe('Audiência: Contestação');
    expect(descricaoAgenda(base)).toContain('Cliente: Beta Ltda');
  });
  it('arquivo .ics: eventos, escape, alarme e linhas dobradas em 75 octetos', () => {
    const longo = { ...base, titulo: 'Título muito longo '.repeat(8), inicio: brParaIso('2026-10-07', '14:00'), fim: brParaIso('2026-10-07', '15:00') };
    const ics = gerarIcs([longo, { ...base, id: 't2', dia_inteiro: true, inicio: brParaIso('2026-10-09', '00:00'), fim: brParaIso('2026-10-09', '00:00') }, { ...base, id: 't3' }], 'Silva & Ribeiro');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);                       // o compromisso sem data fica de fora
    expect(ics).toContain('DTSTART:20261007T170000Z');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261009');
    expect(ics).toContain('DTEND;VALUE=DATE:20261010');
    expect(ics.replace(/\r\n /g, '')).toContain('Pedir\\, juntar\\; "documentos"\\nsegunda linha');
    expect(ics).toContain('UID:t1@geadvocacia');
    for (const linha of ics.split('\r\n')) expect(new TextEncoder().encode(linha).length).toBeLessThanOrEqual(75);
  });
  it('alarme só quando há lembrete', () => {
    const t = { ...base, lembrete_min: 15, inicio: brParaIso('2026-10-07', '14:00'), fim: brParaIso('2026-10-07', '15:00') };
    expect(gerarIcs([t], 'X')).toContain('TRIGGER:-PT15M');
    expect(typeof baixarIcs).toBe('function');
  });
});

describe('prazos', () => {
  const hoje = new Date();
  const dias = (n: number) => new Date(hoje.getTime() + n * 86_400_000).toISOString();
  it('atrasada, resumo e contagens', () => {
    const passado = { ...base, dia_inteiro: false, inicio: dias(-2), fim: dias(-2) };
    const futuro = { ...base, id: 't2', inicio: dias(3), fim: dias(3) };
    const feita = { ...passado, id: 't3', status: 'concluida' as const };
    expect(atrasada(passado)).toBe(true);
    expect(atrasada(futuro)).toBe(false);
    expect(atrasada(feita)).toBe(false);                                      // concluída nunca está atrasada
    expect(resumoPrazo(feita)).toBe('');
    expect(resumoPrazo(futuro)).toMatch(/^Em \d dias$/);
    const c = contar([passado, futuro, feita]);
    expect(c).toMatchObject({ abertas: 2, atrasadas: 1 });
  });
});
