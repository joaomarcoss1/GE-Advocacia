import { useEffect, useState } from 'react';
import { LockOpen, Pencil, Plus, ReceiptText, Save, Trash2 } from 'lucide-react';
import { Badge, Field, Modal, useConfirm, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { fmtData } from '@/lib/datetime';
import { brl, minParaHoras, plural } from '@/lib/format';
import { SITUACAO_DIA } from '@/lib/rotulos';
import { AJUSTE_LABEL, AJUSTE_POSITIVO, type AjusteFolha, type Funcionario, type SituacaoManual } from '@/lib/types';
import type { Linha } from './useFolha';

/** Detalhe de um funcionário na folha: cálculo, valores, ajustes e dia a dia (com correção manual do dia). */
export default function DetalheFolha({ det, ajustesLista, onFechar, onReabrir, onNovoAjuste, onEditarAjuste, onHolerite }: {
  det: Linha; ajustesLista: AjusteFolha[]; onFechar(): void; onReabrir(l: Linha): Promise<boolean>;
  onNovoAjuste(fid: string): void; onEditarAjuste(a: AjusteFolha): void; onHolerite(l: Linha): void;
}) {
  const { db, config, ajustesDia, recarregar, auditar, travado } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const [valores, setValores] = useState({ salario: String(det.func.salario_mensal).replace('.', ','), diaria: det.func.diaria_fixa ? String(det.func.diaria_fixa).replace('.', ',') : '' });
  useEffect(() => {
    setValores({ salario: String(det.func.salario_mensal).replace('.', ','), diaria: det.func.diaria_fixa ? String(det.func.diaria_fixa).replace('.', ',') : '' });
  }, [det.func.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Corrige a situação de um dia (presente / abonado / falta) por cima do ponto, ou volta ao automático. */
  async function definirDia(data: string, valor: string) {
    if (det.travada) return toast.erro('Esta folha está fechada. Reabra-a para editar os dias.');
    const atual = ajustesDia.find(a => a.funcionario_id === det.func.id && a.data === data);
    try {
      if (valor === 'auto') { if (atual) await db.ajustesDia.remove(atual.id); }
      else if (atual) await db.ajustesDia.update(atual.id, { situacao: valor as SituacaoManual });
      else await db.ajustesDia.insert({ funcionario_id: det.func.id, data, situacao: valor as SituacaoManual, observacao: null });
      await auditar('Dia ajustado', `${det.func.nome} · ${fmtData(data)} → ${valor === 'auto' ? 'automático' : valor}`);
      await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function salvarValores() {
    const num = (t: string) => Number(t.replace(/\./g, '').replace(',', '.'));
    const sal = num(valores.salario);
    if (!(sal >= 0)) return toast.erro('Informe um salário válido.');
    const diaria = valores.diaria.trim() === '' ? null : num(valores.diaria);
    if (diaria !== null && !(diaria >= 0)) return toast.erro('Informe uma diária válida ou deixe em branco.');
    const patch: Partial<Funcionario> = { salario_mensal: sal, diaria_fixa: diaria };
    try {
      await db.funcionarios.update(det.func.id, patch);
      await auditar('Valores do funcionário editados', `${det.func.nome} · salário ${brl(sal)}${diaria !== null ? ` · diária fixa ${brl(diaria)}` : ''}`);
      toast.ok('Valores atualizados. A prévia foi recalculada.'); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function removerAjuste(a: AjusteFolha) {
    if (travado(a.funcionario_id, a.data)) return toast.erro('A folha deste período está fechada. Reabra-a para alterar ajustes.');
    if (!(await confirmar(`Remover o ajuste "${a.motivo}" (${brl(a.valor)})?`, { perigo: true, rotulo: 'Remover' }))) return;
    try { await db.ajustes.remove(a.id); await auditar('Ajuste removido', `${a.motivo} ${brl(a.valor)}`); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }

  const e = det.efetivo;
  return (
    <Modal largo titulo={det.func.nome} onClose={onFechar} rodape={<>
      {det.salva && det.salva.status !== 'aberta' && <button className="btn ghost" onClick={async () => { if (await onReabrir(det)) onFechar(); }}><LockOpen size={16} />Reabrir folha</button>}
      <button className="btn ghost" onClick={() => onNovoAjuste(det.func.id)} disabled={det.travada} title={det.travada ? 'Folha fechada: reabra para lançar ajustes' : undefined}><Plus size={16} />Ajuste</button>
      <button className="btn" onClick={() => onHolerite(det)}><ReceiptText size={16} />Demonstrativo PDF</button>
    </>}>
      <div className="grid c2 ai-start" >
        <div>
          <div className="section-title mb-8" >Cálculo do período</div>
          <div className="sum-line"><span>Salário mensal</span><span className="mono">{brl(e.salario_mensal)}</span></div>
          <div className="sum-line"><span>Valor da diária</span><span className="mono">{brl(e.valor_diaria)}</span></div>
          <div className="sum-line"><span>Dias previstos no período</span><span className="mono">{e.dias_previstos}</span></div>
          <div className="sum-line"><span>Bruto do período</span><span className="mono">{brl(e.valor_bruto)}</span></div>
          <div className="sum-line neg"><span>Faltas ({e.faltas} × {brl(e.valor_diaria)})</span><span className="mono">− {brl(e.desconto_faltas)}</span></div>
          {(config.folha.descontar_atrasos || e.desconto_atrasos > 0) && (
            <div className="sum-line neg"><span>Atrasos / saídas antecipadas ({minParaHoras(e.detalhe.reduce((t, d) => t + (d.descontado_min ?? 0), 0))} descontados)</span><span className="mono">− {brl(e.desconto_atrasos)}</span></div>
          )}
          <div className="sum-line"><span>Adicionais / horas extras</span><span className="mono">+ {brl(e.adicionais)}</span></div>
          <div className="sum-line neg"><span>Descontos / adiantamentos</span><span className="mono">− {brl(e.descontos)}</span></div>
          <div className="sum-line total"><span>Líquido</span><span className="mono">{brl(e.valor_final)}</span></div>
          <div className="row mt-12" >
            <Badge tom="ok">{plural(e.dias_trabalhados, 'presente', 'presentes')}</Badge>
            {e.dias_abonados > 0 && <Badge tom="gold">{plural(e.dias_abonados, 'abonado', 'abonados')}</Badge>}
            {e.atrasos + e.saidas_antecipadas > 0 && <Badge tom="warn">{plural(e.atrasos, 'atraso', 'atrasos')} · {plural(e.saidas_antecipadas, 'saída', 'saídas')} antec.</Badge>}
            {e.pendencias > 0 && <Badge tom="warn">{plural(e.pendencias, 'ajuste', 'ajustes')} aguardando aprovação</Badge>}
          </div>
          {det.salva?.motivo_reabertura && det.salva.status === 'aberta' && <p className="hint mt-10" >Última reabertura: {det.salva.motivo_reabertura}</p>}
          <div className="section-title" style={{ margin: '18px 0 8px' }}>Valores do funcionário</div>
          <div className="grid c2">
            <Field label="Salário mensal (R$)"><input className="input" inputMode="decimal" value={valores.salario} onChange={ev => setValores({ ...valores, salario: ev.target.value })} /></Field>
            <Field label="Diária fixa (R$)" dica="Opcional: substitui salário ÷ dias."><input className="input" inputMode="decimal" placeholder="automática" value={valores.diaria} onChange={ev => setValores({ ...valores, diaria: ev.target.value })} /></Field>
          </div>
          <button className="btn ghost sm mt-10" onClick={salvarValores}><Save size={15} />Salvar valores</button>
          <div className="section-title" style={{ margin: '18px 0 8px' }}>Ajustes lançados</div>
          {ajustesLista.map(a => (
            <div className="sum-line" key={a.id}>
              <span>{fmtData(a.data).slice(0, 5)} · {AJUSTE_LABEL[a.tipo]} — {a.motivo}</span>
              <span className="mono">{AJUSTE_POSITIVO[a.tipo] ? '+' : '−'} {brl(a.valor)}
                <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Editar ajuste" disabled={travado(a.funcionario_id, a.data)} title={travado(a.funcionario_id, a.data) ? 'Período com folha fechada. Reabra a folha para editar.' : undefined} onClick={() => onEditarAjuste(a)}><Pencil size={15} /></button>
                <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Remover ajuste" disabled={travado(a.funcionario_id, a.data)} title={travado(a.funcionario_id, a.data) ? 'Período com folha fechada. Reabra a folha para editar.' : undefined} onClick={() => removerAjuste(a)}><Trash2 size={15} /></button></span>
            </div>
          ))}
          {!ajustesLista.length && <p className="muted">Nenhum ajuste no período.</p>}
        </div>
        <div>
          <div className="section-title mb-4" >Dia a dia</div>
          <p className="hint mb-8" >Use “Ajustar” para corrigir um dia: <strong>Presente</strong> (paga), <strong>Abonado</strong> (paga) ou <strong>Falta</strong> (desconta). “Automático” volta à apuração do ponto.{det.travada ? ' Folha fechada: reabra para editar.' : ''}</p>
          <div style={{ maxHeight: 460, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--r-3)' }}>
            {e.detalhe.filter(d => d.situacao !== 'fora_contrato').map(d => {
              const s = SITUACAO_DIA[d.situacao];
              const editavel = ['presente', 'abonado', 'falta', 'futuro', 'hoje'].includes(d.situacao);
              const atual = ajustesDia.find(a => a.funcionario_id === det.func.id && a.data === d.data)?.situacao ?? 'auto';
              return (
                <div className="dia-cell" key={d.data} style={{ gridTemplateColumns: '74px 1fr auto' }}>
                  <span className="mono">{fmtData(d.data).slice(0, 5)} <span className="muted">{['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d.data + 'T12:00:00Z').getUTCDay()]}</span></span>
                  <span><Badge tom={s.tom}>{s.rotulo}</Badge>{d.manual && <> <Badge tom="gold">ajustado</Badge></>}{d.analise && <> <Badge tom={d.analise === 'pendente' ? 'warn' : 'bad'}>{d.analise === 'pendente' ? 'atestado em análise' : 'atestado recusado'}</Badge></>}{d.atraso_min ? <> <Badge tom={d.atraso_analise === 'aceita' ? 'ok' : d.atraso_analise === 'pendente' ? 'warn' : 'bad'}>atraso {minParaHoras(d.atraso_min)}{d.atraso_analise === 'aceita' ? ' aceito' : d.atraso_analise === 'pendente' ? ' em análise' : d.atraso_analise === 'recusada' ? ' recusado' : ''}</Badge></> : null}{(d.nota || d.incompleto) && <span className="muted fs-sm" > {d.nota ?? ''}{d.incompleto ? ' marcação incompleta' : ''}</span>}</span>
                  {editavel ? (
                    <select className="select fs-md" style={{ minHeight: 34, padding: '4px 8px', width: 122 }} aria-label={`Ajustar ${fmtData(d.data)}`} disabled={det.travada}
 value={atual} onChange={ev => definirDia(d.data, ev.target.value)}>
                      <option value="auto">Automático</option><option value="presente">Presente</option><option value="abonado">Abonado</option><option value="falta">Falta</option>
                    </select>
                  ) : <span />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
