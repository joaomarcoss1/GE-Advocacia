import { describe, expect, it } from 'vitest';
import { montarCnj } from './cnj';
import {
  calcularVencimento, chaveMovimento, classificarMovimento, corpoConsultaDatajud, dataDatajud, diaUtil, emRecesso, lerRespostaDatajud, tarefaDoMovimento, tribunalDeCnj, urlDatajud,
} from './processos';

describe('tribunal pelo número CNJ', () => {
  const casos: [string, string][] = [
    [montarCnj('1234', '2024', '826', '1'), 'tjsp'], [montarCnj('1234', '2024', '810', '1'), 'tjma'], [montarCnj('1234', '2024', '807', '1'), 'tjdft'],
    [montarCnj('1234', '2024', '502', '1'), 'trt2'], [montarCnj('1234', '2024', '524', '1'), 'trt24'], [montarCnj('1234', '2024', '500', '1'), 'tst'],
    [montarCnj('1234', '2024', '401', '1'), 'trf1'], [montarCnj('1234', '2024', '406', '1'), 'trf6'], [montarCnj('1234', '2024', '300', '1'), 'stj'],
    [montarCnj('1234', '2024', '626', '1'), 'tre-sp'], [montarCnj('1234', '2024', '926', '1'), 'tjmsp'], [montarCnj('1234', '2024', '821', '1'), 'tjrs'],
  ];
  it.each(casos)('%s → %s', (numero, alias) => { expect(tribunalDeCnj(numero)?.alias).toBe(alias); });
  it('STF, CNJ, números curtos e tribunais inexistentes não são consultáveis', () => {
    expect(tribunalDeCnj(montarCnj('1234', '2024', '100', '1'))).toBeNull();
    expect(tribunalDeCnj(montarCnj('1234', '2024', '200', '1'))).toBeNull();
    expect(tribunalDeCnj(montarCnj('1234', '2024', '899', '1'))).toBeNull();
    expect(tribunalDeCnj('123')).toBeNull();
  });
  it('endereço e corpo da consulta do DataJud', () => {
    expect(urlDatajud('tjsp')).toBe('https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search');
    expect(corpoConsultaDatajud('0001234-77.2024.8.26.0001').query.match.numeroProcesso).toBe('00012347720248260001');
  });
});

describe('classificação dos andamentos', () => {
  const casos: [string, string | null, string, boolean, number | null][] = [
    ['Sentença', null, 'sentenca', true, 15], ['Julgado procedente em parte o pedido', null, 'sentenca', true, 15], ['Extinto o processo', null, 'sentenca', true, 15],
    ['Citação', null, 'citacao', true, 15], ['Mandado de citação cumprido', null, 'citacao', true, 15],
    ['Audiência de instrução designada', null, 'audiencia', true, null], ['Audiência realizada', null, 'audiencia', false, null], ['Ata de audiência', null, 'audiencia', false, null],
    ['Expedição de documento', 'Tipo: Intimação', 'intimacao', true, 15], ['Publicação', null, 'intimacao', true, 15], ['Disponibilizado no Diário da Justiça', null, 'intimacao', true, 15],
    ['Decisão interlocutória', null, 'decisao', true, 15], ['Concedida a tutela de urgência', null, 'decisao', true, 15], ['Indeferida a liminar', null, 'decisao', true, 15],
    ['Despacho', null, 'despacho', true, 5], ['Determinada a emenda da inicial', null, 'despacho', true, 5],
    ['Trânsito em julgado', null, 'transito', true, null], ['Arquivamento definitivo', null, 'arquivamento', true, null], ['Baixa definitiva', null, 'arquivamento', true, null],
    ['Interposto recurso de apelação', null, 'recurso', false, null], ['Juntada de petição', null, 'juntada', false, null], ['Conclusão ao juiz', null, 'conclusao', false, null],
    ['Distribuição', null, 'distribuicao', false, null], ['Recebimento', null, 'distribuicao', false, null], ['Movimentação qualquer', null, 'outros', false, null],
  ];
  it.each(casos)('%s (%s) → %s', (nome, compl, categoria, acao, prazo) => {
    const c = classificarMovimento({ nome, complemento: compl });
    expect(c.categoria).toBe(categoria);
    expect(c.exige_acao).toBe(acao);
    expect(c.prazo_sugerido_dias).toBe(prazo);
  });
  it('prioridade: o que tem prazo ou decisão é alta; rotina é baixa', () => {
    expect(classificarMovimento({ nome: 'Sentença' }).prioridade).toBe('alta');
    expect(classificarMovimento({ nome: 'Despacho' }).prioridade).toBe('normal');
    expect(classificarMovimento({ nome: 'Juntada' }).prioridade).toBe('baixa');
  });
  it('acento e caixa não importam', () => { expect(classificarMovimento({ nome: 'SENTENÇA' }).categoria).toBe('sentenca'); });
});

