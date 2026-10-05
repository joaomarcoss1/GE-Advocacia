import type { ReactNode } from 'react';
import { Monograma, MonogramaLinha } from '@/components/Logo';
import Credito from '@/components/Nexutec';

/** Painel lateral das telas públicas: arte de fundo (monograma em linha, anéis e colunas), o monograma, o conteúdo (relógio do ponto) e o crédito. Sem textos de apresentação. */
export default function Stage({ children, escritorio }: { children?: ReactNode; escritorio?: string }) {
  const comConteudo = !!(children || escritorio);
  return (
    <section className={`stage ${comConteudo ? 'com-conteudo' : 'livre'}`}>
      <div className="stage-arte" aria-hidden="true">
        <span className="arte-aneis"><i /><i /><i /></span>
        <MonogramaLinha />
        <span className="arte-colunas">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
      </div>
      <span className="stage-mark" aria-hidden="true"><Monograma /></span>
      <div className="stage-mid">
        {children}
        {escritorio && <p className="stage-esc">{escritorio}</p>}
      </div>
      <Credito className="stage-credito" />
    </section>
  );
}
