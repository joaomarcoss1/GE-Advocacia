import { describe, expect, it } from 'vitest';
import { ErroNegocio, traduzirErroBanco } from './erros';
import { periodoFechado, temAnaliseCom, temHistorico, validarMudancaFolha } from './regras';
import { SLUG_REGEX, slugDe } from './slug';
import { addDays, brParaIso, definirFuso, isoParaBR } from './datetime';
import type { Folha } from './types';

const folha = (o: Partial<Folha> = {}): Folha => ({
  id: 'x', funcionario_id: 'f1', periodo_inicio: '2026-05-01', periodo_fim: '2026-05-31', salario_mensal: 2000, valor_diaria: 80, dias_previstos: 25,
  dias_trabalhados: 25, dias_abonados: 0, faltas: 0, atrasos: 0, saidas_antecipadas: 0, minutos_atraso: 0, dias_extras: 0, pendencias: 0, horas_extras: 0,
  valor_bruto: 2000, desconto_faltas: 0, desconto_atrasos: 0, adicionais: 0, descontos: 0, valor_final: 2000, status: 'fechada', detalhe: [], observacoes: null,
  created_at: '', updated_at: '', ...o,
});
const ctx = (admin = true) => ({ admin, ocorrencias: [], registros: [] });

describe('período fechado', () => {
  const fs = [folha(), folha({ id: 'y', periodo_inicio: '2026-04-01', periodo_fim: '2026-04-30', status: 'aberta' })];
  it('data dentro de folha fechada/paga é congelada; aberta não', () => {
    expect(periodoFechado(fs, 'f1', '2026-05-10')).toBe(true);
    expect(periodoFechado(fs, 'f1', '2026-04-10')).toBe(false);
    expect(periodoFechado(fs, 'f2', '2026-05-10')).toBe(false);
    expect(periodoFechado([folha({ status: 'paga' })], 'f1', '2026-05-31')).toBe(true);
  });
  it('intervalo que apenas encosta no período também é recusado', () => {
    expect(periodoFechado(fs, 'f1', '2026-04-29', '2026-05-02')).toBe(true);
    expect(periodoFechado(fs, 'f1', '2026-06-01', '2026-06-03')).toBe(false);
  });
});

describe('histórico do funcionário', () => {
  const vazio = { registros: [], ocorrencias: [], ajustes: [], ajustesDia: [], folhas: [] };
  it('sem nada = sem histórico', () => expect(temHistorico('f1', vazio)).toBe(false));
  it('qualquer tabela conta', () => {
    expect(temHistorico('f1', { ...vazio, registros: [{ funcionario_id: 'f1' }] })).toBe(true);
    expect(temHistorico('f1', { ...vazio, folhas: [{ funcionario_id: 'f1' }] })).toBe(true);
    expect(temHistorico('f1', { ...vazio, anexos: [{ funcionario_id: 'f1' }] })).toBe(true);
    expect(temHistorico('f1', { ...vazio, ajustes: [{ funcionario_id: 'f2' }] })).toBe(false);
  });
});

describe('regras da folha', () => {
  it('não fecha com atestado em análise', () => {
    const pend = [{ funcionario_id: 'f1', status_analise: 'pendente' as const, data_inicio: '2026-05-10', data_fim: '2026-05-10' }];
    expect(temAnaliseCom('f1', '2026-05-01', '2026-05-31', pend, [])).toBe(true);
    expect(() => validarMudancaFolha(folha({ status: 'aberta' }), folha(), { admin: true, ocorrencias: pend as never, registros: [] })).toThrow(ErroNegocio);
  });
  it('fechada: só o status muda', () => {
    expect(() => validarMudancaFolha(folha(), folha({ valor_final: 1 }), ctx())).toThrow(/congelados/);
    expect(() => validarMudancaFolha(folha(), folha({ status: 'paga' }), ctx())).not.toThrow();
  });
  it('reabrir exige administrador e motivo novo com 5+ caracteres', () => {
    expect(() => validarMudancaFolha(folha(), folha({ status: 'aberta' }), ctx())).toThrow(/motivo/);
    expect(() => validarMudancaFolha(folha(), folha({ status: 'aberta', motivo_reabertura: 'ok' }), ctx())).toThrow(/motivo/);
    expect(() => validarMudancaFolha(folha(), folha({ status: 'aberta', motivo_reabertura: 'Atestado entregue depois' }), ctx(false))).toThrow(/administrador/);
    expect(() => validarMudancaFolha(folha(), folha({ status: 'aberta', motivo_reabertura: 'Atestado entregue depois' }), ctx())).not.toThrow();
  });
  it('folha aberta é livre', () => expect(() => validarMudancaFolha(folha({ status: 'aberta' }), folha({ status: 'aberta', valor_final: 5 }), ctx())).not.toThrow());
});

