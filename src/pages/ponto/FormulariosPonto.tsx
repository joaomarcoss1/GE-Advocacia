import { MapPin } from 'lucide-react';
import SeletorAnexos from '@/components/SeletorAnexos';
import { Field } from '@/components/ui';
import { addDays } from '@/lib/datetime';
import { minParaHoras } from '@/lib/format';
import { exigeJustificativa } from '@/lib/ponto';
import { OCORRENCIA_LABEL, TIPO_MARCACAO_LABEL, type TipoMarcacao, type TipoOcorrencia } from '@/lib/types';
import type { Ponto } from './usePonto';

export const STATUS_TXT: Record<string, string> = {
  no_horario: 'No horário', tolerancia: 'Dentro da tolerância', atraso: 'Atraso', saida_antecipada: 'Saída antecipada', extra: 'Fora da escala / hora extra',
};

/** Confirmação de uma marcação: mostra previsto × agora, pede justificativa (e anexo) quando há atraso. */
export function ConfirmarMarcacao({ p }: { p: Ponto }) {
  const { escolha, previa } = p;
  if (!escolha || !previa) return null;
  const precisa = exigeJustificativa(previa.status);
  return (
    <div className="stack">
      <div className="card card-pad no-shadow" style={{ background: 'var(--navy-tint)' }}>
        <div className="section-title">{TIPO_MARCACAO_LABEL[escolha]}</div>
        <div className="row between mt-10" >
          <span>Previsto <strong className="fw-600 fs-3xl" style={{ fontFamily: 'var(--serif)' }}>{previa.previsto ?? '—'}</strong></span>
          <span>Agora <strong className="fw-600 fs-3xl" style={{ fontFamily: 'var(--serif)' }}>{p.agora.hhmm}</strong></span>
        </div>
        <div className="mt-10">
          <span className={`badge ${previa.status === 'atraso' || previa.status === 'saida_antecipada' ? 'bad' : previa.status === 'extra' ? 'gold' : 'ok'}`}>
            {STATUS_TXT[previa.status]}{previa.diferenca !== 0 && previa.status !== 'extra' ? ` · ${previa.diferenca > 0 ? '+' : '−'}${minParaHoras(previa.diferenca)}` : ''}
          </span>
        </div>
      </div>
      {precisa && (
        <>
          <div className="field">
            <label htmlFor="just">Justificativa (obrigatória)</label>
            <textarea id="just" className="textarea" value={p.just} onChange={e => p.setJust(e.target.value)} placeholder="Ex.: audiência no fórum, trânsito, consulta médica…" />
          </div>
          <SeletorAnexos arquivos={p.arqAtraso} onChange={p.setArqAtraso} rotulo="Anexar atestado ou comprovante (opcional)" dica="PDF ou foto. Ajuda o administrador a aceitar sua justificativa." />
          <p className="hint m-0" >Este registro vai para <strong>análise do administrador</strong>. Se aceito, não há desconto; se recusado, desconta apenas o tempo de {previa.status === 'atraso' ? 'atraso' : 'saída antecipada'} (não a diária inteira).</p>
        </>
      )}
      {p.ctx?.ponto.geofence_ativo && <p className="hint"><MapPin size={14} style={{ verticalAlign: 'middle' }} /> Sua localização será conferida novamente no momento do registro.</p>}
      <button className="btn block" style={{ minHeight: 50 }} disabled={p.enviando || !p.dentro || (precisa && p.just.trim().length < 3)} onClick={p.confirmar}>
        {p.enviando ? 'Registrando…' : 'Confirmar registro'}
      </button>
      <button className="btn ghost block" onClick={p.cancelarEscolha}>Cancelar</button>
    </div>
  );
}

