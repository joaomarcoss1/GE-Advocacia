import { Field, Modal, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { addDays } from '@/lib/datetime';
import { valorHoraExtra } from '@/lib/folha';
import { brl } from '@/lib/format';
import { minutosJornada } from '@/lib/ponto';
import { AJUSTE_LABEL, DIAS_ESCALA, type AjusteFolha, type TipoAjuste } from '@/lib/types';
import type { Linha } from './useFolha';

export type FormAjuste = Partial<AjusteFolha> & { horasTxt?: string; valorTxt?: string };

/** Lança ou edita um ajuste (adicional, hora extra, desconto, adiantamento). Recusa períodos com folha fechada. */
export default function ModalAjuste({ ajuste, setAjuste, linhas, inicioPeriodo }: {
  ajuste: FormAjuste; setAjuste(a: FormAjuste | null): void; linhas: Linha[]; inicioPeriodo: string;
}) {
  const { db, funcionarios, config, recarregar, auditar, travado } = useDados();
  const toast = useToast();

  function sugerirHoraExtra(a: FormAjuste, horasTxt: string): FormAjuste {
    const l = linhas.find(x => x.func.id === a.funcionario_id);
    const horas = Number(horasTxt.replace(',', '.')) || 0;
    if (!l) return { ...a, horasTxt };
    const dias = DIAS_ESCALA.filter(d => l.escala?.dias[d]?.ativo);
    const jornada = dias.length ? dias.reduce((s, d) => s + minutosJornada(l.escala!.dias[d]), 0) / dias.length : 0;
    const v = valorHoraExtra(l.calc.valor_diaria, jornada, config.folha.hora_extra_pct) * horas;
    return { ...a, horasTxt, valorTxt: horas > 0 && v > 0 ? v.toFixed(2).replace('.', ',') : a.valorTxt };
  }
  async function salvar() {
    if (!ajuste.funcionario_id) return toast.erro('Escolha o funcionário.');
    const valor = Number(String(ajuste.valorTxt ?? '').replace(/\./g, '').replace(',', '.'));
    if (!(valor > 0)) return toast.erro('Informe um valor maior que zero.');
    if (!ajuste.motivo?.trim()) return toast.erro('Informe o motivo.');
    if (travado(ajuste.funcionario_id, ajuste.data!)) return toast.erro('A folha deste período está fechada. Reabra-a para lançar ajustes.');
    try {
      const dadosAjuste = {
        funcionario_id: ajuste.funcionario_id, data: ajuste.data!, tipo: ajuste.tipo as TipoAjuste, valor, motivo: ajuste.motivo.trim(),
        quantidade_horas: ajuste.tipo === 'hora_extra' ? Number(String(ajuste.horasTxt ?? '').replace(',', '.')) || null : null, observacao: null,
      };
      if (ajuste.id) await db.ajustes.update(ajuste.id, dadosAjuste); else await db.ajustes.insert(dadosAjuste);
      await auditar(ajuste.id ? 'Ajuste editado' : 'Ajuste lançado', `${funcionarios.find(f => f.id === ajuste.funcionario_id)?.nome} · ${AJUSTE_LABEL[ajuste.tipo as TipoAjuste]} ${brl(valor)}`);
      toast.ok(ajuste.id ? 'Ajuste atualizado.' : 'Ajuste lançado. A prévia já foi recalculada.'); setAjuste(null); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }

  return (
    <Modal titulo={ajuste.id ? 'Editar ajuste' : 'Lançar ajuste na folha'} onClose={() => setAjuste(null)} rodape={<><button className="btn ghost" onClick={() => setAjuste(null)}>Cancelar</button><button className="btn" onClick={salvar}>{ajuste.id ? 'Salvar' : 'Lançar'}</button></>}>
      <div className="stack">
        <Field label="Funcionário">
          <select className="select" disabled={!!ajuste.id} value={ajuste.funcionario_id ?? ''} onChange={e => setAjuste({ ...ajuste, funcionario_id: e.target.value })}>
            <option value="">Selecione…</option>{funcionarios.filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Field>
        <div className="grid c2">
          <Field label="Tipo">
            <select className="select" value={ajuste.tipo} onChange={e => setAjuste({ ...ajuste, tipo: e.target.value as TipoAjuste })}>
              {(Object.keys(AJUSTE_LABEL) as TipoAjuste[]).map(t => <option key={t} value={t}>{AJUSTE_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Data de competência"><input className="input" type="date" min={addDays(inicioPeriodo, 0)} value={ajuste.data ?? ''} onChange={e => setAjuste({ ...ajuste, data: e.target.value })} /></Field>
        </div>
        {ajuste.tipo === 'hora_extra' && (
          <Field label="Quantidade de horas" dica={`Sugere o valor pela diária, jornada da escala e adicional de ${config.folha.hora_extra_pct}%.`}>
            <input className="input" inputMode="decimal" value={ajuste.horasTxt ?? ''} onChange={e => setAjuste(sugerirHoraExtra(ajuste, e.target.value))} />
          </Field>
        )}
        <Field label="Valor (R$)"><input className="input" inputMode="decimal" value={ajuste.valorTxt ?? ''} onChange={e => setAjuste({ ...ajuste, valorTxt: e.target.value })} placeholder="0,00" /></Field>
        <Field label="Motivo"><input className="input" value={ajuste.motivo ?? ''} onChange={e => setAjuste({ ...ajuste, motivo: e.target.value })} placeholder="Ex.: plantão de audiência, vale-transporte, adiantamento…" /></Field>
      </div>
    </Modal>
  );
}
