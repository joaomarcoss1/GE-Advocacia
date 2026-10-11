import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, LogOut } from 'lucide-react';
import Stage from '@/components/Stage';
import Medidor from '@/components/Medidor';
import Credito from '@/components/Nexutec';
import { useAuth } from '@/context/Auth';
import { getDb } from '@/data/db';
import { validarSenha } from '@/lib/seguranca';

/** Primeira entrada com a senha provisória: a pessoa define a própria senha antes de ver qualquer dado. */
export default function TrocarSenha() {
  const { sessao, recarregar, sair } = useAuth();
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  if (!sessao) return null;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const problema = validarSenha(nova) || (nova !== confirma ? 'As senhas não são iguais.' : '');
    if (problema) { setErro(problema); return; }
    setErro(''); setEnviando(true);
    try { await (await getDb()).auth.trocarSenha(nova); await recarregar(); }
    catch (x) { setErro((x as Error).message); }
    finally { setEnviando(false); }
  }

  return (
    <div className="auth">
      <Stage escritorio={sessao.escritorio?.nome} />
      <main className="auth-side" id="conteudo">
        <form className="auth-card stack passo g-16" onSubmit={enviar} data-testid="trocar-senha">
          <div className="row g-10"><KeyRound size={22} aria-hidden="true" /><h1>Crie a sua senha</h1></div>
          <p className="page-sub">A senha que você recebeu é provisória. Defina uma só sua para continuar: no mínimo 10 caracteres, com letras e números.</p>
          <div className="field">
            <label htmlFor="nova">Nova senha</label>
            <div className="pos-rel">
              <input id="nova" className="input" style={{ paddingRight: 46 }} type={ver ? 'text' : 'password'} autoComplete="new-password" required value={nova} onChange={e => setNova(e.target.value)} />
              <button type="button" className="icon-btn" style={{ position: 'absolute', right: 4, top: 4 }} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVer(v => !v)}>{ver ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
            <Medidor senha={nova} />
          </div>
          <div className="field">
            <label htmlFor="confirma">Repita a nova senha</label>
            <input id="confirma" className="input" type={ver ? 'text' : 'password'} autoComplete="new-password" required value={confirma} onChange={e => setConfirma(e.target.value)} />
          </div>
          {erro && <div className="notice bad" role="alert">{erro}</div>}
          <button className="btn block" style={{ minHeight: 48 }} disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar e entrar'}</button>
          <button type="button" className="btn ghost sm" onClick={() => void sair()}><LogOut size={15} aria-hidden="true" />Sair</button>
        </form>
        <Credito className="credito-pagina" />
      </main>
    </div>
  );
}
