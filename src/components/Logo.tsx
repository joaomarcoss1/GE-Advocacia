/** Marca do GE Advocacia: monograma "GE" em latão sobre azul-noite + o nome em serifa. */
export function Monograma() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="46" height="46" rx="12" fill="#0f1c2e" stroke="#b08d57" strokeWidth="1.5" />
      <g fill="none" stroke="#d4b886" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" transform="translate(-1.5 0)">
        <path d="M28.5 17.4A10.5 10.5 0 1 0 28.5 30.6V24.2H21" />
        <path d="M43 15.5h-7.5v17H43M35.5 24h6" />
      </g>
    </svg>
  );
}

export default function Logo({ grande, soIcone, rotulo = 'Plataforma administrativa' }: { grande?: boolean; soIcone?: boolean; rotulo?: string }) {
  return (
    <span className={`logo ${grande ? 'grande' : ''} ${soIcone ? 'so-icone' : ''}`}>
      <Monograma />
      <span className="nome"><b>GE Advocacia</b><i>{rotulo}</i></span>
    </span>
  );
}
