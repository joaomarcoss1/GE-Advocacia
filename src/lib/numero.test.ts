import { describe, expect, it } from 'vitest';
import { formatarNumero, lerNumero } from './numero';

describe('números digitados', () => {
  it('lê formatos brasileiros', () => {
    expect(lerNumero('1.234,56')).toBe(1234.56);
    expect(lerNumero('R$ 6.000,00')).toBe(6000);
    expect(lerNumero('1234,5')).toBe(1234.5);
    expect(lerNumero('1234.5')).toBe(1234.5);
    expect(lerNumero('1.500')).toBe(1500);
    expect(lerNumero('1.234.567')).toBe(1234567);
    expect(lerNumero('12%')).toBe(12);
    expect(lerNumero('0')).toBe(0);
  });
  it('vazio e lixo viram null', () => {
    expect(lerNumero('')).toBeNull();
    expect(lerNumero('abc')).toBeNull();
    expect(lerNumero('1,2,3')).toBeNull();
  });
  it('formata para o campo', () => {
    expect(formatarNumero(1234.5)).toBe('1234,5');
    expect(formatarNumero(10)).toBe('10');
    expect(formatarNumero(0.125, 2)).toBe('0,13');
  });
});
