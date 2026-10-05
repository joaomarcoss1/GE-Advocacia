import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Field, Modal, PageHeader, useConfirm, useToast } from '@/components/ui';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { filaDeAnalise } from '@/lib/analises';
import { addDays, fmtData } from '@/lib/datetime';
import { minParaHoras } from '@/lib/format';
import { OCORRENCIA_LABEL, type AnexoMeta, type Ocorrencia, type RegistroPonto } from '@/lib/types';
import FilaAnalise from './ocorrencias/FilaAnalise';
import { ModalOcorrencia, type FormOcorrencia } from './ocorrencias/ModalOcorrencia';
import { TabelaAtrasos, TabelaOcorrencias } from './ocorrencias/TabelasOcorrencias';

export { ModalOcorrencia, type FormOcorrencia };

export default function Ocorrencias() {
  const { db, ocorrencias, registros, funcionarios, escalas, feriados, agora, recarregar, auditar, travado } = useDados();
  const { sessao } = useAuth();
  const admin = sessao?.papel === 'admin';
  const toast = useToast();
  const confirmar = useConfirm();
  const [ed, setEd] = useState<FormOcorrencia | null>(null);
  const [filtro, setFiltro] = useState('');
  const [anexos, setAnexos] = useState<AnexoMeta[]>([]);
  const [recusa, setRecusa] = useState<{ tipo: 'oc'; item: Ocorrencia } | { tipo: 'reg'; item: RegistroPonto } | null>(null);
  const [motivo, setMotivo] = useState('');
  useEffect(() => { if (admin) db.anexos.listar().then(setAnexos).catch(() => setAnexos([])); }, [admin, db, ocorrencias.length, registros.length]);

  const nome = (id: string) => funcionarios.find(f => f.id === id)?.nome ?? '—';
  const func = (id: string) => funcionarios.find(f => f.id === id);
  const escalaDe = (id: string) => escalas.find(e => e.id === func(id)?.escala_id) ?? null;
  const fila = useMemo(() => filaDeAnalise(ocorrencias, registros), [ocorrencias, registros]);
  const lista = useMemo(() => [...ocorrencias].filter(o => !filtro || o.funcionario_id === filtro).sort((a, b) => b.data_inicio.localeCompare(a.data_inicio)), [ocorrencias, filtro]);
  const limite = addDays(agora.data, -90);
  const atrasos = useMemo(() => registros
    .filter(r => r.analise && r.data >= limite && (!filtro || r.funcionario_id === filtro))
    .sort((a, b) => b.horario_real.localeCompare(a.horario_real)), [registros, filtro, limite]);
  const metasDe = (chave: 'ocorrencia_id' | 'registro_id', id: string) => anexos.filter(a => a[chave] === id);

  async function decidirOc(o: Ocorrencia, status: 'aceita' | 'recusada', mot?: string) {
    try {
      await db.ocorrencias.update(o.id, { status_analise: status, motivo_decisao: mot?.trim() || null });
      await auditar(status === 'aceita' ? 'Atestado aceito' : 'Atestado recusado', `${nome(o.funcionario_id)} · ${OCORRENCIA_LABEL[o.tipo]} · ${fmtData(o.data_inicio)}${mot ? ` · ${mot}` : ''}`);
      toast.ok(status === 'aceita' ? 'Aceito: o(s) dia(s) serão pagos normalmente.' : 'Recusado: o(s) dia(s) serão descontados da folha.');
      await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function decidirReg(r: RegistroPonto, status: 'aceita' | 'recusada', mot?: string) {
    try {
      await db.registros.update(r.id, { analise: status, motivo_decisao: mot?.trim() || null });
      await auditar(status === 'aceita' ? 'Atraso aceito' : 'Atraso recusado', `${nome(r.funcionario_id)} · ${fmtData(r.data)} · ${minParaHoras(Math.abs(r.diferenca_minutos ?? 0))}${mot ? ` · ${mot}` : ''}`);
      toast.ok(status === 'aceita' ? 'Aceito: sem desconto.' : 'Recusado: será descontado apenas o tempo de atraso.');
      await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function confirmarRecusa() {
    if (!recusa) return;
    if (recusa.tipo === 'oc') await decidirOc(recusa.item, 'recusada', motivo); else await decidirReg(recusa.item, 'recusada', motivo);
    setRecusa(null); setMotivo('');
  }
  async function excluir(o: Ocorrencia) {
    if (!(await confirmar(`Excluir a ocorrência de ${nome(o.funcionario_id)}? Os dias voltarão a contar como falta se não houver ponto. Os anexos dela também serão apagados.`, { perigo: true, rotulo: 'Excluir' }))) return;
    try { await db.ocorrencias.remove(o.id); await auditar('Ocorrência excluída', nome(o.funcionario_id)); await db.anexos.limparLixeira().catch(() => 0); await recarregar(); } catch (e) { toast.erro((e as Error).message); }
  }
  const pedirRecusa = (r: { tipo: 'oc'; item: Ocorrencia } | { tipo: 'reg'; item: RegistroPonto }) => { setRecusa(r); setMotivo(''); };

  return (
    <>
      <PageHeader titulo="Ocorrências e abonos" sub="Atestados, atrasos e ausências: o administrador aceita (dia pago / sem desconto) ou recusa (desconta da folha).">
        <button className="btn gold" onClick={() => setEd({ tipo: 'atestado', remunerado: true, data_inicio: agora.data, data_fim: agora.data })}><Plus size={18} />Nova ocorrência</button>
      </PageHeader>

      <FilaAnalise fila={fila} admin={admin} nome={nome} func={func} escalaDe={escalaDe} feriados={feriados} metasDe={metasDe}
        decidirOc={decidirOc} decidirReg={decidirReg} recusarOc={o => pedirRecusa({ tipo: 'oc', item: o })} recusarReg={r => pedirRecusa({ tipo: 'reg', item: r })} />

      <div className="card" style={{ marginTop: fila.total ? 18 : 0 }}>
        <div className="card-head">
          <select className="select" style={{ maxWidth: 320 }} value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Filtrar por funcionário">
            <option value="">Todos os funcionários</option>{funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <span className="muted">{lista.length} registro(s)</span>
        </div>
        <TabelaOcorrencias lista={lista} admin={admin} nome={nome} metasDe={metasDe} travado={o => travado(o.funcionario_id, o.data_inicio, o.data_fim)}
          onEditar={setEd} onExcluir={excluir} onAceitar={o => decidirOc(o, 'aceita')} onRecusar={o => pedirRecusa({ tipo: 'oc', item: o })} />
      </div>

      <TabelaAtrasos atrasos={atrasos} admin={admin} nome={nome} metasDe={metasDe} travado={r => travado(r.funcionario_id, r.data)}
        onAceitar={r => decidirReg(r, 'aceita')} onRecusar={r => pedirRecusa({ tipo: 'reg', item: r })} />

      {ed && <ModalOcorrencia inicial={ed} onClose={() => setEd(null)} />}
      {recusa && (
        <Modal titulo="Recusar" onClose={() => setRecusa(null)} rodape={<><button className="btn ghost" onClick={() => setRecusa(null)}>Cancelar</button><button className="btn danger" onClick={confirmarRecusa}>Confirmar recusa</button></>}>
          <div className="stack">
            <p>
              {recusa.tipo === 'oc'
                ? <>Ao recusar, o(s) dia(s) de <strong>{nome(recusa.item.funcionario_id)}</strong> serão descontados da folha (falta).</>
                : <>Ao recusar, será descontado da folha de <strong>{nome(recusa.item.funcionario_id)}</strong> apenas o tempo de {recusa.item.status === 'saida_antecipada' ? 'saída antecipada' : 'atraso'} ({minParaHoras(Math.abs(recusa.item.diferenca_minutos ?? 0))}), não a diária inteira.</>}
            </p>
            <Field label="Motivo da recusa (opcional, fica registrado)"><textarea className="textarea" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: atestado sem data, documento ilegível…" autoFocus /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
