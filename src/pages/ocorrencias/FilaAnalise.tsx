import { Check, Paperclip, X } from 'lucide-react';
import Anexos from '@/components/Anexos';
import { Badge } from '@/components/ui';
import { fmtData, isoParaBR } from '@/lib/datetime';
import { impactoAtraso, impactoOcorrencia } from '@/lib/folha';
import { brl, minParaHoras, plural } from '@/lib/format';
import { OCORRENCIA_LABEL, type AnexoMeta, type Escala, type Feriado, type Funcionario, type Ocorrencia, type RegistroPonto } from '@/lib/types';
import type { filaDeAnalise } from '@/lib/analises';

interface Props {
  fila: ReturnType<typeof filaDeAnalise>;
  admin: boolean;
  nome(id: string): string;
  func(id: string): Funcionario | undefined;
  escalaDe(id: string): Escala | null;
  feriados: Feriado[];
  metasDe(chave: 'ocorrencia_id' | 'registro_id', id: string): AnexoMeta[];
  decidirOc(o: Ocorrencia, status: 'aceita'): void;
  decidirReg(r: RegistroPonto, status: 'aceita'): void;
  recusarOc(o: Ocorrencia): void;
  recusarReg(r: RegistroPonto): void;
}

const Botoes = ({ admin, onAceitar, onRecusar }: { admin: boolean; onAceitar(): void; onRecusar(): void }) => (
  admin ? (
    <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
      <button className="btn sm" onClick={onAceitar}><Check />Aceitar</button>
      <button className="btn ghost danger sm" onClick={onRecusar}><X />Recusar</button>
    </div>
  ) : <span className="hint">Decisão do administrador</span>
);
const iniciaisDe = (nome: string) => nome.split(' ').map(x => x[0]).slice(0, 2).join('');

/** Fila de atestados e atrasos aguardando a decisão do administrador. */
export default function FilaAnalise({ fila, admin, nome, func, escalaDe, feriados, metasDe, decidirOc, decidirReg, recusarOc, recusarReg }: Props) {
  if (!fila.total) return null;
  return (
    <section className="card analise" aria-label="Aguardando análise">
      <div className="card-head">
        <span className="section-title">Aguardando análise <span className="count-badge">{fila.total}</span></span>
        <span className="hint">Até decidir, a folha usa o desconto provisório.</span>
      </div>
      <div className="analise-lista">
        {fila.ocorrencias.map(o => {
          const f = func(o.funcionario_id);
          const imp = f ? impactoOcorrencia(f, escalaDe(o.funcionario_id), feriados, o) : null;
          return (
            <article key={o.id} className="analise-item">
              <div className="analise-topo">
                <span className="avatar">{iniciaisDe(nome(o.funcionario_id))}</span>
                <div className="grow">
                  <strong>{nome(o.funcionario_id)}</strong>
                  <div className="muted" style={{ fontSize: '.88rem' }}>{OCORRENCIA_LABEL[o.tipo]} · {fmtData(o.data_inicio)}{o.data_fim !== o.data_inicio && ` → ${fmtData(o.data_fim)}`}{imp && ` · ${plural(imp.dias, 'dia', 'dias')} útil(eis)`}</div>
                </div>
                <Badge tom="warn">Falta com justificativa</Badge>
              </div>
              {o.observacao && <p className="analise-obs">“{o.observacao}”</p>}
              <div className="analise-anexos"><Paperclip size={14} /> {admin ? <Anexos metas={metasDe('ocorrencia_id', o.id)} /> : <span className="muted">Anexos visíveis ao administrador</span>}</div>
              <div className="analise-efeito">
                <span><strong>Aceitar:</strong> a diária é paga normalmente.</span>
                <span><strong>Recusar:</strong> desconta {imp ? `${plural(imp.dias, 'diária', 'diárias')}${admin ? ` (${brl(imp.valor)})` : ''}` : 'as diárias'} da folha.</span>
              </div>
              <Botoes admin={admin} onAceitar={() => decidirOc(o, 'aceita')} onRecusar={() => recusarOc(o)} />
            </article>
          );
        })}
        {fila.atrasos.map(r => {
          const f = func(r.funcionario_id);
          const imp = f ? impactoAtraso(f, escalaDe(r.funcionario_id), feriados, r) : null;
          const saida = r.status === 'saida_antecipada';
          return (
            <article key={r.id} className="analise-item">
              <div className="analise-topo">
                <span className="avatar">{iniciaisDe(nome(r.funcionario_id))}</span>
                <div className="grow">
                  <strong>{nome(r.funcionario_id)}</strong>
                  <div className="muted" style={{ fontSize: '.88rem' }}>{saida ? 'Saída antecipada' : 'Atraso'} de {minParaHoras(Math.abs(r.diferenca_minutos ?? 0))} · {fmtData(r.data)} · previsto {r.horario_previsto ?? '—'}, registrado {isoParaBR(r.horario_real).hhmm}</div>
                </div>
                <Badge tom="warn">{saida ? 'Saída antecipada' : 'Atraso'}</Badge>
              </div>
              {r.justificativa && <p className="analise-obs">“{r.justificativa}”</p>}
              <div className="analise-anexos"><Paperclip size={14} /> {admin ? <Anexos metas={metasDe('registro_id', r.id)} /> : <span className="muted">Anexos visíveis ao administrador</span>}</div>
              <div className="analise-efeito">
                <span><strong>Aceitar:</strong> sem desconto.</span>
                <span><strong>Recusar:</strong> desconta só {minParaHoras(imp?.minutos ?? 0)} de {saida ? 'saída antecipada' : 'atraso'}{imp && admin ? ` (${brl(imp.valor)})` : ''}, não a diária.</span>
              </div>
              <Botoes admin={admin} onAceitar={() => decidirReg(r, 'aceita')} onRecusar={() => recusarReg(r)} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
