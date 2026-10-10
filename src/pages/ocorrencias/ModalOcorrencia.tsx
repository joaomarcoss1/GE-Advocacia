import { useState } from 'react';
import { Field, Modal, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { fmtData } from '@/lib/datetime';
import { OCORRENCIA_LABEL, type Ocorrencia, type TipoOcorrencia } from '@/lib/types';

export type FormOcorrencia = Partial<Ocorrencia>;

export function ModalOcorrencia({ inicial, onClose }: { inicial: FormOcorrencia; onClose(): void }) {
  const { db, funcionarios, recarregar, auditar, travado } = useDados();
  const toast = useToast();
  const [f, setF] = useState<FormOcorrencia>(inicial);
  async function salvar() {
    if (!f.funcionario_id) return toast.erro('Escolha o funcionário.');
    if (!f.data_inicio || !f.data_fim) return toast.erro('Informe o período.');
    if (f.data_fim < f.data_inicio) return toast.erro('A data final não pode ser anterior à inicial.');
    if (travado(f.funcionario_id, f.data_inicio, f.data_fim)) return toast.erro('Esse período já foi fechado na folha. Reabra a folha para lançar ocorrências.');
    try {
      const dados = { funcionario_id: f.funcionario_id, data_inicio: f.data_inicio, data_fim: f.data_fim, tipo: f.tipo as TipoOcorrencia, remunerado: f.remunerado ?? true, observacao: f.observacao?.trim() || null };
      if (f.id) await db.ocorrencias.update(f.id, dados); else await db.ocorrencias.insert(dados);
      await auditar(f.id ? 'Ocorrência editada' : 'Ocorrência registrada', `${funcionarios.find(x => x.id === f.funcionario_id)?.nome} · ${OCORRENCIA_LABEL[dados.tipo]} · ${fmtData(dados.data_inicio)}`);
      toast.ok('Ocorrência salva.'); onClose(); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  return (
    <Modal titulo={f.id ? 'Editar ocorrência' : 'Nova ocorrência / abono'} onClose={onClose}
      rodape={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={salvar}>Salvar</button></>}>
      <div className="stack">
        <Field label="Funcionário">
          <select className="select" value={f.funcionario_id ?? ''} onChange={e => setF({ ...f, funcionario_id: e.target.value })}>
            <option value="">Selecione…</option>{funcionarios.filter(x => x.ativo || x.id === f.funcionario_id).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </Field>
        <Field label="Tipo">
          <select className="select" value={f.tipo} onChange={e => {
            const tipo = e.target.value as TipoOcorrencia;
            setF({ ...f, tipo, remunerado: tipo !== 'licenca' ? true : f.remunerado });
          }}>
            {(Object.keys(OCORRENCIA_LABEL) as TipoOcorrencia[]).map(t => <option key={t} value={t}>{OCORRENCIA_LABEL[t]}</option>)}
          </select>
        </Field>
        <div className="grid c2">
          <Field label="De"><input className="input" type="date" value={f.data_inicio ?? ''} onChange={e => setF({ ...f, data_inicio: e.target.value, data_fim: f.data_fim && f.data_fim >= e.target.value ? f.data_fim : e.target.value })} /></Field>
          <Field label="Até"><input className="input" type="date" min={f.data_inicio} value={f.data_fim ?? ''} onChange={e => setF({ ...f, data_fim: e.target.value })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.remunerado ?? true} onChange={e => setF({ ...f, remunerado: e.target.checked })} />Dias remunerados: não desconta da folha</label>
        {f.remunerado === false && <p className="hint">Sem remuneração: cada dia útil do período será descontado como falta (1 diária).</p>}
        <Field label="Observação"><textarea className="textarea" value={f.observacao ?? ''} onChange={e => setF({ ...f, observacao: e.target.value })} placeholder="Ex.: CID informado ao RH, número do processo da audiência…" /></Field>
      </div>
    </Modal>
  );
}
