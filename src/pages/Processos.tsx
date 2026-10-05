import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, BellRing, FolderOpen, Plus, RefreshCw, Scale, Search } from 'lucide-react';
import { Abas, Badge, Kpi, PageHeader, Vazio, useToast, type Tom } from '@/components/ui';
import ClienteModal from '@/components/ClienteModal';
import Dossie from '@/components/Dossie';
import { Modal } from '@/components/ui';
import ProcessoDetalhe, { dataHora } from '@/components/ProcessoDetalhe';
import ProcessoModal from '@/components/ProcessoModal';
import { useDados } from '@/context/Dados';
import { semAcento } from '@/lib/format';
import { CATEGORIA_ROTULO } from '@/lib/processos';
import { AREAS, AREA_ROTULO } from '@/lib/tarefas';
import type { Cliente, Processo, SituacaoProcesso } from '@/lib/types';

type Aba = 'novidades' | 'processos' | 'clientes';
const TOM: Record<string, Tom> = { sentenca: 'bad', decisao: 'warn', intimacao: 'warn', citacao: 'bad', audiencia: 'warn', despacho: 'gold', transito: 'gold' };
const SEMANA = 7 * 86_400_000;

export default function Processos() {
  const { db, processos, clientes, funcionarios, novidades, recarregar } = useDados();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [aba, setAba] = useState<Aba>((params.get('aba') as Aba) || (novidades.length ? 'novidades' : 'processos'));
  const [busca, setBusca] = useState('');
  const [resp, setResp] = useState('');
  const [situacao, setSituacao] = useState<SituacaoProcesso | 'todos'>('ativo');
  const [area, setArea] = useState('');
  const [soNovos, setSoNovos] = useState(false);
  const [novo, setNovo] = useState(false);
  const [novoCliente, setNovoCliente] = useState<Cliente | 'novo' | null>(null);
  const [dossieDe, setDossieDe] = useState<Cliente | null>(null);
  const [aberto, setAberto] = useState<{ id: string; aba?: 'andamentos' | 'documentos' } | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const cli = (id: string | null) => clientes.find(c => c.id === id) ?? null;
  const nomeResp = (id: string | null) => funcionarios.find(f => f.id === id)?.nome ?? null;
  const novosPor = useMemo(() => { const m = new Map<string, number>(); for (const n of novidades) m.set(n.processo_id, (m.get(n.processo_id) ?? 0) + 1); return m; }, [novidades]);
  const ativos = processos.filter(p => p.situacao === 'ativo');
  const exigemAcao = novidades.filter(n => n.exige_acao).length;
  const semConsulta = ativos.filter(p => p.monitorar && (!p.ultima_consulta || Date.now() - Date.parse(p.ultima_consulta) > SEMANA)).length;

  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    return processos.filter(p => {
      if (situacao !== 'todos' && p.situacao !== situacao) return false;
      if (resp && p.responsavel_id !== resp) return false;
      if (area && p.area !== area) return false;
      if (soNovos && !novosPor.has(p.id)) return false;
      if (q && !semAcento(`${p.numero} ${p.titulo ?? ''} ${cli(p.cliente_id)?.nome ?? ''} ${p.classe ?? ''} ${p.parte_contraria ?? ''}`).includes(q)) return false;
      return true;
    }).sort((a, b) => (b.ultima_movimentacao_em ?? b.created_at).localeCompare(a.ultima_movimentacao_em ?? a.created_at));
  }, [processos, busca, resp, situacao, area, soNovos, novosPor]); // eslint-disable-line react-hooks/exhaustive-deps

  async function atualizarTodos() {
    setAtualizando(true);
    try {
      const r = await db.processos.consultarTodos();
      toast.ok(r.erros ? `${r.erros} processo(s) não puderam ser consultados.` : r.novos ? `${r.novos} andamento(s) novo(s)${r.tarefas ? ` · ${r.tarefas} tarefa(s) criada(s)` : ''}.` : 'Nenhum andamento novo.');
      await recarregar();
    } catch (e) { toast.erro((e as Error).message); } finally { setAtualizando(false); }
  }
  function mudarAba(a: Aba) { setAba(a); setParams(a === 'novidades' && !novidades.length ? {} : { aba: a }, { replace: true }); }

  return (
    <>
      <PageHeader titulo="Processos">
        <button className="btn ghost" onClick={atualizarTodos} disabled={atualizando}><RefreshCw size={17} />{atualizando ? 'Consultando…' : 'Atualizar andamentos'}</button>
        <button className="btn gold" onClick={() => setNovo(true)}><Plus size={18} />Novo processo</button>
      </PageHeader>

      <div className="grid c4" style={{ marginBottom: 18 }}>
        <Kpi label="Processos ativos" valor={ativos.length} icone={<Scale />} />
        <Kpi label="Andamentos novos" valor={novidades.length} icone={<BellRing />} />
        <Kpi label="Exigem ação" valor={exigemAcao} alerta={exigemAcao > 0} icone={<AlertTriangle />} />
        <Kpi label="Sem consulta há 7+ dias" valor={semConsulta} alerta={semConsulta > 0} />
      </div>

      <div className="card">
        <div style={{ padding: '0 12px' }}>
          <Abas valor={aba} onChange={mudarAba} itens={[{ id: 'novidades', rotulo: 'Novidades', contagem: novidades.length }, { id: 'processos', rotulo: 'Processos' }, { id: 'clientes', rotulo: 'Clientes' }]} />
        </div>

        {aba === 'novidades' && (
          <div className="card-pad">
            {novidades.length === 0 ? <Vazio tipo="ok" titulo="Tudo em dia" /> : (
              <ul className="novidades">
                {novidades.map(n => {
                  const p = processos.find(x => x.id === n.processo_id);
                  if (!p) return null;
                  return (
                    <li key={n.id} className="novidade">
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 8 }}><Badge tom={TOM[n.categoria] ?? 'mute'}>{CATEGORIA_ROTULO[n.categoria]}</Badge><strong>{n.nome}</strong>{n.tarefa_id && <Badge tom="ok">Tarefa criada</Badge>}</div>
                        {n.complemento && <div className="muted">{n.complemento}</div>}
                        <small className="muted">{p.titulo || p.numero} · <span className="mono">{p.numero}</span> · {cli(p.cliente_id)?.nome ?? 'Sem cliente'} · {dataHora(n.data_hora)}</small>
                      </div>
                      <button className="btn sm" onClick={() => setAberto({ id: p.id })}>Abrir processo</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {aba === 'processos' && (
          <>
            <div className="filtros">
              <div className="search-field grow" style={{ minWidth: 220 }}>
                <Search size={18} className="lead" />
                <input aria-label="Buscar processos" placeholder="Número, apelido ou cliente" value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <select className="select" aria-label="Responsável" value={resp} onChange={e => setResp(e.target.value)}><option value="">Todos os responsáveis</option>{funcionarios.filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
              <select className="select" aria-label="Área" value={area} onChange={e => setArea(e.target.value)}><option value="">Todas as áreas</option>{AREAS.map(a => <option key={a.id} value={a.id}>{a.rotulo}</option>)}</select>
              <select className="select" aria-label="Situação" value={situacao} onChange={e => setSituacao(e.target.value as SituacaoProcesso | 'todos')}>
                <option value="ativo">Ativos</option><option value="suspenso">Suspensos</option><option value="arquivado">Arquivados</option><option value="encerrado">Encerrados</option><option value="todos">Todos</option>
              </select>
              <label className="check"><input type="checkbox" checked={soNovos} onChange={e => setSoNovos(e.target.checked)} />Só com novidades</label>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Processo</th><th>Cliente</th><th>Responsável</th><th>Último andamento</th><th /></tr></thead>
                <tbody>
                  {lista.map((p: Processo) => (
                    <tr key={p.id} className="clicavel" onClick={() => setAberto({ id: p.id })}>
                      <td><button className="link-linha" onClick={e => { e.stopPropagation(); setAberto({ id: p.id }); }}><strong>{p.titulo || p.numero}</strong></button><div className="muted mono" style={{ fontSize: '.8rem' }}>{p.numero}{p.area ? ` · ${AREA_ROTULO[p.area]}` : ''}</div></td>
                      <td>{cli(p.cliente_id)?.nome ?? '—'}</td>
                      <td>{nomeResp(p.responsavel_id) ?? '—'}</td>
                      <td>{p.ultima_movimentacao_em ? dataHora(p.ultima_movimentacao_em) : <span className="muted">—</span>}{!p.monitorar && <> <Badge tom="mute">sem acompanhamento</Badge></>}</td>
                      <td className="right">{novosPor.get(p.id) ? <Badge tom="warn">{novosPor.get(p.id)} novo(s)</Badge> : p.situacao !== 'ativo' ? <Badge tom="mute">{p.situacao}</Badge> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {processos.length === 0 && <Vazio tipo="documento" titulo="Nenhum processo cadastrado" acao={{ rotulo: 'Cadastrar o primeiro processo', onClick: () => setNovo(true) }} />}
              {processos.length > 0 && lista.length === 0 && <Vazio tipo="busca" titulo="Nenhum resultado" />}
            </div>
          </>
        )}

        {aba === 'clientes' && (
          <>
            <div className="filtros"><div className="grow" /><button className="btn gold sm" onClick={() => setNovoCliente('novo')}><Plus size={16} />Novo cliente</button></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Cliente</th><th>Tipo</th><th>Contato</th><th className="num">Processos</th><th /></tr></thead>
                <tbody>
                  {[...clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(c => (
                    <tr key={c.id}>
                      <td><button className="link-linha" onClick={() => setNovoCliente(c)}><strong>{c.nome}</strong></button>{!c.ativo && <> <Badge tom="mute">inativo</Badge></>}</td>
                      <td>{c.tipo === 'pj' ? 'Pessoa jurídica' : 'Pessoa física'}</td>
                      <td className="muted">{[c.email, c.telefone].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="num">{processos.filter(p => p.cliente_id === c.id).length}</td>
                      <td className="right"><button className="btn ghost sm" onClick={() => setDossieDe(c)}><FolderOpen size={15} />Documentos</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {clientes.length === 0 && <Vazio tipo="pessoas" titulo="Nenhum cliente cadastrado" acao={{ rotulo: 'Cadastrar o primeiro cliente', onClick: () => setNovoCliente('novo') }} />}
            </div>
          </>
        )}
      </div>

      {novo && <ProcessoModal processo={null} onClose={() => setNovo(false)} onSalvo={async p => { setNovo(false); await recarregar(); setAba('processos'); setAberto({ id: p.id }); }} />}
      {novoCliente && <ClienteModal cliente={novoCliente === 'novo' ? null : novoCliente} onClose={() => setNovoCliente(null)} onSalvo={async () => { setNovoCliente(null); await recarregar(); }} />}
      {dossieDe && <Modal titulo={`Documentos — ${dossieDe.nome}`} onClose={() => setDossieDe(null)} largo><Dossie clienteId={dossieDe.id} aoMudar={() => void recarregar()} /></Modal>}
      {aberto && <ProcessoDetalhe processoId={aberto.id} aba={aberto.aba} onClose={() => setAberto(null)} aoMudar={() => void recarregar()} />}
    </>
  );
}
