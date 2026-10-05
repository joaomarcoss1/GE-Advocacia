import { useMemo, useState } from 'react';
import { Field, Modal, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { normalizarCnj, mascararCnj } from '@/lib/cnj';
import { brParaIso, hhmmParaMin, isoParaBR, minParaHhmm, hojeMais } from '@/lib/datetime';
import { AREAS, LEMBRETES, PRIORIDADES, TIPOS } from '@/lib/tarefas';
import type { AreaJuridica, PrioridadeTarefa, Tarefa, TipoTarefa } from '@/lib/types';

interface Form {
  tipo: TipoTarefa; titulo: string; descricao: string; prioridade: PrioridadeTarefa; area: AreaJuridica | ''; cliente: string; processo: string;
  data: string; hora: string; dataFim: string; horaFim: string; diaInteiro: boolean; prazoFatal: boolean; lembrete: number; local: string;
  responsavel: string; revisor: string; participantes: string[]; sincronizar: boolean;
}

function inicial(t: Tarefa | null, padrao?: Partial<Form>): Form {
  const ini = t?.inicio ? isoParaBR(t.inicio) : null;
  const fim = t?.fim ? isoParaBR(t.fim) : null;
  return {
    tipo: t?.tipo ?? 'tarefa', titulo: t?.titulo ?? '', descricao: t?.descricao ?? '', prioridade: t?.prioridade ?? 'normal', area: t?.area ?? '', cliente: t?.cliente ?? '',
    processo: t?.processo_numero ?? '', data: ini?.data ?? '', hora: t?.dia_inteiro ? '' : ini?.hhmm ?? '', dataFim: fim?.data ?? '', horaFim: t?.dia_inteiro ? '' : fim?.hhmm ?? '',
    diaInteiro: t?.dia_inteiro ?? false, prazoFatal: t?.prazo_fatal ?? false, lembrete: t?.lembrete_min ?? 60, local: t?.local ?? '',
    responsavel: t?.responsavel_id ?? '', revisor: t?.revisor_id ?? '', participantes: t?.participantes ?? [], sincronizar: false, ...padrao,
  };
}

/** Criar ou editar tarefa, prazo, audiência ou reunião. */
export default function TarefaModal({ tarefa, padrao, googleConectado, onClose, onSalvo }: {
  tarefa: Tarefa | null; padrao?: Partial<Form>; googleConectado: boolean; onClose(): void; onSalvo(t: Tarefa, sincronizar: boolean): void;
}) {
  const { db, funcionarios } = useDados();
  const toast = useToast();
  const [f, setF] = useState<Form>(() => inicial(tarefa, padrao));
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(x => ({ ...x, [k]: v }));
  const equipe = useMemo(() => funcionarios.filter(x => x.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [funcionarios]);
  const comAgenda = f.tipo !== 'tarefa';
  const processoOk = !f.processo.trim() || !!normalizarCnj(f.processo);

  function mudarTipo(t: TipoTarefa) {
    setF(x => ({ ...x, tipo: t, prazoFatal: t === 'prazo' ? x.prazoFatal : false, diaInteiro: t === 'prazo' ? true : x.diaInteiro && t === 'tarefa', data: t !== 'tarefa' && !x.data ? hojeMais(1) : x.data }));
  }

  async function salvar() {
    if (!f.titulo.trim()) return toast.erro('Informe o título.');
    if (comAgenda && !f.data) return toast.erro('Informe a data.');
    if (!processoOk) return toast.erro('Número de processo inválido. Confira os 20 dígitos (formato CNJ).');
    let inicio: string | null = null, fim: string | null = null;
    if (f.data) {
      if (f.diaInteiro) {
        inicio = brParaIso(f.data, '00:00');
        fim = brParaIso(f.dataFim || f.data, '00:00');
      } else {
        const h = f.hora || '09:00';
        inicio = brParaIso(f.data, h);
        const df = f.dataFim || f.data;
        const hf = f.horaFim || minParaHhmm(Math.min(hhmmParaMin(h) + 60, 23 * 60 + 59));
        fim = brParaIso(df, hf);
      }
      if (fim < inicio) return toast.erro('O término não pode ser antes do início.');
    }
    const dados: Partial<Tarefa> = {
      tipo: f.tipo, titulo: f.titulo.trim(), descricao: f.descricao.trim() || null, prioridade: f.prioridade, area: f.area || null, cliente: f.cliente.trim() || null,
      processo_numero: f.processo.trim() ? (normalizarCnj(f.processo) as string) : null, inicio, fim, dia_inteiro: f.diaInteiro && !!f.data, prazo_fatal: f.tipo === 'prazo' && f.prazoFatal,
      lembrete_min: f.lembrete, local: f.local.trim() || null, responsavel_id: f.responsavel || null, revisor_id: f.revisor || null,
      participantes: f.participantes.filter(p => p !== f.responsavel && p !== f.revisor),
    };
    setSalvando(true);
    try {
      const salva = tarefa ? await db.tarefas.update(tarefa.id, dados) : await db.tarefas.insert(dados);
      toast.ok(tarefa ? 'Alterações salvas.' : 'Delegado com sucesso.');
      onSalvo(salva, f.sincronizar);
    } catch (e) { toast.erro((e as Error).message); setSalvando(false); }
  }

  const alternar = (id: string) => set('participantes', f.participantes.includes(id) ? f.participantes.filter(x => x !== id) : [...f.participantes, id]);

  return (
    <Modal titulo={tarefa ? 'Editar' : 'Delegar'} onClose={onClose} largo
      rodape={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : tarefa ? 'Salvar' : 'Delegar'}</button></>}>
      <div className="stack">
        <div className="grid c2">
          <Field label="Tipo">
            <select className="select" value={f.tipo} onChange={e => mudarTipo(e.target.value as TipoTarefa)}>
              {TIPOS.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
            </select>
          </Field>
          <Field label="Prioridade">
            <select className="select" value={f.prioridade} onChange={e => set('prioridade', e.target.value as PrioridadeTarefa)}>
              {PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Título"><input className="input" value={f.titulo} maxLength={200} autoFocus onChange={e => set('titulo', e.target.value)} placeholder={f.tipo === 'prazo' ? 'Ex.: Contestação' : f.tipo === 'audiencia' ? 'Ex.: Audiência de instrução' : ''} /></Field>
        <Field label="Descrição"><textarea className="textarea" value={f.descricao} maxLength={4000} onChange={e => set('descricao', e.target.value)} /></Field>

        <div className="grid c3">
          <Field label="Número do processo" dica={!processoOk ? undefined : 'Formato CNJ'}>
            <input className="input" inputMode="numeric" value={f.processo} onChange={e => set('processo', mascararCnj(e.target.value))} placeholder="0000000-00.0000.0.00.0000" aria-invalid={!processoOk} />
            {!processoOk && <span className="hint" style={{ color: 'var(--bad)' }}>Número ou dígito verificador inválido.</span>}
          </Field>
          <Field label="Cliente"><input className="input" value={f.cliente} maxLength={200} onChange={e => set('cliente', e.target.value)} /></Field>
          <Field label="Área">
            <select className="select" value={f.area} onChange={e => set('area', e.target.value as AreaJuridica | '')}>
              <option value="">—</option>
              {AREAS.map(a => <option key={a.id} value={a.id}>{a.rotulo}</option>)}
            </select>
          </Field>
        </div>

        <fieldset className="grupo-campos">
          <legend>{comAgenda ? 'Data e hora' : 'Prazo (opcional)'}</legend>
          <div className="row" style={{ gap: 18 }}>
            <label className="check"><input type="checkbox" checked={f.diaInteiro} onChange={e => set('diaInteiro', e.target.checked)} />Dia inteiro</label>
            {f.tipo === 'prazo' && <label className="check"><input type="checkbox" checked={f.prazoFatal} onChange={e => set('prazoFatal', e.target.checked)} />Prazo fatal</label>}
          </div>
          <div className="grid c4">
            <Field label="Início"><input className="input" type="date" value={f.data} onChange={e => set('data', e.target.value)} /></Field>
            {!f.diaInteiro && <Field label="Hora"><input className="input" type="time" value={f.hora} onChange={e => set('hora', e.target.value)} /></Field>}
            <Field label="Término"><input className="input" type="date" value={f.dataFim} min={f.data || undefined} onChange={e => set('dataFim', e.target.value)} /></Field>
            {!f.diaInteiro && <Field label="Hora do término"><input className="input" type="time" value={f.horaFim} onChange={e => set('horaFim', e.target.value)} /></Field>}
          </div>
          <div className="grid c2">
            <Field label="Local ou link"><input className="input" value={f.local} maxLength={300} onChange={e => set('local', e.target.value)} placeholder="Fórum, sala ou link da videochamada" /></Field>
            <Field label="Lembrete">
              <select className="select" value={f.lembrete} onChange={e => set('lembrete', Number(e.target.value))}>
                {LEMBRETES.map(l => <option key={l.min} value={l.min}>{l.rotulo}</option>)}
              </select>
            </Field>
          </div>
        </fieldset>

        <div className="grid c2">
          <Field label="Responsável">
            <select className="select" value={f.responsavel} onChange={e => set('responsavel', e.target.value)}>
              <option value="">Sem responsável</option>
              {equipe.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>
          <Field label="Revisor">
            <select className="select" value={f.revisor} onChange={e => set('revisor', e.target.value)}>
              <option value="">Sem revisor</option>
              {equipe.filter(p => p.id !== f.responsavel).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>
        </div>
        <fieldset className="grupo-campos">
          <legend>Participantes</legend>
          <div className="participantes">
            {equipe.filter(p => p.id !== f.responsavel && p.id !== f.revisor).map(p => (
              <label key={p.id} className="check"><input type="checkbox" checked={f.participantes.includes(p.id)} onChange={() => alternar(p.id)} />{p.nome}</label>
            ))}
          </div>
        </fieldset>
        {comAgenda && googleConectado && (
          <label className="check"><input type="checkbox" checked={f.sincronizar} onChange={e => set('sincronizar', e.target.checked)} />Marcar no meu Google Agenda e convidar os envolvidos</label>
        )}
      </div>
    </Modal>
  );
}
