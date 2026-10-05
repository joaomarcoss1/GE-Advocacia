import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Clock, LogIn } from 'lucide-react';
import Stage from '@/components/Stage';
import { useAuth } from '@/context/Auth';
import { DEMO_ESCRITORIOS } from '@/data/seed';

const K = 'ge.ultimo-escritorio';
const lerUltimo = () => { try { return localStorage.getItem(K) ?? ''; } catch { return ''; } };

/** Página inicial pública: cada escritório tem o seu endereço de ponto (/ponto/<endereço>). */
export default function Inicio() {
  const { modo } = useAuth();
  const nav = useNavigate();
  const [slug, setSlug] = useState(lerUltimo);
  const limpo = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

  function ir(e: FormEvent) {
    e.preventDefault();
    if (!limpo) return;
    try { localStorage.setItem(K, limpo); } catch { /* sem armazenamento */ }
    nav(`/ponto/${limpo}`);
  }

  return (
    <div className="auth">
      <Stage>
        <p className="headline">Cada escritório, <em>um espaço</em> só seu.</p>
      </Stage>
      <section className="auth-side">
        <div className="auth-card stack passo" style={{ gap: 22 }}>
          <div>
            <span className="eyebrow">GE Advocacia</span>
            <h1>Registro de ponto</h1>
            <p className="page-sub" style={{ marginTop: 8 }}>Informe o endereço do seu escritório para registrar o ponto. Se você usa o tablet ou o celular da recepção, o endereço já fica salvo no atalho.</p>
          </div>
          <form onSubmit={ir} className="stack" style={{ gap: 12 }}>
            <div className="field">
              <label htmlFor="slug">Endereço do escritório</label>
              <div className="search-field" style={{ height: 52 }}>
                <span className="muted" style={{ paddingLeft: 14, whiteSpace: 'nowrap' }}>/ponto/</span>
                <input id="slug" autoFocus autoComplete="off" spellCheck={false} placeholder="meu-escritorio" value={slug} onChange={e => setSlug(e.target.value)} />
              </div>
              <span className="hint">Combinado com o administrador do seu escritório. Ex.: silva-ribeiro</span>
            </div>
            <button className="btn gold" style={{ minHeight: 50 }} disabled={!limpo}><Clock size={18} />Ir para o registro de ponto<ArrowRight size={16} /></button>
          </form>
          {modo === 'local' && (
            <div className="demo-banner">
              <strong>Demonstração</strong> · escritórios de exemplo:
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                {DEMO_ESCRITORIOS.map(e => <Link key={e.slug} className="btn ghost sm" to={`/ponto/${e.slug}`}>{e.nome}</Link>)}
              </div>
            </div>
          )}
          <div className="stack" style={{ gap: 4 }}>
            <Link to="/entrar" className="auth-link"><LogIn size={15} />Acesso administrativo <ArrowRight size={15} /></Link>
            <Link to="/verificar" className="auth-link"><BadgeCheck size={15} />Verificar a autenticidade de um documento</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
