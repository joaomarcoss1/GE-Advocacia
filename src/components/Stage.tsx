import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Logo from '@/components/Logo';

const DESTAQUES = [
  { t: 'Cada escritório no seu espaço', d: 'Equipe, ponto e folha totalmente separados: um escritório nunca enxerga os dados de outro.' },
  { t: 'Registro de ponto por PIN', d: 'Entrada, intervalo e saída no celular ou no tablet da recepção, com cerca de GPS opcional.' },
  { t: 'Folha por diária, com rastro', d: 'Faltas, abonos e atestados apurados automaticamente, com auditoria de cada alteração.' },
];
const INTERVALO = 5500;

/** Painel lateral das telas públicas (ponto e login): marca, fundo com colunas que reagem ao cursor e destaques rotativos. */
export default function Stage({ children, rodape = 'Plataforma multiescritório', escritorio }: { children?: ReactNode; rodape?: string; escritorio?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [ativo, setAtivo] = useState(0);
  const [pausa, setPausa] = useState(false);
  // Respeita "reduzir movimento": sem troca automática de destaques (WCAG 2.2.2); pausa também com foco do teclado.
  const [reduz] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const parado = pausa || reduz;

  useEffect(() => {
    if (parado) return;
    const t = setTimeout(() => setAtivo(a => (a + 1) % DESTAQUES.length), INTERVALO);
    return () => clearTimeout(t);
  }, [ativo, parado]);

  function mover(e: React.PointerEvent<HTMLElement>) {
    const el = ref.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', String((e.clientX - r.left) / r.width));
    el.style.setProperty('--my', String((e.clientY - r.top) / r.height));
  }
  function soltar() {
    ref.current?.style.removeProperty('--mx');
    ref.current?.style.removeProperty('--my');
  }

  return (
    <section className="stage" ref={ref} onPointerMove={mover} onPointerLeave={soltar}>
      <div className="stage-bg" aria-hidden="true">
        <span className="luz" />
        {Array.from({ length: 7 }).map((_, k) => <i key={k} className="coluna" style={{ '--k': k } as CSSProperties} />)}
        <svg className="marca-dagua" viewBox="0 0 48 48" focusable="false">
          <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M28.5 17.4A10.5 10.5 0 1 0 28.5 30.6V24.2H21" />
            <path d="M43 15.5h-7.5v17H43M35.5 24h6" />
          </g>
        </svg>
      </div>

      <header className="stage-top">
        <Logo rotulo={escritorio ?? 'Plataforma administrativa'} />
        <span className="stage-rule" aria-hidden="true" />
      </header>

      <div className="stage-mid">{children}</div>

      <footer className="stage-bottom" onPointerEnter={() => setPausa(true)} onPointerLeave={() => setPausa(false)} onFocus={() => setPausa(true)} onBlur={() => setPausa(false)}>
        <div className="destaques" aria-live="off">
          {DESTAQUES.map((x, k) => (
            <article key={x.t} className={k === ativo ? 'on' : ''} aria-hidden={k !== ativo}>
              <h3>{x.t}</h3>
              <p>{x.d}</p>
            </article>
          ))}
        </div>
        <div className="barras" role="tablist" aria-label="Destaques do sistema">
          {DESTAQUES.map((x, k) => (
            <button key={x.t} role="tab" aria-selected={k === ativo} aria-label={x.t} className={k === ativo ? 'on' : ''} onClick={() => setAtivo(k)}>
              <span style={k === ativo && !parado ? { animationDuration: `${INTERVALO}ms` } : undefined} />
            </button>
          ))}
        </div>
        <div className="stage-foot">{rodape}</div>
      </footer>
    </section>
  );
}
