export const brl = (n: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
export const num = (n: number, casas = 0) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n);
export const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
export const minParaHoras = (min: number) => {
  const m = Math.abs(Math.round(min));
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
};
export function mascaraCpf(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
export function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}
/** Plural em português: plural(1, 'aprovação', 'aprovações') → "1 aprovação"; plural(3, …) → "3 aprovações" (0 também no singular, como se fala). */
export const plural = (n: number, singular: string, plural_: string) => `${n} ${n === 1 || n === 0 ? singular : plural_}`;
export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