describe('mensagens de erro centralizadas', () => {
  it('traduz códigos do banco', () => {
    expect(traduzirErroBanco('FUNCIONARIO_COM_HISTORICO')).toMatch(/Desligar/);
    expect(traduzirErroBanco('ERROR: PERIODO_FECHADO')).toMatch(/fechado/);
    expect(traduzirErroBanco('new row violates row-level security policy')).toMatch(/permissão/);
    expect(traduzirErroBanco('duplicate key value violates unique constraint "registros_ponto_unico_idx"')).toMatch(/já foi registrada/);
    expect(traduzirErroBanco('algo desconhecido')).toBe('algo desconhecido');
  });
});

describe('slug do escritório', () => {
  it('gera endereço limpo a partir do nome', () => {
    expect(slugDe('Silva & Ribeiro Advogados')).toBe('silva-e-ribeiro-advogados');
    expect(slugDe('  Ávila  Ç  ')).toBe('avila-c');
    expect(SLUG_REGEX.test(slugDe('Monteiro Costa Advocacia'))).toBe(true);
  });
  it('valida tamanho e caracteres', () => {
    for (const ruim of ['ab', '-abc', 'abc-', 'Abc', 'a b c', 'a'.repeat(41)]) expect(SLUG_REGEX.test(ruim)).toBe(false);
    expect(SLUG_REGEX.test('abc')).toBe(true);
  });
});

