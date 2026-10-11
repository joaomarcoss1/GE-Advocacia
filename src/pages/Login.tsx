import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import Stage from '@/components/Stage';
import { useAuth } from '@/context/Auth';
import { DEMO_ESCRITORIOS, DEMO_PLATAFORMA } from '@/data/seed';
import { PAPEIS } from '@/lib/permissoes';
import { esperaRestante, MAX_FALHAS_APARELHO, registrarFalha, textoBloqueio } from '@/lib/limiteLogin';
import Credito from '@/components/Nexutec';
import { InstalarApp } from '@/components/Aplicativo';

const CHAVE_FALHAS = 'ge.login.falhas';
type MapaFalhas = Record<string, number[]>;
const lerFalhas = (): MapaFalhas => { try { return JSON.parse(localStorage.getItem(CHAVE_FALHAS) ?? '{}') as MapaFalhas; } catch { return {}; } };
const gravarFalhas = (m: MapaFalhas) => { try { localStorage.setItem(CHAVE_FALHAS, JSON.stringify(m)); } catch { /* sem armazenamento: o servidor limita de qualquer forma */ } };
/** Espera (ms) por e-mail e por aparelho; o limite de verdade é do servidor, este freio só poupa a conta de tentativas em massa. */
const esperaDe = (email: string) => { const m = lerFalhas(); const agora = Date.now(); return Math.max(esperaRestante(m[email.trim().toLowerCase()] ?? [], agora), esperaRestante(m['*'] ?? [], agora, MAX_FALHAS_APARELHO)); };

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
    const espera = esperaDe(email);
    if (espera > 0) { setErro(textoBloqueio(espera)); return; }
    setErro(''); setEnviando(true);
    try {
      const s = await entrar(email, senha);
      const m = lerFalhas(); delete m[email.trim().toLowerCase()]; gravarFalhas(m);
      nav(s.papel === 'plataforma' ? '/plataforma' : '/painel');
    } catch (x) {
      const m = lerFalhas(); const k = email.trim().toLowerCase(); const agora = Date.now();
      m[k] = registrarFalha(m[k] ?? [], agora); m['*'] = registrarFalha(m['*'] ?? [], agora); gravarFalhas(m);
      setErro((x as Error).message);
    }
    finally { setEnviando(false); }
  }

  return (
    <div className="auth">
      <Stage />
      <main className="auth-side">
        <form className="auth-card stack passo g-18" onSubmit={enviar}>
          <div>
            <h1>Entrar</h1>
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <div className="pos-rel">
              <Mail size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--faint)' }} />
              <input id="email" className="input" style={{ paddingLeft: 42 }} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <div className="pos-rel">
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
              <div className="stack g-6 mt-8" >
                <button type="button" className="btn ghost sm" onClick={() => { setEmail(DEMO_PLATAFORMA.email); setSenha(DEMO_PLATAFORMA.senha); }}>Plataforma · {DEMO_PLATAFORMA.email}</button>
                {DEMO_ESCRITORIOS.map(e => (
                  <div key={e.slug} className="row g-6" >
                    <button type="button" className="btn ghost sm grow" onClick={() => { setEmail(e.admin.email); setSenha(e.admin.senha); }}>{e.nome} · administrador</button>
                    <button type="button" className="btn ghost sm" onClick={() => { setEmail(e.gerente.email); setSenha(e.gerente.senha); }}>gerência</button>
                    <button type="button" className="btn ghost sm" onClick={() => { setEmail(e.coordenador.email); setSenha(e.coordenador.senha); }}>coordenação</button>
                    {e.acessos.map(a => (
                      <button key={a.email} type="button" className="btn ghost sm" onClick={() => { setEmail(a.email); setSenha(a.senha); }}>{PAPEIS[a.papel].rotulo.split(' ')[0].replace('(a)', '')} · {e.equipe[a.func].nome.split(' ')[0]}</button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
        <div className="row g-14" style={{ justifyContent: 'center' }}>
          <Link to="/" className="auth-link"><ArrowLeft size={15} />Voltar ao início</Link>
          <Link to="/privacidade" className="auth-link">Privacidade</Link>
          <Link to="/cookies" className="auth-link">Cookies</Link>
        </div>
        <InstalarApp />
        <Credito className="credito-pagina" />
      </main>
    </div>
  );
}
