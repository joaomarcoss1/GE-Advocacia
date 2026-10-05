import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import Stage from '@/components/Stage';
import { useAuth } from '@/context/Auth';
import { DEMO_ESCRITORIOS, DEMO_PLATAFORMA } from '@/data/seed';

export default function Login() {
  const { sessao, carregando, entrar, modo } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (!carregando && sessao) return <Navigate to={sessao.papel === 'plataforma' ? '/plataforma' : '/painel'} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(''); setEnviando(true);
    try { const s = await entrar(email, senha); nav(s.papel === 'plataforma' ? '/plataforma' : '/painel'); }
    catch (x) { setErro((x as Error).message); }
    finally { setEnviando(false); }
  }

  return (
    <div className="auth">
      <Stage />
      <section className="auth-side">
        <form className="auth-card stack passo" style={{ gap: 18 }} onSubmit={enviar}>
          <div>
            <h1>Entrar</h1>
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <div style={{ position: 'relative' }}>
              <Mail size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--faint)' }} />
              <input id="email" className="input" style={{ paddingLeft: 42 }} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <div style={{ position: 'relative' }}>
              <Lock size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--faint)' }} />
              <input id="senha" className="input" style={{ paddingLeft: 42, paddingRight: 46 }} type={ver ? 'text' : 'password'} autoComplete="current-password" required value={senha} onChange={e => setSenha(e.target.value)} />
              <button type="button" className="icon-btn" style={{ position: 'absolute', right: 4, top: 4 }} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVer(v => !v)}>{ver ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>
          {erro && <div className="notice bad" role="alert">{erro}</div>}
          <button className="btn block" style={{ minHeight: 48 }} disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
          {modo === 'local' && (
            <div className="demo-banner" data-testid="demo-contas">
              <strong>Demonstração</strong>
              <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                <button type="button" className="btn ghost sm" onClick={() => { setEmail(DEMO_PLATAFORMA.email); setSenha(DEMO_PLATAFORMA.senha); }}>Plataforma · {DEMO_PLATAFORMA.email}</button>
                {DEMO_ESCRITORIOS.map(e => (
                  <div key={e.slug} className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn ghost sm grow" onClick={() => { setEmail(e.admin.email); setSenha(e.admin.senha); }}>{e.nome} · administrador</button>
                    <button type="button" className="btn ghost sm" onClick={() => { setEmail(e.gerente.email); setSenha(e.gerente.senha); }}>gerência</button>
                    <button type="button" className="btn ghost sm" onClick={() => { setEmail(e.coordenador.email); setSenha(e.coordenador.senha); }}>coordenação</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
        <Link to="/" className="auth-link"><ArrowLeft size={15} />Voltar ao início</Link>
      </section>
    </div>
  );
}
