/** Número único de processo (Resolução CNJ 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO, com dígito verificador (módulo 97). */

const soDigitos = (s: string) => s.replace(/\D/g, '');

/** Devolve o número com máscara se tiver 20 dígitos e dígito verificador correto; senão, null. Espelha `public.cnj_normalizar`. */
export function normalizarCnj(entrada: string | null | undefined): string | null {
  const d = soDigitos(entrada ?? '');
  if (d.length !== 20) return null;
  // valor = NNNNNNN AAAA JTR OOOO DD  (o DD sai do meio e vai para o fim); válido se valor mod 97 == 1
  const valor = BigInt(d.slice(0, 7) + d.slice(9, 13) + d.slice(13, 16) + d.slice(16, 20) + d.slice(7, 9));
  if (valor % 97n !== 1n) return null;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

/** Calcula o dígito verificador (2 dígitos) para os demais campos; usado em testes e dados de demonstração. */
export function digitoCnj(sequencial: string, ano: string, jtr: string, origem: string): string {
  const base = BigInt(sequencial.padStart(7, '0') + ano + jtr + origem.padStart(4, '0') + '00');
  return String(98n - (base % 97n)).padStart(2, '0');
}

/** Monta um número válido a partir dos campos (demonstração/testes). */
export function montarCnj(sequencial: string, ano: string, jtr: string, origem: string): string {
  const dd = digitoCnj(sequencial, ano, jtr, origem);
  const n = sequencial.padStart(7, '0') + dd + ano + jtr + origem.padStart(4, '0');
  return normalizarCnj(n) as string;
}

/** Aplica a máscara enquanto a pessoa digita (sem validar). */
export function mascararCnj(entrada: string): string {
  const d = soDigitos(entrada).slice(0, 20);
  const partes = [d.slice(0, 7), d.slice(7, 9), d.slice(9, 13), d.slice(13, 14), d.slice(14, 16), d.slice(16, 20)];
  let out = partes[0];
  if (partes[1]) out += `-${partes[1]}`;
  if (partes[2]) out += `.${partes[2]}`;
  if (partes[3]) out += `.${partes[3]}`;
  if (partes[4]) out += `.${partes[4]}`;
  if (partes[5]) out += `.${partes[5]}`;
  return out;
}
