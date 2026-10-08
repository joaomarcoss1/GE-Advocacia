import { describe, expect, it } from 'vitest';
import { criarLimitador, ipDe } from '../../supabase/functions/_shared/limite';

describe('limitador de tentativas', () => {
  it('permite até o máximo na janela e bloqueia depois', () => {
    let t = 1000;
    const l = criarLimitador(3, 60_000, () => t);
    expect([l.tenta('a'), l.tenta('a'), l.tenta('a'), l.tenta('a')]).toEqual([true, true, true, false]);
    expect(l.bloqueado('a')).toBe(true);
    expect(l.tenta('b')).toBe(true);                 // outra chave não é afetada
    expect(l.bloqueado('b')).toBe(false);
  });
  it('a janela expira e a contagem recomeça', () => {
    let t = 0;
    const l = criarLimitador(2, 1000, () => t);
    l.tenta('x'); l.tenta('x'); expect(l.tenta('x')).toBe(false);
    t = 1001;
    expect(l.bloqueado('x')).toBe(false);
    expect(l.tenta('x')).toBe(true);
  });
  it('consultar não gasta tentativa', () => {
    const l = criarLimitador(1, 1000, () => 0);
    expect(l.bloqueado('k')).toBe(false); expect(l.bloqueado('k')).toBe(false);
    expect(l.tenta('k')).toBe(true);
    expect(l.bloqueado('k')).toBe(true);
  });
  it('lê o IP de quem chamou', () => {
    expect(ipDe(new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } }))).toBe('203.0.113.9');
    expect(ipDe(new Request('http://x', { headers: { 'cf-connecting-ip': '198.51.100.2', 'x-forwarded-for': '1.1.1.1' } }))).toBe('198.51.100.2');
    expect(ipDe(new Request('http://x'))).toBe('desconhecido');
  });
});