/** Envio de atestado / justificativa de falta (vai para análise do administrador). */
export function FormAusencia({ p }: { p: Ponto }) {
  const { ausForm: f, setAusForm: set, agora } = p;
  return (
    <div className="stack">
      <div className="section-title">Enviar atestado / justificar falta</div>
      <Field label="Motivo">
        <select className="select" value={f.tipo} onChange={e => set({ ...f, tipo: e.target.value as TipoOcorrencia })}>
          {(['atestado', 'declaracao', 'audiencia_externa', 'outro'] as TipoOcorrencia[]).map(t => <option key={t} value={t}>{OCORRENCIA_LABEL[t]}</option>)}
        </select>
      </Field>
      <div className="grid c2">
        <Field label="De"><input className="input" type="date" min={addDays(agora.data, -45)} max={addDays(agora.data, 30)} value={f.inicio} onChange={e => set({ ...f, inicio: e.target.value, fim: f.fim < e.target.value ? e.target.value : f.fim })} /></Field>
        <Field label="Até"><input className="input" type="date" min={f.inicio} max={addDays(agora.data, 30)} value={f.fim} onChange={e => set({ ...f, fim: e.target.value })} /></Field>
      </div>
      <Field label="Observação (opcional)"><textarea className="textarea" value={f.obs} onChange={e => set({ ...f, obs: e.target.value })} placeholder="Ex.: consulta médica, dias de repouso indicados…" /></Field>
      <SeletorAnexos arquivos={p.ausArq} onChange={p.setAusArq} rotulo={f.tipo === 'atestado' ? 'Anexar o atestado (obrigatório)' : 'Anexar comprovante'} dica="PDF ou foto do documento, de até 2 MB. Fotos são reduzidas automaticamente." />
      <p className="hint m-0" >O administrador vai analisar. <strong>Aceito:</strong> a diária do dia é paga normalmente. <strong>Recusado:</strong> o dia é descontado da folha. Atestados são dados de saúde: ficam guardados com acesso restrito e cada abertura é registrada.</p>
      <button className="btn gold block" disabled={p.enviando || !f.inicio || !f.fim || (f.tipo === 'atestado' && p.ausArq.length === 0)} onClick={p.enviarAusencia}>{p.enviando ? 'Enviando…' : 'Enviar para análise'}</button>
      <button className="btn ghost block" onClick={() => p.setAus(false)}>Cancelar</button>
    </div>
  );
}

/** Pedido de ajuste de uma marcação esquecida em outro dia (vai para aprovação da gerência). */
export function FormRetro({ p }: { p: Ponto }) {
  const { retroForm: f, setRetroForm: set, agora } = p;
  return (
    <div className="stack">
      <div className="section-title">Ajuste de ponto (vai para aprovação)</div>
      <div className="grid c2">
        <Field label="Data"><input className="input" type="date" max={addDays(agora.data, -1)} min={addDays(agora.data, -45)} value={f.data} onChange={e => set({ ...f, data: e.target.value })} /></Field>
        <Field label="Horário"><input className="input" type="time" value={f.hora} onChange={e => set({ ...f, hora: e.target.value })} /></Field>
      </div>
      <Field label="Marcação">
        <select className="select" value={f.tipo} onChange={e => set({ ...f, tipo: e.target.value as TipoMarcacao })}>
          {(Object.keys(TIPO_MARCACAO_LABEL) as TipoMarcacao[]).map(t => <option key={t} value={t}>{TIPO_MARCACAO_LABEL[t]}</option>)}
        </select>
      </Field>
      <Field label="Justificativa"><textarea className="textarea" value={f.justificativa} onChange={e => set({ ...f, justificativa: e.target.value })} placeholder="Explique o que aconteceu (mín. 5 caracteres)" /></Field>
      <button className="btn gold block" disabled={p.enviando || !f.data || !f.hora || f.justificativa.trim().length < 5} onClick={p.enviarRetro}>Enviar para aprovação</button>
      <button className="btn ghost block" onClick={() => p.setRetro(false)}>Cancelar</button>
    </div>
  );
}
