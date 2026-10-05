import { describe, expect, it } from 'vitest';
import { MAX_BYTES, conferirArquivo, escaparConsultaDrive, nomeSeguro, sha256Texto, tipoPelaAssinatura } from '../../supabase/functions/_shared/arquivos';

const bytes = (...v: number[]) => new Uint8Array([...v, ...new Array(40).fill(0)]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const zip = (conteudo: string) => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode(conteudo)]);

describe('conferência do arquivo pelo conteúdo', () => {
  it('aceita o que bate com a extensão e devolve o tipo REAL', () => {
    expect(conferirArquivo('contrato.pdf', PDF)).toEqual({ ok: true, mime: 'application/pdf' });
    expect(conferirArquivo('foto.JPG', JPG)).toEqual({ ok: true, mime: 'image/jpeg' });
    expect(conferirArquivo('foto.png', PNG)).toEqual({ ok: true, mime: 'image/png' });
    expect(conferirArquivo('foto.webp', WEBP)).toEqual({ ok: true, mime: 'image/webp' });
    expect(conferirArquivo('antigo.doc', OLE)).toEqual({ ok: true, mime: 'application/msword' });
    expect(conferirArquivo('planilha.xls', OLE)).toEqual({ ok: true, mime: 'application/vnd.ms-excel' });
    expect(conferirArquivo('peca.docx', zip('....[Content_Types].xml word/document.xml'))).toMatchObject({ ok: true });
    expect(conferirArquivo('dados.xlsx', zip('[Content_Types].xml xl/workbook.xml'))).toMatchObject({ ok: true });
  });
  it('imagem com extensão de outra imagem vale pelo conteúdo', () => {
    expect(conferirArquivo('scan.jpg', PNG)).toEqual({ ok: true, mime: 'image/png' });
  });
  it('recusa extensão que não bate com o conteúdo (arquivo disfarçado)', () => {
    expect(conferirArquivo('contrato.pdf', JPG)).toMatchObject({ ok: false });
    expect(conferirArquivo('foto.jpg', PDF)).toMatchObject({ ok: false });
    expect(conferirArquivo('peca.docx', PDF)).toMatchObject({ ok: false });
    expect(conferirArquivo('peca.docx', OLE)).toMatchObject({ ok: false });
    expect(conferirArquivo('antigo.doc', zip('[Content_Types].xml'))).toMatchObject({ ok: false });
  });
  it('recusa executáveis, zip qualquer, vazio e grande demais', () => {
    expect(conferirArquivo('instalador.exe', bytes(0x4d, 0x5a))).toMatchObject({ ok: false });
    expect(conferirArquivo('instalador.pdf', bytes(0x4d, 0x5a))).toMatchObject({ ok: false });
    expect(conferirArquivo('pacote.docx', zip('qualquer coisa sem o marcador'))).toMatchObject({ ok: false });
    expect(conferirArquivo('a.pdf', new Uint8Array())).toMatchObject({ ok: false });
    expect(conferirArquivo('grande.pdf', Object.assign(new Uint8Array(MAX_BYTES + 1), { 0: 0x25, 1: 0x50, 2: 0x44, 3: 0x46, 4: 0x2d }))).toMatchObject({ ok: false, erro: expect.stringContaining('20 MB') });
    expect(tipoPelaAssinatura(bytes(1, 2, 3))).toBeNull();
  });
  it('nomes seguros e escape da consulta do Drive', () => {
    expect(nomeSeguro('a/b\\c:d*e?"f<g>h|i.pdf')).toBe('a_b_c_d_e_f_g_h_i.pdf');
    expect(nomeSeguro('  ')).toBe('arquivo');
    expect(escaparConsultaDrive("Joana d'Arc \\ filhos")).toBe("Joana d\\'Arc \\\\ filhos");
  });
  it('hash do token é estável e tem 64 caracteres hexadecimais', async () => {
    const h = await sha256Texto('abc');
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Texto('abc')).toBe(h);
  });
});
