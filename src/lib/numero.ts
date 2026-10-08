/** Lê um número digitado em português ("1.234,56", "1234,5", "1234.5", "12%"). Vazio ou inválido vira null. */
export function lerNumero(texto: string): number | null {
  let t = texto.trim().replace(/[R$\s%]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '');
  else if (/^\d{1,3}\.\d{3}$/.test(t)) t = t.replace('.', '');   // "1.500" é mil e quinhentos
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
/** Número para exibir no campo (vírgula decimal, sem milhar, sem zeros sobrando). */
export const formatarNumero = (n: number, casas = 2): string => (Number.isFinite(n) ? String(Math.round(n * 10 ** casas) / 10 ** casas).replace('.', ',') : '');
