import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { gerarDocx } from './docx';

describe('arquivo Word (.docx)', () => {
  it('gera um .docx válido com o texto, o negrito e os campos a preencher destacados', async () => {
    const blob = await gerarDocx('Procuração', '# PROCURAÇÃO\n\nOutorgante: **Maria da Silva**, CPF [[PREENCHER: CPF/CNPJ do cliente]].\n\n- poderes gerais\n[[quebra]]\n<< São Luís, 8 de outubro de 2026', { rodape: 'Silva & Ribeiro' });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toContain('word/document.xml');
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('PROCURAÇÃO');
    expect(xml).toContain('Maria da Silva');
    expect(xml).toContain('[CPF/CNPJ do cliente]');
    expect(xml).toContain('w:highlight');                // o campo a preencher aparece em destaque
    expect(xml).toContain('Times New Roman');
    expect(xml).toContain('w:br w:type="page"');          // quebra de página
    const rodape = Object.keys(zip.files).find(f => f.startsWith('word/footer'));
    expect(rodape).toBeTruthy();
    expect(await zip.file(rodape!)!.async('string')).toContain('Silva &amp; Ribeiro');
  });
});
