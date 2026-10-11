import { useState } from 'react';
import { Link } from 'react-router-dom';

const CHAVE = 'ge.aviso.cookies';
const VERSAO = 'v1';
const lido = () => { try { return localStorage.getItem(CHAVE) === VERSAO; } catch { return true; } };

/** Aviso discreto de armazenamento local (LGPD: transparência). Não bloqueia nada: o sistema só usa o que é necessário. */
export default function AvisoArmazenamento() {
  const [oculto, setOculto] = useState(lido);
  if (oculto) return null;
  const entendi = () => { try { localStorage.setItem(CHAVE, VERSAO); } catch { /* sem armazenamento */ } setOculto(true); };
  return (
    <aside className="aviso-cookies no-print" role="region" aria-label="Aviso sobre cookies e armazenamento" data-testid="aviso-cookies">
      <p>Não usamos cookies de publicidade nem de rastreamento. Guardamos neste aparelho só o necessário para a sua sessão e as suas escolhas. <Link to="/cookies">Política de cookies</Link> · <Link to="/privacidade">Privacidade</Link></p>
      <button type="button" className="btn sm" onClick={entendi}>Entendi</button>
    </aside>
  );
}
