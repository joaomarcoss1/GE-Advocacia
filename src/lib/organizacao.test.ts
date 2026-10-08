import { describe, expect, it } from 'vitest';
import { CATEGORIAS, ehCategoria, nomeNoDrive, pastaDaCategoria, rotuloCategoria, sugerirCategoria, sugerirItem, urlPastaDrive } from './organizacao';

describe('categorias', () => {
  it('têm pastas numeradas em ordem e sem repetição', () => {
    expect(CATEGORIAS.map(c => c.pasta.slice(0, 2))).toEqual(['01', '02', '03', '04', '05', '06', '07', '08']);
    expect(new Set(CATEGORIAS.map(c => c.id)).size).toBe(CATEGORIAS.length);
    expect(pastaDaCategoria('peticoes')).toBe('03 · Petições e peças');
    expect(pastaDaCategoria('qualquer')).toBe('08 · Outros');
    expect(rotuloCategoria(null)).toBe('Outros');
    expect(ehCategoria('provas')).toBe(true);
    expect(ehCategoria('x')).toBe(false);
  });
});

describe('sugestão de categoria pelo nome', () => {
  const casos: [string, string | null, string][] = [
    ['Procuração assinada.pdf', null, 'contrato'], ['contrato_honorarios_final.pdf', null, 'contrato'], ['substabelecimento.docx', null, 'contrato'],
    ['RG frente e verso.jpg', null, 'pessoais'], ['CPF.png', null, 'pessoais'], ['comprovante-de-residencia.pdf', null, 'pessoais'], ['certidão de casamento.pdf', null, 'pessoais'], ['CNH.jpeg', null, 'pessoais'],
    ['Sentença.pdf', null, 'decisoes'], ['decisao_liminar.pdf', null, 'decisoes'], ['Intimação 12-06.pdf', null, 'decisoes'], ['acórdão.pdf', null, 'decisoes'],
    ['ata de audiencia.pdf', null, 'audiencias'], ['Audiência de instrução.pdf', null, 'audiencias'],
    ['Petição inicial.docx', null, 'peticoes'], ['contestacao v3.docx', null, 'peticoes'], ['Apelação.pdf', null, 'peticoes'], ['embargos de declaração.pdf', null, 'peticoes'],
    ['boleto custas.pdf', null, 'financeiro'], ['guia GRU.pdf', null, 'financeiro'], ['comprovante de pagamento.jpg', null, 'financeiro'],
    ['laudo pericial.pdf', null, 'provas'], ['print da conversa.png', null, 'provas'], ['extrato bancario.pdf', null, 'provas'], ['holerite mar.pdf', null, 'provas'],
    ['IMG_2041.jpg', null, 'outros'], ['scan0001.pdf', null, 'outros'],
    // o item da lista vale mais do que o nome do arquivo
    ['scan0001.pdf', 'Procuração assinada', 'contrato'], ['IMG_1.jpg', 'RG e CPF', 'pessoais'], ['arquivo.pdf', 'Comprovante de residência', 'pessoais'],
    ['contrato.pdf', 'Documentos pessoais', 'pessoais'],
  ];
  it.each(casos)('%s (item: %s) → %s', (arq, item, cat) => { expect(sugerirCategoria(arq, item)).toBe(cat); });
  it('"contrato de honorários" é contrato, não financeiro; "ata" não casa dentro de outras palavras', () => {
    expect(sugerirCategoria('contrato de honorários.pdf')).toBe('contrato');
    expect(sugerirCategoria('datas e prazos.pdf')).toBe('outros');
    expect(sugerirCategoria('relatorio.pdf')).toBe('outros');
  });
});

describe('nome padronizado no Drive', () => {
  it('data · item · original, com a extensão preservada', () => {
    expect(nomeNoDrive({ criadoEm: '2026-10-08T12:00:00Z', nome: 'scan0001.pdf', item: 'Procuração assinada' })).toBe('2026-10-08 · Procuração assinada · scan0001.pdf');
    expect(nomeNoDrive({ criadoEm: '2026-10-08T12:00:00Z', nome: 'laudo.PDF' })).toBe('2026-10-08 · laudo.PDF');
  });
  it('não repete o item quando o arquivo já o diz', () => {
    expect(nomeNoDrive({ criadoEm: '2026-10-08', nome: 'Procuração assinada.pdf', item: 'Procuração' })).toBe('2026-10-08 · Procuração assinada.pdf');
  });
  it('troca caracteres proibidos e nunca passa de 120 caracteres, mantendo a extensão', () => {
    const n = nomeNoDrive({ criadoEm: '2026-10-08', nome: `${'a'.repeat(300)}.pdf`, item: 'Item/com:barras' });
    expect(n.length).toBeLessThanOrEqual(120);
    expect(n.endsWith('.pdf')).toBe(true);
    expect(nomeNoDrive({ criadoEm: '2026-10-08', nome: 'a/b:c?.pdf' })).toBe('2026-10-08 · a_b_c_.pdf');
  });
  it('sem data informada usa a de hoje', () => { expect(nomeNoDrive({ nome: 'x.pdf' })).toMatch(/^\d{4}-\d{2}-\d{2} · x\.pdf$/); });
  it('endereço da pasta', () => { expect(urlPastaDrive('abc123')).toBe('https://drive.google.com/drive/folders/abc123'); });
});

describe('sugestão do item da lista pelo nome do arquivo', () => {
  const itens = [
    { id: '1', nome: 'RG e CPF', status: 'pendente' }, { id: '2', nome: 'Comprovante de residência', status: 'pendente' }, { id: '3', nome: 'Comprovante de renda', status: 'pendente' },
    { id: '4', nome: 'Carteira de trabalho (CTPS)', status: 'recebido' }, { id: '5', nome: 'Procuração', status: 'dispensado' },
  ];
  it('acha o item pelas palavras em comum', () => {
    expect(sugerirItem('rg frente e verso.jpg', itens)?.id).toBe('1');
    expect(sugerirItem('CPF_cliente.pdf', itens)?.id).toBe('1');
    expect(sugerirItem('comprovante_residencia.pdf', itens)?.id).toBe('2');
    expect(sugerirItem('ctps.pdf', itens)?.id).toBe('4');
  });
  it('não adivinha em caso de empate nem sem palavras em comum, e ignora itens dispensados', () => {
    expect(sugerirItem('comprovante.pdf', itens)).toBeNull();
    expect(sugerirItem('IMG_2041.jpg', itens)).toBeNull();
    expect(sugerirItem('procuracao.pdf', itens)).toBeNull();
  });
});
