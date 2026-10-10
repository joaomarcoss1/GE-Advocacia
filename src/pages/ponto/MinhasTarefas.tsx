import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, ListChecks } from 'lucide-react';
import { linkGoogleAgenda } from '@/lib/agenda';
import { PONTO_ERRO_MSG } from '@/lib/erros';
import { fmtData, isoParaBR } from '@/lib/datetime';
import { PRIORIDADE_ROTULO, STATUS_ROTULO, TIPO_ROTULO } from '@/lib/tarefas';
import type { StatusTarefa, TarefaFunc } from '@/lib/types';
import type { Ponto } from './usePonto';

const quando = (t: TarefaFunc) => {
  if (!t.inicio) return 'Sem data';
  const i = isoParaBR(t.inicio);
  return t.dia_inteiro ? fmtData(i.data) : `${fmtData(i.data)} · ${i.hhmm}`;
};
const PROXIMO: Partial<Record<StatusTarefa, { status: Exclude<StatusTarefa, 'cancelada'>; rotulo: string }[]>> = {
  a_fazer: [{ status: 'em_andamento', rotulo: 'Iniciar' }],
  em_andamento: [{ status: 'em_revisao', rotulo: 'Enviar para revisão' }, { status: 'concluida', rotulo: 'Concluir' }],
  em_revisao: [{ status: 'em_andamento', rotulo: 'Reabrir' }, { status: 'concluida', rotulo: 'Concluir' }],
};

/** Tarefas, prazos e reuniões delegados à pessoa que acabou de se identificar com o PIN. */
export default function MinhasTarefas({ p }: { p: Ponto }) {
  const [lista, setLista] = useState<TarefaFunc[] | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState('');
  const { api, pessoa, pin } = p;

  const carregar = useCallback(async () => {
    if (!api || !pessoa) return;
    try {
      const r = await api.tarefas(pessoa.id, pin);
      if (r.ok) { setLista(r.tarefas); setErro(''); } else setErro(PONTO_ERRO_MSG[r.erro]);
    } catch (e) { setErro((e as Error).message); setLista([]); }
  }, [api, pessoa, pin]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function mover(t: TarefaFunc, status: Exclude<StatusTarefa, 'cancelada'>) {
    if (!api || !pessoa) return;
    setOcupado(t.id);
    const nota = status === 'concluida' || status === 'em_revisao' ? (window.prompt('Observação para a equipe (opcional):') ?? '') : '';
    const r = await api.atualizarTarefa({ funcionario_id: pessoa.id, pin, id: t.id, status, nota });
    setOcupado('');
    if (!r.ok) setErro(PONTO_ERRO_MSG[r.erro]); else await carregar();
  }

  if (lista === null && !erro) return null;
  if (!erro && lista && lista.length === 0) return null;
  return (
    <div>
      <div className="section-title"><ListChecks size={14} style={{ verticalAlign: 'middle' }} /> Minhas tarefas</div>
      {erro && <div className="notice bad mt-8" role="alert" >{erro}</div>}
      <div className="minhas-tarefas">
        {(lista ?? []).map(t => {
          const link = linkGoogleAgenda(t);
          const acoes = t.papel === 'responsavel' ? PROXIMO[t.status] ?? [] : [];
          return (
            <article key={t.id} className={`mt prio-${t.prioridade} ${t.status === 'concluida' ? 'feita' : ''}`}>
              <div className="mt-top">
                <span className="badge gold">{TIPO_ROTULO[t.tipo]}</span>
                {t.prazo_fatal && <span className="badge bad">Prazo fatal</span>}
                {t.prioridade !== 'normal' && <span className={`badge ${t.prioridade === 'baixa' ? 'mute' : t.prioridade === 'alta' ? 'warn' : 'bad'}`}>{PRIORIDADE_ROTULO[t.prioridade]}</span>}
                <span className="badge">{t.papel === 'responsavel' ? STATUS_ROTULO[t.status] : t.papel === 'revisor' ? 'Revisão' : 'Participante'}</span>
              </div>
              <strong>{t.titulo}</strong>
              <div className="muted fs-md" >{quando(t)}{t.local ? ` · ${t.local}` : ''}</div>
              {(t.processo_numero || t.cliente) && <div className="muted mono fs-sm" >{[t.processo_numero, t.cliente].filter(Boolean).join(' · ')}</div>}
              {t.descricao && <p className="fs-lg pre-wrap" style={{ margin: '6px 0 0' }}>{t.descricao}</p>}
              {t.delegado_por && <div className="muted fs-sm mt-4" >Delegado por {t.delegado_por}</div>}
              <div className="row g-8 mt-10" >
                {acoes.map(a => <button key={a.status} className="btn sm" disabled={ocupado === t.id} onClick={() => mover(t, a.status)}>{a.rotulo}</button>)}
                {link && <a className="btn ghost sm" href={link} target="_blank" rel="noopener noreferrer"><CalendarPlus size={15} />Google Agenda</a>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
