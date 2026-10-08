/**
 * Limitador de tentativas por chave (normalmente o IP) em janela fixa. Fica na memória do processo da função: é uma barreira
 * "melhor esforço" contra tentativas em massa (adivinhar links, inundar envios), somada aos limites do próprio Supabase.
 */
export function criarLimitador(max: number, janelaMs: number, agora: () => number = Date.now) {
  const mapa = new Map<string, { n: number; ate: number }>();
  const limpar = (t: number) => { if (mapa.size > 5000) for (const [k, v] of mapa) if (v.ate <= t) mapa.delete(k); };
  return {
    /** Conta uma tentativa; devolve false quando a chave passou do limite na janela atual. */
    tenta(chave: string): boolean {
      const t = agora(); limpar(t);
      const e = mapa.get(chave);
      if (!e || e.ate <= t) { mapa.set(chave, { n: 1, ate: t + janelaMs }); return max >= 1; }
      e.n++;
      return e.n <= max;
    },
    /** Só consulta (não conta): a chave já estourou o limite? */
    bloqueado(chave: string): boolean {
      const e = mapa.get(chave);
      return !!e && e.ate > agora() && e.n >= max;
    },
  };
}

/** Endereço de quem chamou (cabeçalhos da borda do Supabase/Cloudflare). */
export const ipDe = (req: Request): string => (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'desconhecido').trim() || 'desconhecido';
