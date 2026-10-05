import type { ReactNode } from 'react';
import { BookOpen, Gavel, Landmark, Scale } from 'lucide-react';
import { Monograma, MonogramaLinha } from '@/components/Logo';
import Credito from '@/components/Nexutec';

/** Régua do relógio: 120 marcas, uma longa a cada 5 (o ponteiro de minutos do "bisel"). Calculada uma vez. */
const MARCAS = Array.from({ length: 120 }, (_, i) => {
  const a = (i * 3 * Math.PI) / 180, longa = i % 5 === 0, r1 = 96, r2 = longa ? 89 : 92.5;
  return { x1: 100 + r1 * Math.sin(a), y1: 100 - r1 * Math.cos(a), x2: 100 + r2 * Math.sin(a), y2: 100 - r2 * Math.cos(a), longa };
});
/** Pontos de luz: posição, tamanho, duração e atraso (variáveis CSS). */
const PONTOS = [[8, 18, 3, 11, 0], [18, 62, 2, 9, -3], [27, 34, 2, 13, -6], [34, 80, 3, 10, -2], [45, 12, 2, 12, -8], [56, 70, 2, 8, -1], [63, 26, 3, 14, -5], [72, 54, 2, 9, -7],
  [80, 14, 2, 10, -4], [88, 40, 3, 12, -9], [92, 76, 2, 11, -2], [15, 88, 2, 13, -6], [50, 90, 3, 9, -3], [76, 90, 2, 12, -10], [4, 50, 2, 10, -5]];
const SATELITES = [{ Ic: Scale, cls: 'a' }, { Ic: Landmark, cls: 'b' }, { Ic: Gavel, cls: 'c' }, { Ic: BookOpen, cls: 'd' }];

/** Painel lateral das telas públicas: arte de fundo (bisel de relógio, monograma em linha, aura, pontos de luz, colunas), marca, conteúdo (relógio do ponto) e crédito. Sem textos de apresentação. */
export default function Stage({ children, escritorio }: { children?: ReactNode; escritorio?: string }) {
  const comConteudo = !!(children || escritorio);
  return (
    <section className={`stage ${comConteudo ? 'com-conteudo' : 'livre'}`}>
      <div className="stage-arte" aria-hidden="true">
        <span className="arte-grade" />
        <span className="arte-feixe" />
        <div className="arte-palco">
          <span className="arte-aura" />
          <svg className="arte-bezel" viewBox="0 0 200 200" focusable="false">
            <circle cx="100" cy="100" r="97.5" fill="none" strokeWidth=".4" />
            <circle cx="100" cy="100" r="80" fill="none" strokeWidth=".3" strokeDasharray="1 4.2" />
            {MARCAS.map((m, i) => <line key={i} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} strokeWidth={m.longa ? 0.9 : 0.4} />)}
          </svg>
          <span className="arte-aneis"><i /><i /></span>
          <MonogramaLinha />
          {SATELITES.map(({ Ic, cls }) => <span key={cls} className={`arte-sat ${cls}`}><Ic strokeWidth={1.4} /></span>)}
        </div>
        <span className="arte-particulas">{PONTOS.map(([x, y, s, d, t], i) => <i key={i} style={{ '--x': `${x}%`, '--y': `${y}%`, '--s': `${s}px`, '--d': `${d}s`, '--t': `${t}s` } as React.CSSProperties} />)}</span>
        <span className="arte-cantos"><i /><i /><i /><i /></span>
        <span className="arte-colunas">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
        <span className="arte-fio"><i /></span>
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
