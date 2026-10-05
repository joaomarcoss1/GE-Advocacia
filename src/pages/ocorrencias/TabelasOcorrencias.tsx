import { Pencil, Trash2 } from 'lucide-react';
import Anexos from '@/components/Anexos';
import { Badge, Vazio } from '@/components/ui';
import { fmtData, isoParaBR } from '@/lib/datetime';
import { minParaHoras } from '@/lib/format';
import { DICA_PERIODO_FECHADO } from '@/lib/regras';
import { ANALISE_LABEL, OCORRENCIA_LABEL, type AnexoMeta, type Ocorrencia, type RegistroPonto, type StatusAnalise } from '@/lib/types';

const TOM_ANALISE: Record<StatusAnalise, 'warn' | 'ok' | 'bad'> = { pendente: 'warn', aceita: 'ok', recusada: 'bad' };
type Metas = (chave: 'ocorrencia_id' | 'registro_id', id: string) => AnexoMeta[];

/** Histórico de ocorrências. Lápis e lixeira ficam desabilitados quando o período está com a folha fechada. */
export function TabelaOcorrencias({ lista, admin, nome, metasDe, travado, onEditar, onExcluir, onAceitar, onRecusar }: {
  lista: Ocorrencia[]; admin: boolean; nome(id: string): string; metasDe: Metas; travado(o: Ocorrencia): boolean;
  onEditar(o: Ocorrencia): void; onExcluir(o: Ocorrencia): void; onAceitar(o: Ocorrencia): void; onRecusar(o: Ocorrencia): void;
}) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr><th>Funcionário</th><th>Tipo</th><th>Período</th><th>Situação</th><th>Folha</th><th>Observação</th><th /></tr></thead>
        <tbody>
          {lista.map(o => {
            const st = o.status_analise ?? 'aceita';
            const fechado = travado(o);
            return (
              <tr key={o.id}>
                <td><strong>{nome(o.funcionario_id)}</strong>{o.origem === 'funcionario' && <div className="muted" style={{ fontSize: '.8rem' }}>enviado pelo funcionário</div>}</td>
                <td>{OCORRENCIA_LABEL[o.tipo]}</td>
                <td className="mono">{fmtData(o.data_inicio)}{o.data_fim !== o.data_inicio && ` → ${fmtData(o.data_fim)}`}</td>
                <td><Badge tom={TOM_ANALISE[st]}>{o.origem === 'funcionario' || st !== 'aceita' ? ANALISE_LABEL[st] : 'Registrada'}</Badge></td>
                <td>{st === 'recusada' ? <Badge tom="bad">Descontado</Badge> : st === 'pendente' ? <Badge tom="warn">Desconto provisório</Badge> : o.remunerado ? <Badge tom="ok">Sem desconto</Badge> : <Badge tom="bad">Descontado</Badge>}{fechado && <> <Badge tom="mute">Folha fechada</Badge></>}</td>
                <td className="muted">{o.motivo_decisao ? `Recusa: ${o.motivo_decisao}` : o.observacao}{admin && metasDe('ocorrencia_id', o.id).length > 0 && <div style={{ marginTop: 4 }}><Anexos metas={metasDe('ocorrencia_id', o.id)} /></div>}</td>
                <td className="right" style={{ whiteSpace: 'nowrap' }}>
                  {admin && o.origem === 'funcionario' && st !== 'pendente' && (
                    <button className="btn ghost sm" disabled={fechado} title={fechado ? DICA_PERIODO_FECHADO : undefined} onClick={() => (st === 'aceita' ? onRecusar(o) : onAceitar(o))}>{st === 'aceita' ? 'Recusar' : 'Aceitar'}</button>
                  )}
                  <button className="icon-btn" aria-label="Editar" disabled={fechado} title={fechado ? DICA_PERIODO_FECHADO : 'Editar'} onClick={() => onEditar(o)}><Pencil size={17} /></button>
                  <button className="icon-btn" aria-label="Excluir" disabled={fechado} title={fechado ? DICA_PERIODO_FECHADO : 'Excluir'} onClick={() => onExcluir(o)}><Trash2 size={17} /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!lista.length && <Vazio tipo="documento" titulo="Nenhuma ocorrência">Atestados, audiências externas, férias e outras ausências aparecem aqui.</Vazio>}
    </div>
  );
}

/** Atrasos e saídas antecipadas dos últimos 90 dias, já decididos ou não. */
export function TabelaAtrasos({ atrasos, admin, nome, metasDe, travado, onAceitar, onRecusar }: {
  atrasos: RegistroPonto[]; admin: boolean; nome(id: string): string; metasDe: Metas; travado(r: RegistroPonto): boolean;
  onAceitar(r: RegistroPonto): void; onRecusar(r: RegistroPonto): void;
}) {
  if (!atrasos.length) return null;
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-head"><span className="section-title">Atrasos e saídas antecipadas (últimos 90 dias)</span><span className="muted">{atrasos.length} registro(s)</span></div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Funcionário</th><th>Data</th><th>Marcação</th><th className="num">Tempo</th><th>Justificativa</th><th>Situação</th><th /></tr></thead>
          <tbody>
            {atrasos.map(r => (
              <tr key={r.id}>
                <td><strong>{nome(r.funcionario_id)}</strong></td>
                <td className="mono">{fmtData(r.data)}</td>
                <td>{r.status === 'saida_antecipada' ? 'Saída antecipada' : 'Atraso'} · {isoParaBR(r.horario_real).hhmm}</td>
                <td className="num">{minParaHoras(Math.abs(r.diferenca_minutos ?? 0))}</td>
                <td className="muted">{r.motivo_decisao ? `Recusa: ${r.motivo_decisao}` : r.justificativa}{admin && metasDe('registro_id', r.id).length > 0 && <div style={{ marginTop: 4 }}><Anexos metas={metasDe('registro_id', r.id)} /></div>}</td>
                <td><Badge tom={TOM_ANALISE[r.analise ?? 'pendente']}>{ANALISE_LABEL[r.analise ?? 'pendente']}</Badge></td>
                <td className="right">{admin && r.analise !== 'pendente' && (
                  <button className="btn ghost sm" disabled={travado(r)} title={travado(r) ? DICA_PERIODO_FECHADO : undefined} onClick={() => (r.analise === 'aceita' ? onRecusar(r) : onAceitar(r))}>{r.analise === 'aceita' ? 'Recusar' : 'Aceitar'}</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
