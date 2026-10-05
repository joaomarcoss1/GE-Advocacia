import { describe, expect, it } from 'vitest';
import { criarCripto, segredoConfere } from '../../supabase/functions/_shared/cripto';

const CHAVE = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));
describe('cifra dos tokens e estado do OAuth', () => {
  const c = criarCripto(CHAVE);
  it('cifra e decifra; cada cifra é diferente e o texto não aparece', async () => {
    const a = await c.cifrar('1//refresh-token-secreto'), b = await c.cifrar('1//refresh-token-secreto');
    expect(a).not.toBe(b);
    expect(a).not.toContain('refresh');
    expect(await c.decifrar(a)).toBe('1//refresh-token-secreto');
  });
  it('chave errada ou dado adulterado não decifra', async () => {
    const a = await c.cifrar('segredo');
    await expect(criarCripto(btoa(String.fromCharCode(...new Uint8Array(32).fill(9)))).decifrar(a)).rejects.toThrow();
    const adulterado = a.slice(0, -4) + (a.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    await expect(c.decifrar(adulterado)).rejects.toThrow();
  });
  it('chave com tamanho errado é recusada com mensagem clara', async () => {
    await expect(criarCripto('curta').cifrar('x')).rejects.toThrow(/32 bytes/);
  });
  it('estado assinado: íntegro vale; adulterado, de outra chave ou vencido não', async () => {
    const s = await c.assinarEstado({ u: 'usuario-1', e: 'esc-1', x: Date.now() + 60_000 });
    expect(await c.lerEstado<{ u: string; x: number }>(s)).toMatchObject({ u: 'usuario-1' });
    const [corpo, sig] = s.split('.');
    const forjado = btoa(JSON.stringify({ u: 'outro', e: 'esc-1', x: Date.now() + 60_000 })).replace(/=+$/, '');
    expect(await c.lerEstado(`${forjado}.${sig}`)).toBeNull();
    expect(await c.lerEstado(`${corpo}.assinaturafalsa`)).toBeNull();
    expect(await criarCripto(btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))).lerEstado(s)).toBeNull();
    expect(await c.lerEstado(await c.assinarEstado({ u: 'x', x: Date.now() - 1 }))).toBeNull();
    expect(await c.lerEstado('lixo')).toBeNull();
  });
  it('segredo da varredura: igual passa, diferente ou ausente não', () => {
    expect(segredoConfere('abc123', 'abc123')).toBe(true);
    expect(segredoConfere('abc124', 'abc123')).toBe(false);
    expect(segredoConfere('abc', 'abc123')).toBe(false);
    expect(segredoConfere(null, 'abc123')).toBe(false);
    expect(segredoConfere('abc123', undefined)).toBe(false);
  });
});
