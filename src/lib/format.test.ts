import { describe, expect, it } from 'vitest';
import { plural } from './format';

describe('plural em português', () => {
  it('singular só para 1; 0 e 2 ou mais no plural', () => {
    expect(plural(1, 'aprovação pendente', 'aprovações pendentes')).toBe('1 aprovação pendente');
    expect(plural(0, 'aprovação pendente', 'aprovações pendentes')).toBe('0 aprovações pendentes');
    expect(plural(3, 'aprovação pendente', 'aprovações pendentes')).toBe('3 aprovações pendentes');
  });
});
