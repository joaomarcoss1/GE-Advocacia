import { describe, expect, it } from 'vitest';
import { blocos, dataPorExtenso, extrairVariaveis, inteiroPorExtenso, nomeArquivoModelo, preencher, reaisPorExtenso, trechos, variaveisDesconhecidas, VARIAVEIS } from './modelos';

describe('valor por extenso', () => {
  const casos: [number, string][] = [
    [0, 'zero'], [1, 'um'], [15, 'quinze'], [21, 'vinte e um'], [100, 'cem'], [101, 'cento e um'], [250, 'duzentos e cinquenta'], [999, 'novecentos e noventa e nove'],
    [1000, 'mil'], [1001, 'mil e um'], [1500, 'mil e quinhentos'], [2100, 'dois mil e cem'], [2101, 'dois mil cento e um'], [10000, 'dez mil'], [12345, 'doze mil trezentos e quarenta e cinco'],
    [100000, 'cem mil'], [1000000, 'um milhão'], [2500000, 'dois milhões e quinhentos mil'], [1000001, 'um milhão e um'],
  ];
  it.each(casos)('%i → %s', (n, t) => { expect(inteiroPorExtenso(n)).toBe(t); });
  it('em reais', () => {
    expect(reaisPorExtenso(1)).toBe('um real');
    expect(reaisPorExtenso(1500.5)).toBe('mil e quinhentos reais e cinquenta centavos');
    expect(reaisPorExtenso(0.99)).toBe('noventa e nove centavos');
    expect(reaisPorExtenso(6000)).toBe('seis mil reais');
    expect(reaisPorExtenso(1_000_000)).toBe('um milhão de reais');
    expect(reaisPorExtenso(0)).toBe('zero reais');
  });
  it('data por extenso', () => { expect(dataPorExtenso('2026-10-08')).toBe('8 de outubro de 2026'); });
});

describe('preenchimento de campos', () => {
  it('troca os campos pelos valores e lista o que faltou', () => {
    const r = preencher('Eu, {{cliente.nome}}, CPF {{cliente.documento}}, na {{processo.vara}}.', { 'cliente.nome': 'Maria', 'cliente.documento': '' });
    expect(r.texto).toBe('Eu, Maria, CPF [[PREENCHER: CPF/CNPJ do cliente]], na [[PREENCHER: Vara / órgão julgador]].');
    expect(r.faltando).toEqual(['CPF/CNPJ do cliente', 'Vara / órgão julgador']);
  });
  it('usa o padrão do modelo quando não há dado: {{campo|padrão}}', () => {
    expect(preencher('Foro de {{escritorio.cidade|São Luís}}', {}).texto).toBe('Foro de São Luís');
    expect(preencher('Foro de {{escritorio.cidade|São Luís}}', { 'escritorio.cidade': 'Imperatriz' }).texto).toBe('Foro de Imperatriz');
  });
  it('é tolerante a espaços e maiúsculas, e não repete o mesmo campo faltante', () => {
    const r = preencher('{{ Cliente.Nome }} e {{cliente.nome}}', {});
    expect(r.faltando).toEqual(['Nome do cliente']);
  });
  it('extrai e valida os campos', () => {
    expect(extrairVariaveis('{{cliente.nome}} {{processo.numero}} {{cliente.nome}}')).toEqual(['cliente.nome', 'processo.numero']);
    expect(variaveisDesconhecidas('{{cliente.nome}} {{cliente.apelido}}')).toEqual(['cliente.apelido']);
    expect(new Set(VARIAVEIS.map(v => v.chave)).size).toBe(VARIAVEIS.length);
  });
});

describe('blocos e trechos', () => {
  it('interpreta a marcação', () => {
    const b = blocos('# EXCELENTÍSSIMO\n\n>> centro\n\nTexto **forte** aqui.\n~ sem recuo\n- item um\n[[quebra]]\n<< direita\n\n\n');
    expect(b.map(x => x.tipo)).toEqual(['titulo', 'vazio', 'centro', 'vazio', 'paragrafo', 'semrecuo', 'item', 'quebra', 'direita']);
  });
  it('separa negrito e campos a preencher', () => {
    expect(trechos('A **parte** [[PREENCHER: Nome do cliente]] ok')).toEqual([
      { texto: 'A ', negrito: false, preencher: false }, { texto: 'parte', negrito: true, preencher: false }, { texto: ' ', negrito: false, preencher: false },
      { texto: '[Nome do cliente]', negrito: true, preencher: true }, { texto: ' ok', negrito: false, preencher: false },
    ]);
  });
  it('lacunas do próprio modelo, entre colchetes, também aparecem como campo a completar', () => {
    expect(trechos('na comarca de [comarca], Estado do Maranhão')).toEqual([
      { texto: 'na comarca de ', negrito: false, preencher: false }, { texto: '[comarca]', negrito: false, preencher: true }, { texto: ', Estado do Maranhão', negrito: false, preencher: false },
    ]);
  });
  it('nome de arquivo seguro', () => { expect(nomeArquivoModelo('Contestação / Cível (1ª Vara)', 'docx')).toBe('Contestacao-Civel-1a-Vara.docx'); });
});
