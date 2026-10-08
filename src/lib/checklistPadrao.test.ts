import { describe, expect, it } from 'vitest';
import { MODELOS_INICIAIS } from './checklist';
import { CHECKLISTS_PADRAO } from './checklistPadrao';

describe('listas de documentos padrão', () => {
  it('tem pelo menos 18 listas, com nomes únicos (inclusive diante das listas iniciais)', () => {
    expect(CHECKLISTS_PADRAO.length).toBeGreaterThanOrEqual(18);
    const nomes = [...CHECKLISTS_PADRAO.map(c => c.nome.toLowerCase()), ...MODELOS_INICIAIS.map(c => c.nome.toLowerCase())];
    expect(new Set(nomes).size).toBe(nomes.length);
  });
  it('cada lista cabe nos limites do banco e não repete itens', () => {
    for (const c of CHECKLISTS_PADRAO) {
      expect(c.itens.length, c.nome).toBeGreaterThanOrEqual(6);
      expect(c.itens.length, c.nome).toBeLessThanOrEqual(80);
      expect(c.tipo.length, c.nome).toBeGreaterThan(1);
      expect(c.descricao.length, c.nome).toBeLessThanOrEqual(400);
      expect(new Set(c.itens.map(i => i.nome.toLowerCase())).size, `${c.nome}: item repetido`).toBe(c.itens.length);
      expect(c.itens.some(i => i.obrigatorio !== false), c.nome).toBe(true);
      for (const i of c.itens) expect(i.nome.length, `${c.nome}: ${i.nome}`).toBeLessThanOrEqual(200);
    }
  });
});
