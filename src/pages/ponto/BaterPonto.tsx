import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Check, LockKeyhole, Maximize2, Minimize2 } from 'lucide-react';
import Stage from '@/components/Stage';
import { dataExtensa } from '@/lib/datetime';
import PainelPonto from './PainelPonto';
import PassoPessoa from './PassoPessoa';
import PassoPin from './PassoPin';
import { usePonto } from './usePonto';

function Etapas({ atual }: { atual: 1 | 2 | 3 }) {
  const itens = ['Identificação', 'PIN', 'Registro'];
  return (
    <ol className="steps" aria-label="Etapas do registro">
      {itens.map((rot, i) => (
        <li key={rot} className={i + 1 < atual ? 'done' : i + 1 === atual ? 'on' : ''} aria-current={i + 1 === atual ? 'step' : undefined}>
          <span className="n">{i + 1 < atual ? <Check size={13} strokeWidth={3} /> : i + 1}</span>{rot}
        </li>
      ))}
    </ol>
  );
}

/** Tela pública de ponto de UM escritório: /ponto/<endereço>. */
export default function BaterPonto() {
  const { slug = '' } = useParams();
  const p = usePonto(slug);
  const [hh, mm] = p.agora.hhmm.split(':');

  if (p.falhaEsc) {
    return (
      <div className="auth">
        <Stage rodape="Plataforma multiescritório" />
        <section className="auth-side">
          <div className="auth-card stack passo" style={{ gap: 16 }}>
            <span className="eyebrow">Registro de ponto</span>
            <h1>{p.falhaEsc === 'ESCRITORIO_SUSPENSO' ? 'Acesso suspenso' : 'Escritório não encontrado'}</h1>
            <p className="page-sub">{p.falhaEsc === 'ESCRITORIO_SUSPENSO'
              ? 'O acesso deste escritório está suspenso. Fale com o administrador.'
              : `Não existe um escritório com o endereço "${slug}". Confira o endereço combinado com o administrador.`}</p>
            <Link to="/" className="btn ghost">Informar outro endereço<ArrowRight size={16} /></Link>
          </div>
        </section>
      </div>
    );
  }
  if (p.carregando || !p.ctx) return <div className="auth"><Stage /><section className="auth-side" aria-busy="true"><span className="sr-only">Carregando…</span></section></div>;

  return (
    <div className={`auth ${p.quiosque ? 'quiosque' : ''}`}>
      <button type="button" className="icon-btn q-toggle no-print" style={{ color: 'var(--muted)' }} onClick={p.alternarQuiosque} aria-pressed={p.quiosque}
        aria-label={p.quiosque ? 'Sair do modo quiosque' : 'Ativar modo quiosque (tela cheia para tablet)'} title={p.quiosque ? 'Sair do modo quiosque' : 'Modo quiosque'}>{p.quiosque ? <Minimize2 /> : <Maximize2 />}</button>
      <Stage escritorio={p.ctx.escritorio_nome} rodape={p.ctx.escritorio_nome}>
        <div aria-label={`Hora atual ${p.agora.hhmm}`}>
          <div className="hora"><span key={hh} className="tick">{hh}</span><span className="sep">:</span><span key={mm} className="tick">{mm}</span></div>
          <div className="dia">{dataExtensa(p.agora.iso)}</div>
          {p.ctx.feriado && <span className="feriado">Feriado · {p.ctx.feriado}</span>}
        </div>
      </Stage>

      <section className="auth-side">
        <div className="auth-card">
          <Etapas atual={p.etapa === 'pessoa' ? 1 : p.etapa === 'pin' ? 2 : 3} />
          <div key={p.etapa} className="passo">
            {p.etapa === 'pessoa' && <PassoPessoa p={p} />}
            {p.etapa === 'pin' && <PassoPin p={p} />}
            {p.etapa === 'painel' && <PainelPonto p={p} />}
          </div>
        </div>
        <div className="row" style={{ gap: 4, justifyContent: 'center' }}>
          <Link to="/entrar" className="auth-link">Acesso administrativo <ArrowRight size={15} /></Link>
          <Link to={`/privacidade/${slug}`} className="auth-link"><LockKeyhole size={14} />Privacidade</Link>
        </div>
      </section>
    </div>
  );
}
