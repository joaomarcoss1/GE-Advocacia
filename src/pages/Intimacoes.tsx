import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Inbox, RefreshCw, Search } from 'lucide-react';
import { Badge, Field, Kpi, Modal, PageHeader, Vazio, useToast, type Tom } from '@/components/ui';
import ProcessoModal from '@/components/ProcessoModal';
import { useDados } from '@/context/Dados';
import { brParaIso, fmtData } from '@/lib/datetime';
import { calcularPrazo, type RegimePrazo } from '@/lib/processos';
import { parseOab } from '@/lib/intimacoes';
import { semAcento } from '@/lib/format';
import type { Intimacao, IntimacoesSync, StatusIntimacao } from '@/lib/types';

const STATUS: Record<StatusIntimacao, { rotulo: string; tom: Tom }> = { nova: { rotulo: 'Nova', tom: 'warn' }, lida: { rotulo: 'Lida', tom: 'mute' }, tratada: { rotulo: 'Tratada', tom: 'ok' }, descartada: { rotulo: 'Descartada', tom: 'mute' } };
type Filtro = 'pendentes' | 'todas' | 'tratadas' | 'descartadas';
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Caixa de intimações do DJEN (CNJ): o que foi publicado para os advogados do escritório, com prazo sugerido e tarefa. */
export default function Intimacoes() {
  const { db, processos, funcionarios, agora } = useDados();
  const toast = useToast();
  const [lista, setLista] = useState<Intimacao[]>([]);
  const [sync, setSync] = useState<IntimacoesSync | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('pendentes');
  const [busca, setBusca] = useState('');
  const [tribunal, setTribunal] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  const carregar = useCallback(async () => {
    const [l, s] = await Promise.all([db.intimacoes.list().catch(() => []), db.intimacoes.sync().catch(() => null)]);
    setLista(l); setSync(s); setCarregado(true);
  }, [db]);
  useEffect(() => { void carregar(); }, [carregar]);

  const oabsCadastradas = useMemo(() => funcionarios.filter(f => !f.data_desligamento && parseOab(f.oab)).length, [funcionarios]);
  const hoje = agora.data;
  const pendentes = lista.filter(i => i.status === 'nova' || i.status === 'lida');
  const novas = lista.filter(i => i.status === 'nova').length;
  const urgentes = pendentes.filter(i => i.prazo_fim && dias(hoje, i.prazo_fim) <= 5).length;
  const semProcesso = pendentes.filter(i => !i.processo_id && i.numero_processo).length;
  const tribunais = useMemo(() => [...new Set(lista.map(i => i.tribunal))].sort(), [lista]);

  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    return lista.filter(i => {
      if (filtro === 'pendentes' && !(i.status === 'nova' || i.status === 'lida')) return false;
      if (filtro === 'tratadas' && i.status !== 'tratada') return false;
      if (filtro === 'descartadas' && i.status !== 'descartada') return false;
      if (tribunal && i.tribunal !== tribunal) return false;
      return !q || semAcento(`${i.numero_processo ?? ''} ${i.orgao ?? ''} ${i.classe ?? ''} ${i.texto}`).includes(q);
    }).sort((a, b) => (a.prazo_fim && b.prazo_fim ? a.prazo_fim.localeCompare(b.prazo_fim) : a.prazo_fim ? -1 : b.prazo_fim ? 1 : 0) || b.data_disponibilizacao.localeCompare(a.data_disponibilizacao));
  }, [lista, filtro, busca, tribunal]);

  async function buscarAgora() {
    setBuscando(true);
    try {
      const r = await db.intimacoes.buscar(15);
      if (r.erros) toast.erro(r.mensagem || 'A busca teve erros.'); else toast.ok(r.novas ? `${r.novas} intimação(ões) nova(s)${r.tarefas ? `, ${r.tarefas} tarefa(s) criada(s)` : ''}.` : r.mensagem || 'Nenhuma intimação nova.');
      await carregar();
    } catch (e) { toast.erro((e as Error).message); } finally { setBuscando(false); }
  }
  const atual = aberta ? lista.find(i => i.id === aberta) ?? null : null;

  return (
    <>
      <PageHeader titulo="Intimações">
        <button className="btn gold" onClick={buscarAgora} disabled={buscando}><RefreshCw size={17} className={buscando ? 'girar' : ''} />{buscando ? 'Buscando…' : 'Buscar no DJEN'}</button>
      </PageHeader>
      <div className="grid c4" style={{ marginBottom: 18 }}>
        <Kpi label="Novas" valor={novas} alerta={novas > 0} icone={<Inbox />} />
        <Kpi label="Prazo em até 5 dias" valor={urgentes} alerta={urgentes > 0} />
        <Kpi label="Sem processo cadastrado" valor={semProcesso} />
        <Kpi label="Advogados monitorados" valor={oabsCadastradas} dica={sync ? `Última busca: ${fmtData(sync.executada_em.slice(0, 10))}` : 'Ainda não buscou'} />
      </div>
      {oabsCadastradas === 0 && <div className="cartao-integracao" style={{ marginBottom: 14 }}><strong>Cadastre a OAB dos advogados.</strong> Em Funcionários, preencha o campo OAB com número e UF (ex.: OAB/MA 12345). O sistema busca no Diário de Justiça Eletrônico Nacional tudo o que for publicado para esses números.</div>}
      {sync && sync.erros > 0 && <div className="cartao-integracao" style={{ marginBottom: 14 }}><strong>A última busca teve problema:</strong> {sync.mensagem}</div>}

      <div className="card">
        <div className="filtros" style={{ padding: '14px 20px 0' }}>
          <div className="seg" role="tablist" aria-label="Situação">
            {([['pendentes', `Pendentes (${pendentes.length})`], ['tratadas', 'Tratadas'], ['descartadas', 'Descartadas'], ['todas', 'Todas']] as [Filtro, string][]).map(([id, r]) => (
              <button key={id} role="tab" aria-selected={filtro === id} className={filtro === id ? 'on' : ''} onClick={() => setFiltro(id)}>{r}</button>
            ))}
          </div>
          <div className="search-field grow" style={{ minWidth: 200 }}><Search size={18} className="lead" /><input aria-label="Buscar intimação" placeholder="Processo, órgão ou texto" value={busca} onChange={e => setBusca(e.target.value)} /></div>
          {tribunais.length > 1 && <select className="select" style={{ maxWidth: 160 }} aria-label="Tribunal" value={tribunal} onChange={e => setTribunal(e.target.value)}><option value="">Todos os tribunais</option>{tribunais.map(t => <option key={t} value={t}>{t}</option>)}</select>}
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Publicada</th><th>Processo</th><th>Intimação</th><th>Prazo</th><th>Situação</th></tr></thead>
            <tbody>
              {visiveis.map(i => {
                const d = i.prazo_fim ? dias(hoje, i.prazo_fim) : null;
                return (
                  <tr key={i.id} className="clicavel" onClick={() => setAberta(i.id)}>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtData(i.data_disponibilizacao)}<div className="muted" style={{ fontSize: '.78rem' }}>{i.tribunal}</div></td>
                    <td><button className="link-linha" onClick={e => { e.stopPropagation(); setAberta(i.id); }}><strong className="mono">{i.numero_processo ?? '—'}</strong></button>
                      <div className="muted" style={{ fontSize: '.84rem' }}>{processos.find(p => p.id === i.processo_id)?.titulo ?? (i.processo_id ? '' : 'Processo não cadastrado')}</div></td>
                    <td><strong>{i.tipo_comunicacao}</strong>{i.tipo_documento ? ` · ${i.tipo_documento}` : ''}<div className="muted resumo-intimacao">{i.texto.slice(0, 160)}</div></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{i.prazo_fim ? <><span>{fmtData(i.prazo_fim)}</span><div><Badge tom={d! < 0 ? 'bad' : d! <= 5 ? 'warn' : 'mute'}>{d! < 0 ? `venceu há ${-d!} d` : d === 0 ? 'vence hoje' : `em ${d} d`}</Badge></div></> : <span className="muted">{i.exige_providencia ? 'definir' : '—'}</span>}</td>
                    <td><Badge tom={STATUS[i.status].tom}>{STATUS[i.status].rotulo}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {carregado && lista.length === 0 && <Vazio tipo="ok" titulo="Nenhuma intimação ainda">{oabsCadastradas ? 'Use "Buscar no DJEN" para trazer as publicações dos últimos 15 dias. Depois, a busca roda sozinha todos os dias.' : 'Cadastre a OAB dos advogados em Funcionários para começar.'}</Vazio>}
          {lista.length > 0 && visiveis.length === 0 && <Vazio tipo="busca" titulo="Nada com esses filtros" />}
        </div>
      </div>
      {atual && <Detalhe i={atual} onClose={() => setAberta(null)} aoMudar={carregar} />}
    </>
  );
}

function Detalhe({ i, onClose, aoMudar }: { i: Intimacao; onClose(): void; aoMudar(): Promise<void> }) {
  const { db, processos, funcionarios, feriados, clientes, recarregar } = useDados();
  const toast = useToast();
  const proc = processos.find(p => p.id === i.processo_id) ?? null;
  const cliente = proc?.cliente_id ? clientes.find(c => c.id === proc.cliente_id)?.nome ?? null : null;
  const [prazoDias, setPrazoDias] = useState(i.prazo_dias ?? 15);
  const [regime, setRegime] = useState<RegimePrazo>((i.prazo_regime as RegimePrazo | null) ?? 'uteis');
  const [responsavel, setResponsavel] = useState(i.responsavel_id ?? proc?.responsavel_id ?? '');
  const [fatal, setFatal] = useState(false);
  const [cadastrar, setCadastrar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const calc = useMemo(() => (prazoDias > 0 ? calcularPrazo({ marco: i.data_disponibilizacao, tipo: 'disponibilizacao', dias: prazoDias, regime, feriados: new Set(feriados.map(f => f.data)) }) : null), [prazoDias, regime, i.data_disponibilizacao, feriados]);

  async function mudar(status: StatusIntimacao, extra: Partial<Intimacao> = {}) {
    setOcupado(true);
    try { await db.intimacoes.update(i.id, { status, ...extra }); await aoMudar(); } catch (e) { toast.erro((e as Error).message); } finally { setOcupado(false); }
  }
  async function criarTarefa() {
    if (!calc) return;
    setOcupado(true);
    try {
      const inicio = brParaIso(calc.vencimento, '00:00');
      const t = await db.tarefas.insert({
        tipo: 'prazo', titulo: `Intimação: ${i.classe || i.tipo_comunicacao} — ${proc?.titulo || i.numero_processo || i.tribunal}`.slice(0, 200),
        descricao: [`${i.tipo_comunicacao}${i.tipo_documento ? ` — ${i.tipo_documento}` : ''} (${i.tribunal}${i.orgao ? ` · ${i.orgao}` : ''})`, `Disponibilizada em ${fmtData(i.data_disponibilizacao)}.`, '', i.texto.slice(0, 700), '',
          `Prazo: ${prazoDias} dias ${regime === 'uteis' ? 'úteis' : 'corridos'}, vencendo em ${fmtData(calc.vencimento)}. Sugestão pela regra geral (CPC e Lei 11.419): confira no ato.`].join('\n').slice(0, 3900),
        prioridade: 'alta', area: proc?.area ?? null, cliente, processo_id: proc?.id ?? null, processo_numero: i.numero_processo, inicio, fim: inicio, dia_inteiro: true, prazo_fatal: fatal,
        lembrete_min: 1440, responsavel_id: responsavel || null, participantes: [],
      });
      await db.intimacoes.update(i.id, { status: 'tratada', tarefa_id: t.id, prazo_dias: prazoDias, prazo_regime: regime, prazo_fim: calc.vencimento, responsavel_id: responsavel || null });
      toast.ok('Prazo lançado em Tarefas e na Agenda.'); await recarregar(); await aoMudar(); onClose();
    } catch (e) { toast.erro((e as Error).message); setOcupado(false); }
  }

  return (
    <>
      <Modal titulo="Intimação" onClose={onClose} largo rodape={<>
        {i.status !== 'descartada' && <button className="btn ghost" disabled={ocupado} onClick={() => void mudar('descartada')}>Descartar</button>}
        {(i.status === 'tratada' || i.status === 'descartada') && <button className="btn ghost" disabled={ocupado} onClick={() => void mudar('nova')}>Reabrir</button>}
        {i.status === 'nova' && <button className="btn ghost" disabled={ocupado} onClick={() => void mudar('lida')}>Marcar como lida</button>}
        {(i.status === 'nova' || i.status === 'lida') && <button className="btn ghost" disabled={ocupado} onClick={() => void mudar('tratada')}>Tratada, sem tarefa</button>}
        {(i.status === 'nova' || i.status === 'lida') && <button className="btn gold" disabled={ocupado || !calc} onClick={criarTarefa}>Lançar prazo em Tarefas</button>}
      </>}>
        <div className="stack">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Badge tom={STATUS[i.status].tom}>{STATUS[i.status].rotulo}</Badge><Badge tom="mute">{i.tribunal}</Badge><Badge tom="gold">{i.tipo_comunicacao}</Badge>
            {i.cancelada && <Badge tom="bad">Cancelada pelo tribunal</Badge>}{i.tarefa_id && <Badge tom="ok">Tarefa criada</Badge>}
          </div>
          <div className="grid c2">
            <div><small className="muted">Processo</small><div><strong className="mono">{i.numero_processo ?? '—'}</strong></div>
              {proc ? <small className="muted">{proc.titulo ?? ''}{cliente ? ` · ${cliente}` : ''}</small> : i.numero_processo ? <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setCadastrar(true)}>Cadastrar este processo</button> : null}</div>
            <div><small className="muted">Órgão · classe</small><div>{i.orgao ?? '—'}</div><small className="muted">{i.classe ?? ''}{i.tipo_documento ? ` · ${i.tipo_documento}` : ''}</small></div>
            <div><small className="muted">Disponibilizada em</small><div>{fmtData(i.data_disponibilizacao)}{i.meio ? ` · ${i.meio === 'D' ? 'Diário eletrônico' : i.meio}` : ''}</div></div>
            <div><small className="muted">Advogados intimados</small><div>{i.advogados.length ? i.advogados.map(a => `${a.nome}${a.oab ? ` (OAB/${a.uf ?? ''} ${a.oab})` : ''}`).join('; ') : '—'}</div></div>
          </div>
          {i.destinatarios.length > 0 && <div><small className="muted">Partes</small><div>{i.destinatarios.map(d => `${d.nome}${d.polo ? ` (${d.polo === 'A' ? 'ativo' : d.polo === 'P' ? 'passivo' : d.polo})` : ''}`).join(' · ')}</div></div>}
          <div><small className="muted">Texto da comunicação</small><pre className="texto-intimacao" tabIndex={0}>{i.texto || '(sem texto)'}</pre></div>
          {i.link && <a className="btn ghost sm" style={{ alignSelf: 'flex-start' }} href={i.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Abrir no sistema do tribunal</a>}
          {(i.status === 'nova' || i.status === 'lida') && (
            <div className="card card-pad stack" aria-label="Prazo">
              <div className="section-title" style={{ margin: 0 }}>Prazo</div>
              <div className="grid c3">
                <Field label="Dias"><input className="input" type="number" min={1} max={365} value={prazoDias} onChange={e => setPrazoDias(Math.max(0, Math.min(365, Number(e.target.value) || 0)))} /></Field>
                <Field label="Contagem"><select className="select" value={regime} onChange={e => setRegime(e.target.value as RegimePrazo)}><option value="uteis">Dias úteis (CPC, art. 219)</option><option value="corridos">Dias corridos</option></select></Field>
                <Field label="Responsável"><select className="select" value={responsavel} onChange={e => setResponsavel(e.target.value)}><option value="">Sem responsável</option>{funcionarios.filter(f => !f.data_desligamento).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></Field>
              </div>
              {calc && <ol className="passos-prazo">{calc.passos.map((p, k) => <li key={k}>{p}</li>)}</ol>}
              <label className="check"><input type="checkbox" checked={fatal} onChange={e => setFatal(e.target.checked)} />Marcar como prazo fatal</label>
              <small className="muted">{i.prazo_dias ? `O texto menciona prazo de ${i.prazo_dias} dias.` : 'O texto não traz prazo claro: confira no despacho.'} Contagem sugerida pela regra geral (disponibilização no DJEN, publicação no 1º dia útil seguinte): o advogado confere no ato (feriados locais, suspensões, prazo em dobro).</small>
            </div>
          )}
        </div>
      </Modal>
      {cadastrar && <ProcessoModal processo={null} padrao={{ numero: i.numero_processo ?? '', orgao_julgador: i.orgao ?? '', classe: i.classe ?? '' }} onClose={() => setCadastrar(false)} onSalvo={async () => { setCadastrar(false); await recarregar(); await aoMudar(); }} />}
    </>
  );
}
