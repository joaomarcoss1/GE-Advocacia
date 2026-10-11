import XLSX from 'xlsx-js-style';
import { describe, expect, it } from 'vitest';
import { conferirArquivo, escaparConsultaDrive, nomeSeguro } from '../../supabase/functions/_shared/arquivos';
import { criarCripto } from '../../supabase/functions/_shared/cripto';
import { criarLimitador } from '../../supabase/functions/_shared/limite';
import { cifrarBackup, decifrarBackup } from '@/lib/backup';
import { normalizarCnj } from '@/lib/cnj';
import { limpar } from '@/lib/monitor';
import { preencher } from '@/lib/modelos';
import { validarPin, validarSenha } from '@/lib/seguranca';

/** Entradas hostis: o que um atacante (ou um erro de digitação) poderia mandar. */
describe('modelos de peças: injeção de campos', () => {
  it('campos herdados do protótipo não vazam ({{constructor}}, {{__proto__}}, {{toString}})', () => {
    const r = preencher('A {{constructor}} B {{__proto__}} C {{tostring}} D', {});
    expect(r.texto).not.toMatch(/function|\[object|native code/);
    expect(r.texto).toContain('[[PREENCHER:');
  });
  it('o valor de um campo nunca é reinterpretado como campo (sem expansão recursiva)', () => {
    const r = preencher('Cliente: {{cliente.nome}}; CPF: {{cliente.cpf}}', { 'cliente.nome': '{{cliente.cpf}}', 'cliente.cpf': '123' });
    expect(r.texto).toBe('Cliente: {{cliente.cpf}}; CPF: 123');
  });
  it('texto gigante e padrões enormes não travam (sem ReDoS)', () => {
    const t0 = performance.now();
    preencher('{{cliente.nome|' + 'x'.repeat(200_000) + '}} '.repeat(2000) + '{{'.repeat(50_000), { 'cliente.nome': 'a' });
    preencher(`${'{{ '.repeat(30_000)}cliente.nome`, {});
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('arquivos e nomes', () => {
  it('nomes não escapam da pasta nem carregam caracteres de controle', () => {
    for (const n of ['../../etc/passwd', '..\\..\\windows\\system32', 'a/b\\c.pdf', 'x\u0000y.pdf', 'con:aux*.pdf', '<script>.pdf', 'a\nb.pdf']) {
      const s = nomeSeguro(n);
      expect(s, n).not.toMatch(/[\\/:*?"<>|\x00-\x1f]/);
      expect(s.length).toBeLessThanOrEqual(120);
    }
    expect(nomeSeguro('')).toBeTruthy();
  });
  it('o tipo vem do conteúdo, não do nome: executável com extensão .pdf é recusado', () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0]);          // MZ (Windows)
    const sh = new TextEncoder().encode('#!/bin/sh\nrm -rf /\n'.padEnd(40, ' '));
    expect(conferirArquivo('fatura.pdf', exe).ok).toBe(false);
    expect(conferirArquivo('foto.png', sh).ok).toBe(false);
    expect(conferirArquivo('doc.pdf.exe', exe).ok).toBe(false);
  });
  it('a consulta ao Drive escapa aspas e barras (sem injeção na busca)', () => {
    expect(escaparConsultaDrive(`a' or name contains '`)).toBe(`a\\' or name contains \\'`);
    expect(escaparConsultaDrive('a\\')).toBe('a\\\\');
  });
});

describe('número de processo, senhas e PIN', () => {
  it('entradas estranhas não derrubam nem travam o CNJ', () => {
    const t0 = performance.now();
    for (const e of [null, undefined, '', 'x'.repeat(500_000), '0'.repeat(300_000), '1-'.repeat(100_000), '\u0000\u0001', '9'.repeat(19), '9'.repeat(21)]) expect(normalizarCnj(e as string)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(1500);
  });
  it('PIN e senha recusam formatos ruins', () => {
    for (const p of ['12345', '1234567890', "1' or '1'='1", '12 345', '１２３４５６', '']) expect(validarPin(p), p).not.toBe('');
    for (const s of ['curta1', 'somenteletrasaqui', '1234567890123', '']) expect(validarSenha(s), s).not.toBe('');
  });
});

describe('cifra do backup e dos tokens', () => {
  it('senha errada, arquivo adulterado e lixo não decifram', async () => {
    const bytes = await cifrarBackup('{"tabelas":{}}', 'senha-forte-123');
    await expect(decifrarBackup(bytes, 'outra-senha-456')).rejects.toThrow();
    const adulterado = new Uint8Array(bytes); adulterado[adulterado.length - 3] ^= 0x01;
    await expect(decifrarBackup(adulterado, 'senha-forte-123')).rejects.toThrow();
    await expect(decifrarBackup(new Uint8Array([1, 2, 3]), 'x')).rejects.toThrow();
    expect(await decifrarBackup(bytes, 'senha-forte-123')).toBe('{"tabelas":{}}');
  });
  it('estado do OAuth adulterado ou de outra chave é recusado', async () => {
    const k1 = criarCripto(btoa('a'.repeat(32))), k2 = criarCripto(btoa('b'.repeat(32)));
    const e = await k1.assinarEstado({ u: 'x', x: Date.now() + 60_000 });
    expect(await k1.lerEstado(e)).not.toBeNull();
    expect(await k2.lerEstado(e)).toBeNull();
    expect(await k1.lerEstado(e.slice(0, -2) + (e.endsWith('A') ? 'B' : 'A') + e.slice(-1))).toBeNull();
  });
});

describe('dados pessoais nunca saem para o monitoramento', () => {
  it('remove CPF, e-mail e campos sensíveis em qualquer profundidade', () => {
    const o = limpar({ erro: 'falha para 123.456.789-09 em a@b.com', extra: { pin: '482913', senha: 'x', nested: [{ token: 't', ok: 'sem problema', cpf: '1' }] } });
    const txt = JSON.stringify(o);
    expect(txt).not.toMatch(/123\.456|a@b\.com|482913|"t"/);
    expect(txt).toContain('sem problema');
  });
});

describe('planilhas: nada vira fórmula', () => {
  it('texto começando com = + - @ é gravado como texto', () => {
    const ws = XLSX.utils.aoa_to_sheet([['=HYPERLINK("http://evil","x")', '+cmd|calc', '-2+3', '@SUM(A1)']]);
    for (const c of ['A1', 'B1', 'C1', 'D1']) { expect(ws[c].t, c).toBe('s'); expect(ws[c].f, c).toBeUndefined(); }
  });
});

describe('limitador de taxa', () => {
  it('conta por chave, reinicia na janela e não deixa uma origem bloquear outra', () => {
    let t = 0; const l = criarLimitador(3, 1000, () => t);
    expect([l.tenta('a'), l.tenta('a'), l.tenta('a'), l.tenta('a')]).toEqual([true, true, true, false]);
    expect(l.tenta('b')).toBe(true);
    expect(l.bloqueado('a')).toBe(true); expect(l.bloqueado('b')).toBe(false);
    t = 1001; expect(l.tenta('a')).toBe(true);
  });
  it('a memória não cresce sem limite sob enchente de chaves', () => {
    let t = 0; const l = criarLimitador(1, 10, () => t);
    for (let i = 0; i < 20_000; i++) { t = i; l.tenta(`ip-${i}`); }
    expect(l.tenta('novo')).toBe(true);
  });
});
