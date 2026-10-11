import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ORDEM_PAPEIS, PADRAO, PAPEIS, PERMISSOES, RESERVADAS, TODAS } from './permissoes';

/** O banco (migração 0013) repete o catálogo e os padrões de src/lib/permissoes.ts: os dois precisam bater. */
const sql = readFileSync(new URL('../../supabase/migrations/0013_niveis_acesso.sql', import.meta.url), 'utf8');
const lista = (trecho: string) => [...trecho.matchAll(/'([^']+)'/g)].map(m => m[1]);
const corpo = (funcao: string) => sql.slice(sql.indexOf(`function public.${funcao}`)).split('$$;')[0];

describe('paridade com a migração 0013', () => {
  it('catálogo e reservadas', () => {
    expect(lista(corpo('_permissoes_catalogo()')).slice()).toEqual(TODAS);
    expect(lista(corpo('_permissoes_reservadas()'))).toEqual(RESERVADAS);
  });
  it('implicações', () => {
    const pares = [...corpo('_permissoes_implicacoes()').matchAll(/\('([^']+)', '([^']+)'\)/g)].map(m => `${m[1]}>${m[2]}`).sort();
    const ts = PERMISSOES.flatMap(p => (p.implica ?? []).map(i => `${p.id}>${i}`)).sort();
    expect(pares).toEqual(ts);
  });
  it('padrão de cada nível', () => {
    const c = corpo('_permissoes_padrao(p_papel text)');
    for (const papel of ORDEM_PAPEIS.filter(p => p !== 'admin')) {
      const m = c.match(new RegExp(`when '${papel}' then array\\[([^\\]]*)\\]`));
      expect(m, papel).not.toBeNull();
      expect(lista(m![1]), papel).toEqual(PADRAO[papel]);
    }
  });
  it('hierarquia e porta do ponto', () => {
    const niveis = corpo('_nivel(p_papel text)');
    for (const p of ORDEM_PAPEIS) expect(niveis).toContain(`'${p}' then ${PAPEIS[p].nivel}`);
    const exige = lista(corpo('_papel_exige_ponto(p_papel text)').split('select')[1] ?? '');
    expect(exige.sort()).toEqual(ORDEM_PAPEIS.filter(p => PAPEIS[p].exigePonto).sort());
  });
});
