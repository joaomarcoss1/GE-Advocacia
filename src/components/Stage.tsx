import type { ReactNode } from 'react';
import { Monograma } from '@/components/Logo';

/** Painel lateral das telas públicas: apenas o monograma e, quando houver, o conteúdo (relógio do ponto). Sem textos de apresentação. */
export default function Stage({ children, escritorio }: { children?: ReactNode; escritorio?: string }) {
  return (
    <section className="stage">
      <span className="stage-mark" aria-hidden="true"><Monograma /></span>
      <div className="stage-mid">
        {children}
        {escritorio && <p className="stage-esc">{escritorio}</p>}
      </div>
    </section>
  );
}