describe('resposta do DataJud', () => {
  const resp = {
    hits: { hits: [
      { _source: { numeroProcesso: '00012347720248260001', classe: { codigo: 7, nome: 'Procedimento Comum Cível' }, assuntos: [{ codigo: 1, nome: 'Indenização' }], orgaoJulgador: { nome: '1ª Vara Cível' },
        tribunal: 'TJSP', grau: 'G1', dataAjuizamento: '2024-03-05T00:00:00.000Z', nivelSigilo: 0, dataHoraUltimaAtualizacao: '2026-01-10T10:00:00.000Z',
        movimentos: [
          { codigo: 26, nome: 'Distribuição', dataHora: '2024-03-05T14:41:36.000Z' },
          { codigo: 60, nome: 'Expedição de documento', dataHora: '2024-04-01T10:00:00.000Z', complementosTabelados: [{ codigo: 1, nome: 'Intimação', descricao: 'tipo de documento' }] },
        ] } },
      { _source: { numeroProcesso: '00012347720248260001', grau: 'G2', dataHoraUltimaAtualizacao: '2025-01-01T00:00:00.000Z',
        movimentos: [{ codigo: 26, nome: 'Distribuição', dataHora: '20240305144136' }, { codigo: 193, nome: 'Juntada', dataHora: '20250102090000' }] } },
    ] },
  };
  it('junta os documentos, sem repetir andamento, na ordem do tempo', () => {
    const d = lerRespostaDatajud(resp)!;
    expect(d).toMatchObject({ classe: 'Procedimento Comum Cível', assunto: 'Indenização', orgao_julgador: '1ª Vara Cível', tribunal: 'TJSP', grau: 'G1', data_ajuizamento: '2024-03-05', sigiloso: false });
    expect(d.movimentos.map(m => m.nome)).toEqual(['Distribuição', 'Expedição de documento', 'Juntada']);
    expect(d.movimentos[1].complemento).toBe('Intimação: tipo de documento');
  });
  it('aceita data compacta e resposta vazia', () => {
    expect(dataDatajud('20240305144136')).toBe('2024-03-05T14:41:36.000Z');
    expect(dataDatajud('lixo')).toBeNull();
    expect(lerRespostaDatajud({ hits: { hits: [] } })).toBeNull();
    expect(lerRespostaDatajud(null)).toBeNull();
  });
  it('a chave do andamento é estável', () => {
    const m = { codigo: 60, nome: 'Expedição de documento', dataHora: '2024-04-01T10:00:00.000Z' };
    expect(chaveMovimento('dj', m)).toBe(chaveMovimento('dj', { ...m, dataHora: '2024-04-01T10:00:00Z' }));
    expect(chaveMovimento('dj', m)).not.toBe(chaveMovimento('dj', { ...m, nome: 'Outro' }));
  });
});

describe('prazo em dias úteis', () => {
  it('não conta o dia do marco e pula fim de semana', () => {
    expect(calcularVencimento('2026-03-02', 5)).toBe('2026-03-09');         // segunda → próxima segunda
    expect(calcularVencimento('2026-03-06', 1)).toBe('2026-03-09');         // sexta + 1 útil = segunda
  });
  it('feriado do escritório não conta', () => {
    expect(calcularVencimento('2026-03-02', 5, new Set(['2026-03-04']))).toBe('2026-03-10');
  });
  it('recesso forense (20/12 a 20/01) suspende a contagem', () => {
    expect(emRecesso('2026-12-20')).toBe(true); expect(emRecesso('2026-12-19')).toBe(false); expect(emRecesso('2027-01-20')).toBe(true); expect(emRecesso('2027-01-21')).toBe(false);
    expect(calcularVencimento('2026-12-18', 5)).toBe('2027-01-27');
  });
  it('dias corridos que terminam em dia sem expediente passam para o próximo dia útil', () => {
    expect(calcularVencimento('2026-03-02', 5, new Set(), 'corridos')).toBe('2026-03-09');   // 07/03 é sábado
    expect(calcularVencimento('2026-03-02', 3, new Set(), 'corridos')).toBe('2026-03-05');
  });
  it('15 dias úteis de uma quarta-feira', () => { expect(calcularVencimento('2026-06-10', 15)).toBe('2026-07-01'); });
  it('dia útil', () => { expect(diaUtil('2026-03-07')).toBe(false); expect(diaUtil('2026-03-09')).toBe(true); expect(diaUtil('2026-03-09', new Set(['2026-03-09']))).toBe(false); });
});

describe('tarefa criada a partir do andamento', () => {
  it('título, prioridade, responsável e aviso do prazo sugerido', () => {
    const proc = { id: 'p1', numero: '0001234-77.2024.8.26.0001', titulo: 'Beta x Gama', cliente: 'Beta Ltda', responsavel_id: 'f1' };
    const mov = { nome: 'Sentença', dataHora: '2026-03-02T15:00:00.000Z' };
    const t = tarefaDoMovimento(proc, mov, classificarMovimento(mov));
    expect(t).toMatchObject({ tipo: 'tarefa', titulo: 'Analisar sentença — Beta x Gama', prioridade: 'alta', responsavel_id: 'f1', processo_id: 'p1', processo_numero: proc.numero, cliente: 'Beta Ltda' });
    expect(t.descricao).toContain('Prazo sugerido: 15 dias úteis');
    expect(t.descricao).toContain('vencendo em 23/03/2026');
    expect(t.descricao).toContain('confirme no ato');
  });
  it('andamento sem prazo não inventa vencimento', () => {
    const mov = { nome: 'Trânsito em julgado', dataHora: '2026-03-02T15:00:00.000Z' };
    const t = tarefaDoMovimento({ id: 'p', numero: 'n' }, mov, classificarMovimento(mov));
    expect(t.descricao).not.toContain('Prazo sugerido');
    expect(t.titulo).toBe('Analisar trânsito em julgado — n');
  });
});
