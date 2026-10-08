import { describe, expect, it } from 'vitest';
import { montarCnj } from './cnj';
import {
  calcularPrazo, calcularVencimento, chaveMovimento, diasPadraoPorJustica, segmentoDeCnj, classificarMovimento, corpoConsultaDatajud, dataDatajud, diaUtil, emRecesso, lerRespostaDatajud, tarefaDoMovimento, tribunalDeCnj, tribunalPorAlias, TRIBUNAIS_DATAJUD, urlDatajud,
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

describe('catálogo de endpoints do DataJud', () => {
  it('tem os 91 tribunais da API pública, sem repetição, com nome e ramo', () => {
    expect(TRIBUNAIS_DATAJUD).toHaveLength(91);
    expect(new Set(TRIBUNAIS_DATAJUD.map(x => x.alias)).size).toBe(91);
    const por = (r: string) => TRIBUNAIS_DATAJUD.filter(x => x.ramo === r).length;
    expect([por('superior'), por('federal'), por('estadual'), por('trabalho'), por('eleitoral'), por('militar')]).toEqual([4, 6, 27, 24, 27, 3]);
    expect(tribunalPorAlias('tjma')?.nome).toBe('Tribunal de Justiça do Maranhão');
    expect(tribunalPorAlias('TRT2')?.nome).toBe('Tribunal Regional do Trabalho da 2ª Região');
    expect(tribunalPorAlias('tre-dft')?.nome).toBe('Tribunal Regional Eleitoral do Distrito Federal e Territórios');
  });
  it('todo número CNJ válido (ramo × tribunal) resolve para um item do catálogo, e todo item é alcançável por um número', () => {
    const achados = new Set<string>();
    for (let j = 1; j <= 9; j++) for (let tr = 0; tr <= 99; tr++) {
      const r = tribunalDeCnj('0001234002024' + String(j) + String(tr).padStart(2, '0') + '0001');
      if (r) { expect(tribunalPorAlias(r.alias)).toEqual(r); achados.add(r.alias); }
    }
    expect(achados.size).toBe(91);
  });
  it('o endereço de cada tribunal segue o padrão da API pública', () => {
    for (const x of TRIBUNAIS_DATAJUD) expect(urlDatajud(x.alias)).toBe(`https://api-publica.datajud.cnj.jus.br/api_publica_${x.alias}/_search`);
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

describe('prazo processual completo (marco, dobro e passo a passo)', () => {
  it('disponibilização no Diário: publicação no 1º dia útil seguinte e contagem no dia útil depois dela', () => {
    // sexta 12/06/2026 → publicação segunda 15/06 → 1º dia da contagem terça 16/06 → 15 dias úteis vencem em 06/07
    const r = calcularPrazo({ marco: '2026-06-12', tipo: 'disponibilizacao', dias: 15 });
    expect(r.publicacao).toBe('2026-06-15');
    expect(r.inicio).toBe('2026-06-16');
    expect(r.vencimento).toBe('2026-07-06');
    expect(r.passos[0]).toContain('sexta-feira');
    expect(r.passos.at(-1)).toContain('segunda-feira');
  });
  it('publicação ou ciência: conta a partir do dia útil seguinte (como o cálculo simples)', () => {
    expect(calcularPrazo({ marco: '2026-06-15', tipo: 'publicacao', dias: 15 }).vencimento).toBe('2026-07-06');
    expect(calcularPrazo({ marco: '2026-06-15', tipo: 'ciencia', dias: 15 }).vencimento).toBe(calcularVencimento('2026-06-15', 15));
  });
  it('disponibilização na véspera do recesso só publica depois dele (21/01)', () => {
    const r = calcularPrazo({ marco: '2026-12-18', tipo: 'disponibilizacao', dias: 5 });
    expect(r.publicacao).toBe('2027-01-21');
    expect(r.inicio).toBe('2027-01-22');
    expect(r.vencimento).toBe('2027-01-28');
  });
  it('intimação eletrônica sem consulta: ciência tácita no 10º dia corrido (ou no próximo dia útil)', () => {
    const r = calcularPrazo({ marco: '2026-06-01', tipo: 'envio_portal', dias: 5 });       // segunda + 10 = quinta 11/06
    expect(r.ciencia).toBe('2026-06-11');
    expect(r.inicio).toBe('2026-06-12');
    expect(r.vencimento).toBe('2026-06-18');
    expect(calcularPrazo({ marco: '2026-06-03', tipo: 'envio_portal', dias: 5 }).ciencia).toBe('2026-06-15');   // 13/06 é sábado → segunda 15/06
  });
  it('prazo em dobro e feriados cadastrados', () => {
    expect(calcularPrazo({ marco: '2026-03-02', dias: 5, dobro: true }).dias).toBe(10);
    expect(calcularPrazo({ marco: '2026-03-02', dias: 5, dobro: true }).vencimento).toBe(calcularVencimento('2026-03-02', 10));
    expect(calcularPrazo({ marco: '2026-03-02', dias: 5, feriados: new Set(['2026-03-04']) }).vencimento).toBe('2026-03-10');
  });
  it('dias corridos: vencimento que cai em fim de semana passa para a segunda', () => {
    const r = calcularPrazo({ marco: '2026-03-02', dias: 5, regime: 'corridos' });
    expect(r.inicio).toBe('2026-03-03');
    expect(r.vencimento).toBe('2026-03-09');
  });
});

describe('prazo-padrão por tipo de justiça', () => {
  it('Justiça do Trabalho (J=5): 15 vira 8; demais seguem o CPC', () => {
    expect(segmentoDeCnj('0001234-77.2024.5.10.0001')).toBe('5');
    expect(segmentoDeCnj('0001234-77.2024.8.26.0001')).toBe('8');
    expect(segmentoDeCnj('123')).toBeNull();
    expect(diasPadraoPorJustica('0001234-77.2024.5.10.0001', 15)).toBe(8);
    expect(diasPadraoPorJustica('0001234-77.2024.5.10.0001', 5)).toBe(5);
    expect(diasPadraoPorJustica('0001234-77.2024.8.26.0001', 15)).toBe(15);
    expect(diasPadraoPorJustica('0001234-77.2024.5.10.0001', null)).toBeNull();
  });
  it('a tarefa criada para processo trabalhista sugere 8 dias, não 15', () => {
    const c = classificarMovimento({ nome: 'Sentença', complemento: 'Julgado procedente' });
    const t = tarefaDoMovimento({ id: 'p', numero: '0001234-77.2024.5.10.0001' }, { nome: 'Sentença', dataHora: '2026-03-02T10:00:00Z' }, c);
    expect(t.descricao).toContain('Prazo sugerido: 8 dias úteis');
  });
});

describe('classificador: fase de cumprimento não é sentença', () => {
  it.each(['Início do Cumprimento de Sentença', 'Cumprimento provisório de sentença', 'Liquidação de Sentença', 'Execução de sentença'])('"%s" não gera alerta de sentença', nome => {
    const c = classificarMovimento({ nome });
    expect(c.categoria).not.toBe('sentenca');
    expect(c.exige_acao).toBe(false);
  });
  it('sentença de verdade continua sendo reconhecida', () => {
    expect(classificarMovimento({ nome: 'Sentença', complemento: 'Julgado procedente em parte' }).categoria).toBe('sentenca');
    expect(classificarMovimento({ nome: 'Proferida sentença de extinção do processo' }).exige_acao).toBe(true);
  });
});

