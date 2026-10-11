import { describe, expect, it } from 'vitest';
import { esperaRestante, JANELA_MS, MAX_FALHAS, MAX_FALHAS_APARELHO, registrarFalha, textoBloqueio } from './limiteLogin';

describe('freio de tentativas de login', () => {
  it('libera até a quarta falha e trava na quinta, até a mais antiga sair da janela de 10 minutos', () => {
    let f: number[] = []; const t0 = 1_000_000;
    for (let i = 0; i < MAX_FALHAS - 1; i++) { f = registrarFalha(f, t0 + i * 1000); expect(esperaRestante(f, t0 + i * 1000)).toBe(0); }
    f = registrarFalha(f, t0 + 4000);
    expect(esperaRestante(f, t0 + 4000)).toBeGreaterThan(JANELA_MS - 5000);
    expect(esperaRestante(f, t0 + JANELA_MS - 1)).toBeGreaterThan(0);
    expect(esperaRestante(f, t0 + JANELA_MS + 1)).toBe(0);                 // a mais antiga das cinco saiu da janela
  });
  it('falhas antigas saem da conta', () => {
    let f: number[] = []; for (let i = 0; i < 4; i++) f = registrarFalha(f, i);
    f = registrarFalha(f, JANELA_MS + 10);
    expect(esperaRestante(f, JANELA_MS + 10)).toBe(0);
  });
  it('o limite do aparelho é maior e conta qualquer e-mail', () => {
    let f: number[] = []; const t0 = 5_000_000;
    for (let i = 0; i < MAX_FALHAS_APARELHO - 1; i++) f = registrarFalha(f, t0 + i);
    expect(esperaRestante(f, t0 + 20, MAX_FALHAS_APARELHO)).toBe(0);
    f = registrarFalha(f, t0 + 30);
    expect(esperaRestante(f, t0 + 31, MAX_FALHAS_APARELHO)).toBeGreaterThan(0);
  });
  it('o texto não revela se o e-mail existe', () => { expect(textoBloqueio(61_000)).toMatch(/2 min/); expect(textoBloqueio(1)).not.toMatch(/existe|cadastrad/); });
});
