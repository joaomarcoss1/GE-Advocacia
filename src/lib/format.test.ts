import { describe, expect, it } from 'vitest';
import { plural } from './format';

describe('plural em português', () => {
  it('singular para 0 e 1, plural a partir de 2', () => {
    expect(plural(1, 'aprovação pendente', 'aprovações pendentes')).toBe('1 aprovação pendente');
    expect(plural(0, 'aprovação pendente', 'aprovações pendentes')).toBe('0 aprovação pendente');
    expect(plural(3, 'aprovação pendente', 'aprovações pendentes')).toBe('3 aprovações pendentes');
  });
});
