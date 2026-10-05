import { useId } from 'react';
import { ARCO_EXTERNO, ARCO_INTERNO, LETRA_E, LETRA_G, LINHA_BASE, LOGO_MIOLO } from './logoPaths';

/**
 * Marca do GE Advocacia: pórtico em arco (a porta do fórum) com o monograma "GE" em serifa dourada sobre azul-safira.
 * O desenho vem de scripts/gerar-logo.py (mesma fonte dos ícones do aplicativo).
 */
export function Monograma() {
  const id = `ge${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // conteúdo estático e confiável gerado no build; só o identificador dos gradientes muda por instância
  return <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: LOGO_MIOLO.replaceAll('GEID', id) }} />;
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
