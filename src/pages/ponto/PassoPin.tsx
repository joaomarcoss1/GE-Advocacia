import { ArrowLeft, Delete } from 'lucide-react';
import type { Ponto } from './usePonto';

/** Etapa 2: teclado numérico para o PIN pessoal. */
export default function PassoPin({ p }: { p: Ponto }) {
  if (!p.pessoa) return null;
  const { pin, setPin } = p;
  const primeiro = p.pessoa.nome.split(' ')[0];
  return (
    <div className="stack g-18" >
      <div>
        <span className="eyebrow">Olá, {primeiro}</span>
        <h1>Digite seu PIN</h1>
      </div>
      <div className="pin-dots" role="img" aria-label={`${pin.length} dígitos digitados`}>
        {Array.from({ length: Math.max(6, pin.length) }).map((_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      {p.erro && <div className="notice bad" role="alert">{p.erro}</div>}
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <button key={d} onClick={() => setPin(x => (x.length < 8 ? x + d : x))}>{d}</button>)}
        <button className="aux" onClick={() => setPin('')}>Limpar</button>
        <button onClick={() => setPin(x => (x.length < 8 ? x + '0' : x))}>0</button>
        <button className="aux" aria-label="Apagar" onClick={() => setPin(x => x.slice(0, -1))}><Delete size={22} /></button>
      </div>
      <button className="btn block" style={{ minHeight: 50 }} disabled={pin.length < 4 || p.enviando} onClick={p.validarPin}>{p.enviando ? 'Verificando…' : 'Continuar'}</button>
      <button className="btn ghost block" onClick={p.voltar}><ArrowLeft size={16} />Não sou eu</button>
    </div>
  );
}
