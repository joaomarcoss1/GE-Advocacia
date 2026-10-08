import { describe, expect, it } from 'vitest';
import { exigeProvidencia, lerComunicacao, limparTexto, mascararCnj, parseOab, prazoNoTexto, urlDjen } from './intimacoes';

describe('OAB do advogado', () => {
  it('lê os formatos usuais', () => {
    expect(parseOab('OAB/MA 12.345')).toEqual({ numero: '12345', uf: 'MA' });
    expect(parseOab('12345 MA')).toEqual({ numero: '12345', uf: 'MA' });
    expect(parseOab('ma-00987')).toEqual({ numero: '987', uf: 'MA' });
    expect(parseOab('OAB SP nº 123.456')).toEqual({ numero: '123456', uf: 'SP' });
  });
  it('sem número ou UF, não adivinha', () => {
    expect(parseOab('12345')).toBeNull();
    expect(parseOab('OAB/MA')).toBeNull();
    expect(parseOab('')).toBeNull();
    expect(parseOab(null)).toBeNull();
    expect(parseOab('OAB/XX 123')).toBeNull();
  });
});

describe('número do processo e endereço da API', () => {
  it('máscara CNJ', () => {
    expect(mascararCnj('08012345620268100001')).toBe('0801234-56.2026.8.10.0001');
    expect(mascararCnj('0801234-56.2026.8.10.0001')).toBe('0801234-56.2026.8.10.0001');
    expect(mascararCnj('123')).toBeNull();
  });
  it('monta a consulta por OAB e período', () => {
    const u = urlDjen({ oab: { numero: '12345', uf: 'MA' }, inicio: '2026-10-01', fim: '2026-10-08' });
    expect(u).toContain('numeroOab=12345');
    expect(u).toContain('ufOab=MA');
    expect(u).toContain('dataDisponibilizacaoInicio=2026-10-01');
    expect(u).toContain('itensPorPagina=100');
    expect(urlDjen({ sigla: 'tjma<', inicio: 'a', fim: 'b', pagina: 2 })).toContain('siglaTribunal=TJMA');
  });
});

describe('leitura da comunicação', () => {
  const bruto = {
    id: 747388968, data_disponibilizacao: '2026-10-06', siglaTribunal: 'TJMA', tipoComunicacao: 'Intimação', nomeOrgao: '3ª Vara Cível', nomeClasse: 'Procedimento Comum Cível',
    numero_processo: '08012345620268100001', numeroprocessocommascara: '0801234-56.2026.8.10.0001', texto: '<p>Fica a parte intimada para &quot;manifestar-se&quot; no prazo de 15 (quinze) dias.</p>',
    link: 'https://pje.tjma.jus.br/x', meio: 'D', ativo: true,
    destinatarios: [{ nome: 'Maria Souza', polo: 'A' }], destinatarioadvogados: [{ advogado: { nome: 'João Advogado', numero_oab: '12345', uf_oab: 'MA' } }],
  };
  it('converte os campos e limpa o texto', () => {
    const l = lerComunicacao(bruto)!;
    expect(l.djen_id).toBe(747388968);
    expect(l.numero_processo).toBe('0801234-56.2026.8.10.0001');
    expect(l.texto).toBe('Fica a parte intimada para "manifestar-se" no prazo de 15 (quinze) dias.');
    expect(l.advogados).toEqual([{ nome: 'João Advogado', oab: '12345', uf: 'MA' }]);
    expect(l.destinatarios[0].nome).toBe('Maria Souza');
    expect(l.cancelada).toBe(false);
  });
  it('item incompleto é descartado e data brasileira é aceita', () => {
    expect(lerComunicacao({ id: 1 })).toBeNull();
    expect(lerComunicacao(null)).toBeNull();
    expect(lerComunicacao({ ...bruto, data_disponibilizacao: undefined, datadisponibilizacao: '06/10/2026' })!.data_disponibilizacao).toBe('2026-10-06');
    expect(lerComunicacao({ ...bruto, ativo: false })!.cancelada).toBe(true);
  });
  it('limpa HTML', () => {
    expect(limparTexto('<div>a<br>b</div><p>c</p>')).toBe('a\nb\nc');
  });
});

describe('prazo no texto', () => {
  it('acha o prazo escrito', () => {
    expect(prazoNoTexto('Intimado para manifestar-se no prazo de 15 (quinze) dias.')).toEqual({ dias: 15, regime: 'uteis' });
    expect(prazoNoTexto('Prazo de 5 dias úteis para contrarrazões')).toEqual({ dias: 5, regime: 'uteis' });
    expect(prazoNoTexto('no prazo de 10 dias corridos')).toEqual({ dias: 10, regime: 'corridos' });
    expect(prazoNoTexto('Dê-se vista à parte autora no prazo legal de 5 (cinco) dias')).toEqual({ dias: 5, regime: 'uteis' });
  });
  it('sem menção clara, não inventa', () => {
    expect(prazoNoTexto('Defiro a juntada. Intime-se.')).toBeNull();
    expect(prazoNoTexto('Audiência em 15 de outubro às 14h')).toBeNull();
    expect(prazoNoTexto('prazo de 900 dias')).toBeNull();
  });
});

describe('exige providência', () => {
  it('intimação sim, lista de distribuição não', () => {
    expect(exigeProvidencia('Intimação', 'Fica intimada para se manifestar')).toBe(true);
    expect(exigeProvidencia('Lista de distribuição', 'Processos distribuídos hoje')).toBe(false);
    expect(exigeProvidencia('Citação', 'Cite-se o réu')).toBe(true);
  });
});
