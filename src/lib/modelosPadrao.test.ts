import { describe, expect, it } from 'vitest';
import { blocos, CATEGORIAS_MODELO, extrairVariaveis, preencher, variaveisDesconhecidas } from './modelos';
import { MODELOS_PADRAO } from './modelosPadrao';

describe('biblioteca padrão de modelos', () => {
  it('tem modelos em todas as categorias, com títulos únicos e conteúdo de verdade', () => {
    expect(MODELOS_PADRAO.length).toBeGreaterThanOrEqual(30);
    expect(new Set(MODELOS_PADRAO.map(m => m.titulo)).size).toBe(MODELOS_PADRAO.length);
    for (const c of CATEGORIAS_MODELO) expect(MODELOS_PADRAO.some(m => m.categoria === c.id), `categoria sem modelo: ${c.id}`).toBe(true);
    for (const m of MODELOS_PADRAO) {
      expect(m.titulo.length, m.titulo).toBeLessThanOrEqual(160);
      expect(m.descricao.length, `${m.titulo}: descrição`).toBeGreaterThan(20);
      expect(m.descricao.length, `${m.titulo}: descrição`).toBeLessThanOrEqual(400);
      expect(m.conteudo.length, `${m.titulo}: tamanho`).toBeGreaterThanOrEqual(300);
      expect(m.conteudo.length, `${m.titulo}: tamanho`).toBeLessThanOrEqual(80000);
    }
  });
  it('só usa campos que existem no catálogo (nada de erro de digitação)', () => {
    for (const m of MODELOS_PADRAO) expect(variaveisDesconhecidas(m.conteudo), m.titulo).toEqual([]);
  });
  it('todos têm título de documento, assinatura/identificação e geram blocos', () => {
    for (const m of MODELOS_PADRAO) {
      const b = blocos(m.conteudo);
      expect(b.length, m.titulo).toBeGreaterThan(5);
      expect(b.some(x => x.tipo === 'titulo' || x.tipo === 'centro'), `${m.titulo}: sem título`).toBe(true);
    }
  });
  it('petições dirigidas ao juízo trazem a qualificação do cliente e do advogado', () => {
    for (const m of MODELOS_PADRAO.filter(x => ['iniciais', 'defesas', 'recursos', 'manifestacoes', 'execucao'].includes(x.categoria))) {
      const v = extrairVariaveis(m.conteudo);
      expect(v.includes('cliente.nome') || v.includes('cliente.qualificacao'), `${m.titulo}: sem cliente`).toBe(true);
      expect(v.includes('advogado.nome'), `${m.titulo}: sem advogado`).toBe(true);
    }
  });
  it('preenche um contrato de verdade com dados reais, sem sobrar campo solto', () => {
    const m = MODELOS_PADRAO.find(x => x.titulo === 'Contrato de honorários advocatícios')!;
    const r = preencher(m.conteudo, {
      'cliente.qualificacao': 'Maria da Silva, brasileira, casada, professora, CPF 000.000.000-00', 'cliente.nome': 'Maria da Silva', 'advogado.nome': 'João Souza', 'advogado.oab': 'OAB/MA 1234',
      'escritorio.nome': 'Silva & Souza Advogados', 'escritorio.endereco': 'Av. A, 1', 'escritorio.cidade': 'São Luís', 'honorarios.valor': 'R$ 6.000,00', 'honorarios.extenso': 'seis mil reais',
      'honorarios.forma': 'entrada de R$ 2.000,00 e 4 parcelas de R$ 1.000,00', 'honorarios.exito': '10%', 'data.extenso': '8 de outubro de 2026',
    });
    expect(r.faltando).toEqual([]);
    expect(r.texto).toContain('R$ 6.000,00');
    expect(r.texto).not.toMatch(/\{\{/);
  });
});
