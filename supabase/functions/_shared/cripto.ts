/** Cifra dos tokens do Google (AES-GCM) e estado assinado do OAuth (HMAC-SHA256). WebCrypto puro: roda no Deno e no vitest. */
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const deb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deb64url = (s: string) => deb64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

export function criarCripto(chaveBase64: string) {
  const bruta = () => {
    const erro = new Error('GOOGLE_TOKEN_KEY deve ter 32 bytes em base64 (openssl rand -base64 32).');
    let k: Uint8Array;
    try { k = deb64(chaveBase64); } catch { throw erro; }
    if (k.length !== 32) throw erro;
    return k;
  };
  const aes = () => crypto.subtle.importKey('raw', bruta() as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const hmac = async (msg: string) => {
    const k = await crypto.subtle.importKey('raw', bruta() as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg))));
  };
  return {
    async cifrar(texto: string): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(), new TextEncoder().encode(texto)));
      const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length);
      return b64(out);
    },
    async decifrar(dado: string): Promise<string> {
      const b = deb64(dado);
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await aes(), b.slice(12)));
    },
    async assinarEstado(dados: Record<string, unknown>): Promise<string> {
      const corpo = b64url(new TextEncoder().encode(JSON.stringify(dados)));
      return `${corpo}.${await hmac(corpo)}`;
    },
    /** Estado íntegro e dentro da validade (`x` = limite em ms) ou null. */
    async lerEstado<T extends { x: number }>(estado: string): Promise<T | null> {
      const [corpo, sig] = estado.split('.');
      if (!corpo || !sig || (await hmac(corpo)) !== sig) return null;
      try { const d = JSON.parse(new TextDecoder().decode(deb64url(corpo))) as T; return d.x > Date.now() ? d : null; } catch { return null; }
    },
  };
}

/** Token de uso interno (varredura agendada): comparação em tempo constante. */
export function segredoConfere(recebido: string | null, esperado: string | undefined): boolean {
  if (!recebido || !esperado || recebido.length !== esperado.length) return false;
  let r = 0;
  for (let i = 0; i < esperado.length; i++) r |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return r === 0;
}
