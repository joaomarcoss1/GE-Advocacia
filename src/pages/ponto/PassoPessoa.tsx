import { ArrowRight, Search, X } from 'lucide-react';
import { iniciais, plural } from '@/lib/format';
import StatusLocal from './StatusLocal';
import type { Ponto } from './usePonto';

/** Etapa 1: o funcionário digita o nome (a busca roda no servidor, só neste escritório). */
export default function PassoPessoa({ p }: { p: Ponto }) {
  const { ctx } = p;
  return (
    <>
      <h1>Identifique-se</h1>
      {p.cerca && ctx && <StatusLocal local={p.local} raio={ctx.ponto.geofence_raio_m} onVerificar={p.checarLocal} />}
      {p.modo === 'local' && <span className="badge gold" style={{ marginTop: 12 }}>Modo demonstração · dados fictícios</span>}

      <form className="search" role="search" onSubmit={e => { e.preventDefault(); p.buscar(); }}>
        <div className="search-field">
          <Search size={20} className="lead" />
          <input autoFocus autoComplete="off" spellCheck={false} placeholder="Nome ou sobrenome" value={p.busca}
            onChange={e => { p.setBusca(e.target.value); p.setTentou(false); }} aria-label="Digite seu nome" />
          {p.busca && <button type="button" className="clear" aria-label="Limpar busca" onClick={() => { p.setBusca(''); p.setTentou(false); }}><X size={17} /></button>}
        </div>
        <button className="btn gold" type="submit">Buscar</button>
      </form>
      {p.tentou && p.termo.length < 3 && <p className="hint" style={{ marginTop: 10, color: 'var(--bad)' }}>Digite ao menos 3 letras para buscar.</p>}

      {p.termo.length >= 3 ? (
        <div className="results" aria-live="polite">
          <div className="section-title" style={{ marginBottom: 10 }}>{p.buscando ? 'Buscando…' : p.filtradas.length ? `${plural(p.filtradas.length, 'resultado', 'resultados')}` : 'Nenhum resultado'}</div>
          {p.filtradas.map(x => (
            <div key={x.id} className="result">
              <span className="avatar">{iniciais(x.nome)}</span>
              <span className="grow"><strong>{x.nome}</strong><br /><span className="muted" style={{ fontSize: '.86rem' }}>{x.cargo_nome ?? 'Equipe'}</span></span>
              <button className="btn sm" onClick={() => p.escolherPessoa(x)}>Selecionar<ArrowRight size={15} /></button>
            </div>
          ))}
          {!p.filtradas.length && !p.buscando && <div className="notice gold">Não encontramos esse nome. Confira a grafia ou procure a gerência para atualizar o seu cadastro.</div>}
        </div>
      ) : null}
    </>
  );
}
