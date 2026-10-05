/** Monitoramento de erros (Sentry), opcional: sem VITE_SENTRY_DSN nada é carregado nem enviado. */

const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const CHAVES_SENSIVEIS = /pin|cpf|senha|password|token|banco|agencia|conta|pix|salario|authorization|cookie/i;

/** Remove dados pessoais de qualquer estrutura antes de sair do navegador. Exportada para teste. */
export function limpar<T>(valor: T, profundidade = 0): T {
  if (profundidade > 8) return '[…]' as unknown as T;
  if (typeof valor === 'string') return valor.replace(CPF, '[cpf]').replace(EMAIL, '[email]') as unknown as T;
  if (Array.isArray(valor)) return valor.map((v) => limpar(v, profundidade + 1)) as unknown as T;
  if (valor && typeof valor === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      out[k] = CHAVES_SENSIVEIS.test(k) ? '[removido]' : limpar(v, profundidade + 1);
    }
    return out as T;
  }
  return valor;
}

export async function iniciarMonitoramento(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  const Sentry = await import('@sentry/browser');
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    beforeSend: (evento) => limpar(evento),
    beforeBreadcrumb: (b) => limpar(b),
  });
}
