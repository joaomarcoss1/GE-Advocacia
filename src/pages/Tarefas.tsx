import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck, Clock3, ListChecks, Plus, Search } from 'lucide-react';
import { Abas, Badge, Kpi, PageHeader, Vazio, useToast } from '@/components/ui';
import TarefaDetalhe, { quando, tomPrioridade } from '@/components/TarefaDetalhe';
import TarefaModal from '@/components/TarefaModal';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { useGoogle } from '@/context/useGoogle';
import { semAcento, iniciais } from '@/lib/format';
import { ABERTA, PRIORIDADE_ROTULO, STATUS, TIPOS, TIPO_ROTULO, atrasada, contar, resumoPrazo } from '@/lib/tarefas';
import type { StatusTarefa, Tarefa, TipoTarefa } from '@/lib/types';

const COLUNAS: StatusTarefa[] = ['a_fazer', 'em_andamento', 'em_revisao', 'concluida'];
const PESO = { urgente: 0, alta: 1, normal: 2, baixa: 3 } as const;
const ordenar = (a: Tarefa, b: Tarefa) => (a.inicio ?? '9999').localeCompare(b.inicio ?? '9999') || PESO[a.prioridade] - PESO[b.prioridade] || a.titulo.localeCompare(b.titulo, 'pt-BR');

