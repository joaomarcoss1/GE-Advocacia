import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Download, ExternalLink, Pencil, RefreshCw, Send, Trash2 } from 'lucide-react';
import { Badge, Modal, useConfirm, useToast, type Tom } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { useAuth } from '@/context/Auth';
import { baixarIcs, linkGoogleAgenda } from '@/lib/agenda';
import { fmtData, isoParaBR } from '@/lib/datetime';
import { AREA_ROTULO, ABERTA, PRIORIDADE_ROTULO, STATUS, TIPO_ROTULO, atrasada, resumoPrazo } from '@/lib/tarefas';
import type { Andamento, GoogleStatus, StatusTarefa, SyncGoogle, Tarefa } from '@/lib/types';

export const tomPrioridade = (p: Tarefa['prioridade']): Tom => (p === 'urgente' ? 'bad' : p === 'alta' ? 'warn' : p === 'baixa' ? 'mute' : '');

export function quando(t: Pick<Tarefa, 'inicio' | 'fim' | 'dia_inteiro'>): string {
  if (!t.inicio) return 'Sem data';
  const i = isoParaBR(t.inicio), f = t.fim ? isoParaBR(t.fim) : null;
  if (t.dia_inteiro) return f && f.data !== i.data ? `${fmtData(i.data)} a ${fmtData(f.data)}` : fmtData(i.data);
  return `${fmtData(i.data)} · ${i.hhmm}${f ? ` – ${f.data !== i.data ? `${fmtData(f.data)} ` : ''}${f.hhmm}` : ''}`;
}

