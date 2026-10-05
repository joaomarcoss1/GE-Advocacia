import { ArrowRight, Lock, Search, UserSearch, X } from 'lucide-react';
import { iniciais } from '@/lib/format';
import StatusLocal from './StatusLocal';
import type { Ponto } from './usePonto';

/** Etapa 1: o funcionário digita o nome (a busca roda no servidor, só neste escritório). */
export default function PassoPessoa({ p }: { p: Ponto }) {
  const { ctx } = p;
  return (
    <>
      <span className="eyebrow">Registro de ponto</span>
      <h1>Identifique-se</h1>
      <p className="page-sub" style={{ marginTop: 8 }}>Digite seu nome para localizar o seu cadastro.</p>
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
      <p className="hint" style={{ marginTop: 10 }}>{p.tentou && p.termo.length < 3 ? <span style={{ color: 'var(--bad)' }}>Digite ao menos 3 letras para buscar.</span> : 'Mínimo de 3 letras. Não é preciso digitar o nome completo.'}</p>

      {p.termo.length >= 3 ? (
        <div className="results" aria-live="polite">
          <div className="section-title" style={{ marginBottom: 10 }}>{p.buscando ? 'Buscando…' : p.filtradas.length ? `${p.filtradas.length} resultado(s)` : 'Nenhum resultado'}</div>
          {p.filtradas.map(x => (
            <div key={x.id} className="result">
              <span className="avatar">{iniciais(x.nome)}</span>
              <span className="grow"><strong>{x.nome}</strong><br /><span className="muted" style={{ fontSize: '.86rem' }}>{x.cargo_nome ?? 'Equipe'}</span></span>
              <button className="btn sm" onClick={() => p.escolherPessoa(x)}>Selecionar<ArrowRight size={15} /></button>
            </div>
          ))}
          {!p.filtradas.length && !p.buscando && <div className="notice gold">Não encontramos esse nome. Confira a grafia ou procure a gerência para atualizar o seu cadastro.</div>}
        </div>
      ) : (
        <div className="idle">
          <span className="idle-ic"><UserSearch size={26} strokeWidth={1.5} /></span>
          <strong>Encontre o seu cadastro</strong>
          <span className="muted">Depois da busca, você confirma com o seu PIN pessoal e registra a marcação.</span>
        </div>
      )}
      <p className="secure"><Lock size={13} />Acesso protegido por PIN pessoal e intransferível.</p>
    </>
  );
}