export default function Tarefas() {
  const { tarefas, funcionarios, recarregar, db } = useDados();
  const { sessao } = useAuth();
  const google = useGoogle();
  const toast = useToast();
  const [vista, setVista] = useState<'quadro' | 'lista'>('quadro');
  const [busca, setBusca] = useState('');
  const [resp, setResp] = useState('');
  const [tipo, setTipo] = useState<TipoTarefa | ''>('');
  const [minhas, setMinhas] = useState(false);
  const [encerradas, setEncerradas] = useState(false);
  const [edicao, setEdicao] = useState<Tarefa | 'nova' | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  const nome = (id: string | null) => funcionarios.find(f => f.id === id)?.nome ?? null;
  const k = contar(tarefas);
  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    return tarefas.filter(t => {
      if (!encerradas && !ABERTA(t.status) && !(t.status === 'concluida' && t.concluida_em && Date.now() - Date.parse(t.concluida_em) < 14 * 86400_000)) return false;
      if (resp && t.responsavel_id !== resp && t.revisor_id !== resp && !t.participantes.includes(resp)) return false;
      if (tipo && t.tipo !== tipo) return false;
      if (minhas && t.criado_por !== sessao?.id) return false;
      if (q && !semAcento(`${t.titulo} ${t.processo_numero ?? ''} ${t.cliente ?? ''} ${t.descricao ?? ''}`).includes(q)) return false;
      return true;
    }).sort(ordenar);
  }, [tarefas, busca, resp, tipo, minhas, encerradas, sessao]);

  const atual = aberta ? tarefas.find(t => t.id === aberta) ?? null : null;

  async function aposSalvar(t: Tarefa, sincronizar: boolean) {
    setEdicao(null);
    const jaSincronizada = !!google.estados[t.id]?.event_id;
    if (t.inicio && google.status.conectado && (sincronizar || jaSincronizada)) {
      try { await db.google.sincronizar(t.id); toast.ok('Marcado no Google Agenda.'); } catch (e) { toast.erro(`Salvo, mas não sincronizou: ${(e as Error).message}`); }
    }
    await recarregar(); await google.recarregar();
  }
  async function atualizar() { await recarregar(); await google.recarregar(); }

  const cartao = (t: Tarefa) => (
    <button key={t.id} className={`kcard prio-${t.prioridade}`} onClick={() => setAberta(t.id)}>
      <span className="ktop"><Badge tom="gold">{TIPO_ROTULO[t.tipo]}</Badge>{t.prazo_fatal && <Badge tom="bad">Fatal</Badge>}{google.estados[t.id]?.event_id && <span className="gdot" title="Na agenda do Google" aria-label="Na agenda do Google" />}</span>
      <strong className="ktit">{t.titulo}</strong>
      {(t.processo_numero || t.cliente) && <span className="kmeta mono">{t.processo_numero ?? t.cliente}</span>}
      <span className="kbase">
        <span className={atrasada(t) ? 'kprazo bad' : 'kprazo'}>{t.inicio ? `${resumoPrazo(t) || quando(t)}` : 'Sem data'}</span>
        {t.responsavel_id && <span className="avatar sm" title={nome(t.responsavel_id) ?? ''} aria-label={`Responsável: ${nome(t.responsavel_id)}`}>{iniciais(nome(t.responsavel_id) ?? '?')}</span>}
      </span>
    </button>
  );

  return (
    <>
      <PageHeader titulo="Tarefas">
        <button className="btn gold" onClick={() => setEdicao('nova')}><Plus size={18} />Delegar</button>
      </PageHeader>

      <div className="grid c4" style={{ marginBottom: 18 }}>
        <Kpi label="Abertas" valor={k.abertas} icone={<ListChecks />} />
        <Kpi label="Atrasadas" valor={k.atrasadas} alerta={k.atrasadas > 0} icone={<AlertTriangle />} />
        <Kpi label="Hoje" valor={k.hoje} icone={<Clock3 />} />
        <Kpi label="Próximos 7 dias" valor={k.semana} icone={<CalendarCheck />} />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="filtros">
          <div className="search-field grow" style={{ minWidth: 220 }}>
            <Search size={18} className="lead" />
            <input aria-label="Buscar tarefas" placeholder="Título, processo ou cliente" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <select className="select" aria-label="Responsável" value={resp} onChange={e => setResp(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {funcionarios.filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <select className="select" aria-label="Tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoTarefa | '')}>
            <option value="">Todos os tipos</option>
            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={minhas} onChange={e => setMinhas(e.target.checked)} />Delegadas por mim</label>
          <label className="check"><input type="checkbox" checked={encerradas} onChange={e => setEncerradas(e.target.checked)} />Encerradas</label>
        </div>
        <Abas valor={vista} onChange={setVista} itens={[{ id: 'quadro', rotulo: 'Quadro' }, { id: 'lista', rotulo: 'Lista' }]} />
      </div>

      {tarefas.length === 0 ? (
        <div className="card"><Vazio tipo="calendario" titulo="Nada delegado ainda" acao={{ rotulo: 'Delegar', onClick: () => setEdicao('nova') }} /></div>
      ) : vista === 'quadro' ? (
        <div className="kanban">
          {COLUNAS.map(col => {
            const itens = lista.filter(t => t.status === col);
            return (
              <section key={col} className="kcol" aria-label={STATUS.find(s => s.id === col)?.rotulo}>
                <header><h2>{STATUS.find(s => s.id === col)?.rotulo}</h2><span className="n">{itens.length}</span></header>
                <div className="kcol-lista">{itens.map(cartao)}{!itens.length && <p className="kvazio">—</p>}</div>
              </section>
            );
          })}
          {encerradas && lista.some(t => t.status === 'cancelada') && (
            <section className="kcol" aria-label="Canceladas"><header><h2>Canceladas</h2><span className="n">{lista.filter(t => t.status === 'cancelada').length}</span></header><div className="kcol-lista">{lista.filter(t => t.status === 'cancelada').map(cartao)}</div></section>
          )}
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Título</th><th>Tipo</th><th>Quando</th><th>Responsável</th><th>Prioridade</th><th>Situação</th></tr></thead>
            <tbody>
              {lista.map(t => (
                <tr key={t.id} className="clicavel" onClick={() => setAberta(t.id)}>
                  <td><button className="link-linha" onClick={e => { e.stopPropagation(); setAberta(t.id); }}><strong>{t.titulo}</strong></button>{t.processo_numero && <div className="muted mono" style={{ fontSize: '.8rem' }}>{t.processo_numero}</div>}</td>
                  <td>{TIPO_ROTULO[t.tipo]}</td>
                  <td className={atrasada(t) ? 'bad-text' : ''}>{quando(t)}</td>
                  <td>{nome(t.responsavel_id) ?? '—'}</td>
                  <td><Badge tom={tomPrioridade(t.prioridade)}>{PRIORIDADE_ROTULO[t.prioridade]}</Badge></td>
                  <td>{STATUS.find(s => s.id === t.status)?.rotulo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!lista.length && <Vazio tipo="busca" titulo="Nenhum resultado" />}
        </div>
      )}

      {edicao && <TarefaModal tarefa={edicao === 'nova' ? null : edicao} googleConectado={google.status.conectado} onClose={() => setEdicao(null)} onSalvo={aposSalvar} />}
      {atual && !edicao && (
        <TarefaDetalhe tarefa={atual} google={google.status} sync={google.estados[atual.id]} onClose={() => setAberta(null)} onEditar={() => setEdicao(atual)} onMudou={atualizar} />
      )}
    </>
  );
}
