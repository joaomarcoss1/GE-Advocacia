import { useId } from 'react';
import { ARCO_EXTERNO, ARCO_INTERNO, LETRA_E, LETRA_G, LINHA_BASE } from './logoPaths';

/**
 * Marca do GE Advocacia: pórtico em arco (a porta do fórum) com o monograma "GE" em serifa, em latão sobre azul-noite.
 * Os contornos vêm de scripts/gerar-logo.py; `simples` tira os filetes finos para tamanhos pequenos.
 */
export function Monograma({ simples }: { simples?: boolean }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}b`} gradientUnits="userSpaceOnUse" x1="14" y1="14" x2="50" y2="52"><stop offset="0" stopColor="#f6e7bf" /><stop offset=".5" stopColor="#d9b97e" /><stop offset="1" stopColor="#b08d57" /></linearGradient>
        <radialGradient id={`${id}f`} cx=".3" cy=".15" r="1"><stop offset="0" stopColor="#1b2f4d" /><stop offset=".6" stopColor="#0f1c2e" /><stop offset="1" stopColor="#0a1422" /></radialGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id}f)`} />
      <g fill="none" stroke={`url(#${id}b)`}>
        <path d={ARCO_EXTERNO} strokeWidth={simples ? 1.3 : 0.9} />
        {!simples && <path d={ARCO_INTERNO} strokeWidth=".4" strokeOpacity=".7" />}
        <path d={LINHA_BASE} strokeWidth={simples ? 1.3 : 0.9} />
      </g>
      <g fill={`url(#${id}b)`}><path d={LETRA_G} /><path d={LETRA_E} /></g>
    </svg>
  );
}

export default function Logo({ grande, soIcone, rotulo = '' }: { grande?: boolean; soIcone?: boolean; rotulo?: string }) {
  return (
    <span className={`logo ${grande ? 'grande' : ''} ${soIcone ? 'so-icone' : ''}`}>
      <Monograma />
      <span className="nome"><b>GE Advocacia</b>{rotulo && <i>{rotulo}</i>}</span>
    </span>
  );
}

/** Desenho de linha grande da marca, usado como arte de fundo (os traços "se desenham" ao carregar). */
export function MonogramaLinha() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="arte-ge">
      <g fill="none" stroke="currentColor" strokeWidth=".16" strokeLinecap="round" strokeLinejoin="round">
        {[ARCO_EXTERNO, ARCO_INTERNO, LINHA_BASE, LETRA_G, LETRA_E].map((d, i) => <path key={i} d={d} pathLength={1} />)}
      </g>
    </svg>
  );
}
