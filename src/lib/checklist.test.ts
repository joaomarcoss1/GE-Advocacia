import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODELOS_INICIAIS, extensao, mimeDoNome, nomeSeguroArquivo } from './checklist';

describe('modelos de checklist', () => {
  const sql = readFileSync('supabase/migrations/0007_processos_documentos.sql', 'utf8');
  it('os modelos do app são os mesmos semeados pelo banco (nome, área e itens)', () => {
    for (const m of MODELOS_INICIAIS) {
      expect(sql, m.nome).toContain(`'${m.nome}', ${m.area ? `'${m.area}'` : 'null'}, '[`);
      for (const it of m.itens) {
        const trecho = JSON.stringify(it.obrigatorio === false ? { nome: it.nome, obrigatorio: false } : { nome: it.nome });
        expect(sql, it.nome).toContain(trecho);
      }
    }
  });
  it('nenhum item repetido dentro do mesmo modelo', () => {
    for (const m of MODELOS_INICIAIS) expect(new Set(m.itens.map(x => x.nome.toLowerCase())).size).toBe(m.itens.length);
  });
});

describe('arquivos', () => {
  it('tipo pelo nome', () => {
    expect(mimeDoNome('Contrato.PDF')).toBe('application/pdf');
    expect(mimeDoNome('foto.JPEG')).toBe('image/jpeg');
    expect(mimeDoNome('planilha.xlsx')).toContain('spreadsheetml');
    expect(mimeDoNome('virus.exe')).toBeNull();
    expect(extensao('a.b.c.docx')).toBe('docx');
  });
  it('nome seguro para pasta e arquivo', () => {
    expect(nomeSeguroArquivo('a/b\\c:d*e?"f<g>h|i.pdf')).toBe('a_b_c_d_e_f_g_h_i.pdf');
    expect(nomeSeguroArquivo('   ')).toBe('arquivo');
    expect(nomeSeguroArquivo('x'.repeat(300)).length).toBe(120);
  });
});
