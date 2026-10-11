/**
 * Freio de tentativas de login, por chave (e-mail) e por aparelho.
 * Pura e testável: o estado é só uma lista de horários de falhas. Barra o preenchimento em massa de senhas;
 * no Supabase o limite de verdade é do servidor (config.toml, [auth.rate_limit]) e este freio só poupa a conta de ataques de teclado.
 */
export const MAX_FALHAS = 5;
export const JANELA_MS = 10 * 60_000;
/** Falhas de QUALQUER e-mail no mesmo aparelho (tentativa de varrer contas). */
export const MAX_FALHAS_APARELHO = 15;

export type Falhas = number[];

const recentes = (f: Falhas, agora: number) => f.filter(t => agora - t < JANELA_MS);

export function registrarFalha(f: Falhas, agora: number): Falhas {
  return [...recentes(f, agora), agora].slice(-(MAX_FALHAS_APARELHO + 5));
}
/** Milissegundos que faltam para tentar de novo (0 = liberado). Cinco falhas em 10 min travam até a mais antiga sair da janela (no máximo 10 min). */
export function esperaRestante(f: Falhas, agora: number, max = MAX_FALHAS): number {
  const r = recentes(f, agora);
  if (r.length < max) return 0;
  return Math.max(0, r[r.length - max] + JANELA_MS - agora);
}
export const minutosAte = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));
export const textoBloqueio = (ms: number) => `Muitas tentativas incorretas. Aguarde ${minutosAte(ms)} min e tente de novo, ou peça a redefinição da senha ao administrador.`;