describe('fuso horário', () => {
  it('converte instante <-> hora local de cada escritório', () => {
    definirFuso('America/Fortaleza');
    expect(isoParaBR('2026-06-10T11:00:00Z').hhmm).toBe('08:00');
    expect(brParaIso('2026-06-10', '08:00')).toBe('2026-06-10T11:00:00.000Z');
    definirFuso('America/Manaus');
    expect(isoParaBR('2026-06-10T12:00:00Z').hhmm).toBe('08:00');
    expect(brParaIso('2026-06-10', '08:00')).toBe('2026-06-10T12:00:00.000Z');
    definirFuso('America/Rio_Branco');
    expect(brParaIso('2026-06-10', '08:00')).toBe('2026-06-10T13:00:00.000Z');
    definirFuso('Fuso/Invalido');                                  // inválido volta ao padrão
    expect(brParaIso('2026-06-10', '08:00')).toBe('2026-06-10T11:00:00.000Z');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

import { distanciaMetros, horasSemanais, minutosJornada, proximoTipo, sequenciaDoDia, temIntervalo } from './ponto';
import { impactoAtraso, impactoOcorrencia, proximoDiaDeTrabalho } from './folha';
import { gerarPin, gerarSenha, pinFraco, validarPin, validarSenha } from './seguranca';
import type { Escala, TurnoDia } from './types';

const t = (e: string, si: string, ri: string, s: string): TurnoDia => ({ ativo: true, entrada: e, saida_intervalo: si, retorno_intervalo: ri, saida: s });
const escala: Escala = { id: 'e', nome: 'x', ativo: true, dias: { 1: t('08:00', '12:00', '14:00', '18:00'), 2: t('08:00', '', '', '14:00'), 3: { ...t('', '', '', ''), ativo: false }, 4: t('08:00', '', '', '14:00'), 5: t('08:00', '', '', '14:00'), 6: t('08:00', '', '', '12:00') } };

describe('ponto: utilidades', () => {
  it('jornada e horas semanais', () => {
    expect(minutosJornada(escala.dias[1])).toBe(480);
    expect(minutosJornada(null)).toBe(0);
    expect(horasSemanais(escala)).toBe(8 + 6 + 6 + 6 + 4);
    expect(temIntervalo(escala.dias[1])).toBe(true);
    expect(sequenciaDoDia(escala.dias[2])).toEqual(['entrada', 'saida']);
    expect(sequenciaDoDia(null)).toEqual(['entrada', 'saida']);
  });
  it('próxima marcação ignora rejeitadas', () => {
    expect(proximoTipo([{ tipo: 'entrada', status_aprovacao: 'aprovado' }], escala.dias[1])).toBe('saida_intervalo');
    expect(proximoTipo([{ tipo: 'entrada', status_aprovacao: 'rejeitado' }], escala.dias[1])).toBe('entrada');
    expect(proximoTipo(sequenciaDoDia(escala.dias[2]).map(tipo => ({ tipo, status_aprovacao: 'aprovado' as const })), escala.dias[2])).toBeNull();
  });
  it('distância entre coordenadas', () => {
    expect(Math.round(distanciaMetros(-4.4608, -43.8881, -4.4608, -43.8881))).toBe(0);
    const d = distanciaMetros(-4.4608, -43.8881, -4.4608, -43.8791);
    expect(d).toBeGreaterThan(950); expect(d).toBeLessThan(1050);
  });
});

describe('folha: utilidades', () => {
  const func = { id: 'f', salario_mensal: 2600, data_admissao: '2020-01-01', data_desligamento: null, diaria_fixa: null } as never;
  it('impacto de uma ocorrência e de um atraso', () => {
    const i = impactoOcorrencia(func, escala, [], { data_inicio: '2026-06-01', data_fim: '2026-06-03' });
    expect(i.dias).toBe(2);                    // seg e ter (quarta é dia inativo)
    expect(i.valor).toBeGreaterThan(0);
    const a = impactoAtraso(func, escala, [], { data: '2026-06-01', diferenca_minutos: 60 });
    expect(a.minutos).toBe(60); expect(a.valor).toBeGreaterThan(0);
  });
  it('próximo dia de trabalho pula folgas e feriados', () => {
    expect(proximoDiaDeTrabalho(escala, new Set(['2026-06-02']), '2026-06-01')).toBe('2026-06-04');
    expect(proximoDiaDeTrabalho(null, new Set(), '2026-06-01')).toBeNull();
  });
});

describe('segurança: PIN e senha', () => {
  it('recusa PIN fraco ou fora do formato', () => {
    for (const p of ['111111', '123456', '654321', '121212', '123123', '12345']) expect(validarPin(p)).not.toBe('');
    expect(pinFraco('482913')).toBe(false);
    expect(validarPin('482913')).toBe('');
  });
  it('gera PIN e senha válidos', () => {
    expect(validarPin(gerarPin(7))).toBe('');
    expect(validarSenha(gerarSenha())).toBe('');
    expect(validarSenha('curta1')).toMatch(/10/);
    expect(validarSenha('somenteletrasaqui')).toMatch(/números/);
  });
});

import { limpar } from './monitor';
describe('monitor.limpar', () => {
  it('remove CPF, e-mail e chaves sensíveis antes do envio', () => {
    const r = limpar({ msg: 'erro com 123.456.789-09 e ana@x.com.br', pin: '123456', aninhado: { senha: 'x', ok: 'visível' } });
    expect(r.msg).toBe('erro com [cpf] e [email]');
    expect(r.pin).toBe('[removido]');
    expect(r.aninhado.senha).toBe('[removido]');
    expect(r.aninhado.ok).toBe('visível');
  });
});
