import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, LogOut, RefreshCw } from 'lucide-react';
import Stage from '@/components/Stage';
import Credito from '@/components/Nexutec';
import { useAuth } from '@/context/Auth';

/**
 * Porta do ponto: o acesso ao sistema abre com a entrada do dia e fecha com a saída.
 * Esta tela é tudo o que a pessoa vê enquanto isso: nenhum dado do escritório é lido.
 */
export default function AcessoBloqueado() {
  const { sessao, acesso, recarregar, sair } = useAuth();
  const [verificando, setVerificando] = useState(false);
  const [ainda, setAinda] = useState(false);
  if (!sessao || sessao.papel === 'plataforma') return null;
  const encerrado = acesso === 'encerrado';
  const slug = sessao.escritorio?.slug ?? '';

  async function verificar() {
    setVerificando(true); setAinda(false);
    try { const s = await recarregar(); setAinda(!!s && s.acesso !== 'liberado'); } finally { setVerificando(false); }
  }

  return (
    <div className="auth">
      <Stage escritorio={sessao.escritorio?.nome} />
      <main className="auth-side" id="conteudo">
        <div className="auth-card stack passo g-16" data-testid="acesso-bloqueado">
          <div className="row g-10"><Clock size={22} aria-hidden="true" /><h1>{encerrado ? 'Jornada encerrada' : 'Bata o ponto para entrar'}</h1></div>
          <p className="page-sub">
            Olá, <strong>{sessao.nome.split(' ')[0]}</strong>. {encerrado
              ? 'Você registrou a saída de hoje, então o acesso ao sistema foi encerrado. Ele abre de novo na próxima entrada.'
              : 'O acesso ao sistema abre depois do registro de entrada. Registre o ponto e volte aqui: a tela libera sozinha.'}
          </p>
          {!encerrado && <Link to={`/ponto/${slug}`} className="btn block" style={{ minHeight: 48 }}>Ir para a tela de ponto</Link>}
          <button type="button" className={`btn ${encerrado ? '' : 'ghost'} block`} onClick={verificar} disabled={verificando}>
            <RefreshCw size={16} aria-hidden="true" />{verificando ? 'Verificando…' : encerrado ? 'Verificar novamente' : 'Já bati o ponto, verificar'}
          </button>
          <div role="status" aria-live="polite">
            {ainda && <div className="notice warn">{encerrado ? 'Ainda não há uma nova entrada hoje.' : 'Ainda não encontrei a sua entrada de hoje. Confira se o registro foi concluído na tela de ponto.'}</div>}
          </div>
          <p className="hint">Precisa trabalhar fora do horário, como em audiência externa, plantão ou hora extra? Peça à gerência para liberar o seu acesso por um tempo.</p>
          <button type="button" className="btn ghost sm" onClick={() => void sair()}><LogOut size={15} aria-hidden="true" />Sair</button>
        </div>
        <Credito className="credito-pagina" />
      </main>
    </div>
  );
}
