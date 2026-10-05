import type { ReactNode } from 'react';
import Forum from '@/components/Forum';
import { Monograma } from '@/components/Logo';
import Credito from '@/components/Nexutec';

/**
 * Painel lateral das telas públicas, em linguagem clássica de escritório de advocacia: moldura dupla, pórtico de fórum em linha fina,
 * selo da marca com anéis e, no ponto, o relógio. Sem textos de apresentação.
 */
export default function Stage({ children, escritorio }: { children?: ReactNode; escritorio?: string }) {
  const comConteudo = !!(children || escritorio);
  return (
    <section className={`stage ${comConteudo ? 'com-conteudo' : 'livre'}`}>
      <div className="stage-arte" aria-hidden="true">
        <span className="stage-moldura" />
        {!comConteudo && (
          <span className="stage-emblema"><i className="em-anel a" /><i className="em-anel b" /><i className="em-losango n" /><i className="em-losango s" /><i className="em-losango l" /><i className="em-losango o" /><Monograma /></span>
        )}
        {!comConteudo && <span className="stage-fio"><i /></span>}
        <Forum />
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
