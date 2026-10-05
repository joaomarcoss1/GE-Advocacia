/**
 * Crédito discreto de desenvolvimento. Marca PROVISÓRIA: para usar a logo oficial da Nexutec, troque somente o <svg> abaixo
 * (use `currentColor` no preenchimento para que ela acompanhe o tema claro/escuro).
 */
export function MarcaNexutec() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" focusable="false" className="nx-marca">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17V5l12 12V5" /></g>
    </svg>
  );
}

export default function Credito({ className = '' }: { className?: string }) {
  return (
    <p className={`credito ${className}`.trim()}>
      <span>Desenvolvido por</span>
      <span className="credito-marca"><MarcaNexutec /><b>Nexutec</b></span>
    </p>
  );
}