/** Ficha da tarefa: situação, andamentos (histórico imutável) e Google Agenda. */
export default function TarefaDetalhe({ tarefa, google, sync, onClose, onEditar, onMudou }: {
  tarefa: Tarefa; google: GoogleStatus; sync?: SyncGoogle; onClose(): void; onEditar(): void; onMudou(): Promise<void>;
}) {
  const { db, funcionarios, escritorio } = useDados();
  const { sessao } = useAuth();
  const toast = useToast();
  const confirmar = useConfirm();
  const [andamentos, setAndamentos] = useState<Andamento[]>([]);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const nome = (id: string | null) => funcionarios.find(f => f.id === id)?.nome ?? null;
  const podeEditar = sessao?.papel !== 'coordenador' || tarefa.criado_por === sessao.id;
  const link = linkGoogleAgenda(tarefa);

  const carregar = useCallback(async () => { try { setAndamentos(await db.andamentos.list(tarefa.id)); } catch { /* sem histórico */ } }, [db, tarefa.id]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function mudarStatus(status: StatusTarefa) {
    setOcupado(true);
    try {
      await db.tarefas.update(tarefa.id, { status });
      if (sync?.event_id || status === 'cancelada') { try { await (status === 'cancelada' ? db.google.remover(tarefa.id) : db.google.sincronizar(tarefa.id)); } catch { /* o aviso fica no estado da sincronização */ } }
      await onMudou(); await carregar();
    } catch (e) { toast.erro((e as Error).message); } finally { setOcupado(false); }
  }
  async function comentar() {
    if (!texto.trim()) return;
    setOcupado(true);
    try { await db.andamentos.add(tarefa.id, texto); setTexto(''); await carregar(); } catch (e) { toast.erro((e as Error).message); } finally { setOcupado(false); }
  }
  async function excluir() {
    if (!(await confirmar(`Excluir "${tarefa.titulo}"? Os andamentos também serão apagados.`, { perigo: true, rotulo: 'Excluir' }))) return;
    try {
      if (sync?.event_id) { try { await db.google.remover(tarefa.id); } catch { /* segue para a exclusão */ } }
      await db.tarefas.remove(tarefa.id); toast.ok('Excluída.'); await onMudou(); onClose();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function sincronizar() {
    setOcupado(true);
    try { await db.google.sincronizar(tarefa.id); toast.ok('Sincronizado com o Google Agenda.'); await onMudou(); } catch (e) { toast.erro((e as Error).message); } finally { setOcupado(false); }
  }
  async function tirarDaAgenda() {
    setOcupado(true);
    try { await db.google.remover(tarefa.id); toast.ok('Removido do Google Agenda.'); await onMudou(); } catch (e) { toast.erro((e as Error).message); } finally { setOcupado(false); }
  }

  const prazo = resumoPrazo(tarefa);
  return (
    <Modal titulo={tarefa.titulo} onClose={onClose} largo
      rodape={podeEditar ? <><button className="btn ghost" onClick={excluir}><Trash2 size={16} />Excluir</button><button className="btn" onClick={onEditar}><Pencil size={16} />Editar</button></> : undefined}>
      <div className="stack">
        <div className="row" style={{ gap: 8 }}>
          <Badge tom="gold">{TIPO_ROTULO[tarefa.tipo]}</Badge>
          {tarefa.prazo_fatal && <Badge tom="bad">Prazo fatal</Badge>}
          <Badge tom={tomPrioridade(tarefa.prioridade)}>{PRIORIDADE_ROTULO[tarefa.prioridade]}</Badge>
          {tarefa.area && <Badge tom="mute">{AREA_ROTULO[tarefa.area]}</Badge>}
          {prazo && <Badge tom={atrasada(tarefa) ? 'bad' : 'mute'}>{prazo}</Badge>}
        </div>

        <dl className="ficha">
          <div><dt>Quando</dt><dd>{quando(tarefa)}</dd></div>
          {tarefa.local && <div><dt>Local</dt><dd>{/^https?:\/\//i.test(tarefa.local) ? <a href={tarefa.local} target="_blank" rel="noopener noreferrer">{tarefa.local}</a> : tarefa.local}</dd></div>}
          {tarefa.processo_numero && <div><dt>Processo</dt><dd className="mono">{tarefa.processo_numero}</dd></div>}
          {tarefa.cliente && <div><dt>Cliente</dt><dd>{tarefa.cliente}</dd></div>}
          <div><dt>Responsável</dt><dd>{nome(tarefa.responsavel_id) ?? '—'}</dd></div>
          {tarefa.revisor_id && <div><dt>Revisor</dt><dd>{nome(tarefa.revisor_id)}</dd></div>}
          {tarefa.participantes.length > 0 && <div><dt>Participantes</dt><dd>{tarefa.participantes.map(nome).filter(Boolean).join(', ')}</dd></div>}
          <div><dt>Delegado por</dt><dd>{tarefa.criado_por_nome ?? '—'}</dd></div>
        </dl>
        {tarefa.descricao && <p style={{ whiteSpace: 'pre-wrap' }}>{tarefa.descricao}</p>}

        {podeEditar && (
          <label className="field-inline">
            <span>Situação</span>
            <select className="select" value={tarefa.status} disabled={ocupado} onChange={e => mudarStatus(e.target.value as StatusTarefa)}>
              {STATUS.map(s => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
            </select>
          </label>
        )}

        {tarefa.inicio && (
          <section className="bloco-agenda" aria-label="Agenda">
            <div className="row" style={{ gap: 8 }}>
              {link && <a className="btn ghost sm" href={link} target="_blank" rel="noopener noreferrer"><CalendarPlus size={16} />Adicionar ao Google Agenda<ExternalLink size={13} /></a>}
              <button className="btn ghost sm" onClick={() => baixarIcs([tarefa], escritorio.nome, 'compromisso.ics')}><Download size={16} />Baixar .ics</button>
              {google.conectado && ABERTA(tarefa.status) && (
                <button className="btn sm" onClick={sincronizar} disabled={ocupado}><RefreshCw size={16} />{sync?.event_id ? 'Atualizar na minha agenda' : 'Marcar na minha agenda'}</button>
              )}
              {google.conectado && sync?.event_id && <button className="btn ghost sm" onClick={tirarDaAgenda} disabled={ocupado}>Remover da agenda</button>}
            </div>
            {sync?.event_id && !sync.erro && <p className="hint">Sincronizado em {sync.sync_em ? `${fmtData(isoParaBR(sync.sync_em).data)} ${isoParaBR(sync.sync_em).hhmm}` : '—'}. Os envolvidos recebem o convite por e-mail.</p>}
            {sync?.erro && <p className="hint" style={{ color: 'var(--bad)' }}>Não sincronizou: {sync.erro}</p>}
          </section>
        )}

        <section aria-label="Andamentos">
          <div className="section-title" style={{ marginBottom: 10 }}>Andamentos</div>
          <ol className="andamentos">
            {andamentos.length === 0 && <li className="muted">Nenhum andamento.</li>}
            {andamentos.map(a => (
              <li key={a.id} className={a.tipo}>
                <div>{a.texto}</div>
                <small>{a.autor_nome} · {fmtData(isoParaBR(a.created_at).data)} {isoParaBR(a.created_at).hhmm}</small>
              </li>
            ))}
          </ol>
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'nowrap' }}>
            <input className="input" aria-label="Novo andamento" placeholder="Registrar andamento" value={texto} maxLength={2000} onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void comentar(); } }} />
            <button className="btn" onClick={comentar} disabled={ocupado || !texto.trim()} aria-label="Registrar andamento"><Send size={16} /></button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
