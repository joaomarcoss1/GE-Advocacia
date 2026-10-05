import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Field, Modal, useToast } from '@/components/ui';
import ClienteModal from '@/components/ClienteModal';
import { useDados } from '@/context/Dados';
import { mascararCnj, normalizarCnj } from '@/lib/cnj';
import { tribunalDeCnj } from '@/lib/processos';
import { AREAS } from '@/lib/tarefas';
import type { AreaJuridica, FaseProcesso, PoloProcesso, Processo, SituacaoProcesso } from '@/lib/types';

const SITUACOES: [SituacaoProcesso, string][] = [['ativo', 'Ativo'], ['suspenso', 'Suspenso'], ['arquivado', 'Arquivado'], ['encerrado', 'Encerrado']];
const FASES: [FaseProcesso, string][] = [['conhecimento', 'Conhecimento'], ['recursal', 'Recursal'], ['execucao', 'Execução'], ['encerramento', 'Encerramento']];
const POLOS: [PoloProcesso, string][] = [['ativo', 'Autor / ativo'], ['passivo', 'Réu / passivo'], ['terceiro', 'Terceiro']];

/** Cadastro do processo: digitou o número, o sistema busca classe, assunto e órgão e já acompanha os andamentos. */
export default function ProcessoModal({ processo, padrao, onClose, onSalvo }: { processo: Processo | null; padrao?: { cliente_id?: string }; onClose(): void; onSalvo(p: Processo): void }) {
  const { db, clientes, funcionarios, config, recarregar } = useDados();
  const toast = useToast();
  const [f, setF] = useState({
    numero: processo?.numero ?? '', titulo: processo?.titulo ?? '', cliente_id: processo?.cliente_id ?? padrao?.cliente_id ?? '', polo: (processo?.polo ?? 'ativo') as PoloProcesso,
    parte_contraria: processo?.parte_contraria ?? '', area: (processo?.area ?? '') as AreaJuridica | '', classe: processo?.classe ?? '', assunto: processo?.assunto ?? '',
    orgao_julgador: processo?.orgao_julgador ?? '', grau: processo?.grau ?? '', data_ajuizamento: processo?.data_ajuizamento ?? '', responsavel_id: processo?.responsavel_id ?? '',
    situacao: (processo?.situacao ?? 'ativo') as SituacaoProcesso, fase: (processo?.fase ?? 'conhecimento') as FaseProcesso, valor: processo?.valor_causa != null ? String(processo.valor_causa).replace('.', ',') : '',
    monitorar: processo?.monitorar ?? true, sigiloso: processo?.sigiloso ?? false, observacoes: processo?.observacoes ?? '', modelo: '',
  });
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [novoCliente, setNovoCliente] = useState(false);
  const [modelos, setModelos] = useState<{ id: string; nome: string; area: AreaJuridica | null }[]>([]);
  const [modeloTocado, setModeloTocado] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  const cnj = useMemo(() => normalizarCnj(f.numero), [f.numero]);
  const tribunal = cnj ? tribunalDeCnj(cnj) : null;
  const equipe = useMemo(() => funcionarios.filter(x => x.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [funcionarios]);

  useEffect(() => { if (!processo) db.checklist.modelos.list().then(m => setModelos(m.filter(x => x.ativo))).catch(() => undefined); }, [db, processo]);
  const modeloEscolhido = modeloTocado ? f.modelo : (modelos.find(m => m.area && m.area === f.area)?.id ?? '');

  async function preencher() {
    if (!cnj) return toast.erro('Digite o número do processo (20 dígitos) para buscar.');
    setBuscando(true);
    try {
      const d = await db.processos.buscar(cnj);
      if (!d) toast.erro('Não encontramos dados públicos para este número (segredo de justiça, tribunal sem consulta ou ainda não publicado). Preencha à mão.');
      else {
        setF(x => ({ ...x, classe: d.classe ?? x.classe, assunto: d.assunto ?? x.assunto, orgao_julgador: d.orgao_julgador ?? x.orgao_julgador, grau: d.grau ?? x.grau, data_ajuizamento: d.data_ajuizamento ?? x.data_ajuizamento, sigiloso: d.sigiloso || x.sigiloso }));
        toast.ok('Dados do processo preenchidos.');
      }
    } catch (e) { toast.erro((e as Error).message); } finally { setBuscando(false); }
  }

  async function salvar() {
    if (!cnj) return toast.erro('Número de processo inválido. Confira os 20 dígitos (formato CNJ).');
    if (!f.cliente_id) return toast.erro('Escolha o cliente (ou cadastre um novo).');
    const valor = f.valor.trim() ? Number(f.valor.replace(/\./g, '').replace(',', '.')) : null;
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return toast.erro('Valor da causa inválido.');
    setSalvando(true);
    try {
      const dados: Partial<Processo> = {
        numero: cnj, cliente_id: f.cliente_id, titulo: f.titulo.trim() || null, polo: f.polo, parte_contraria: f.parte_contraria.trim() || null, area: f.area || null, classe: f.classe.trim() || null,
        assunto: f.assunto.trim() || null, orgao_julgador: f.orgao_julgador.trim() || null, grau: f.grau.trim() || null, data_ajuizamento: f.data_ajuizamento || null, tribunal: tribunal?.alias ?? null,
        responsavel_id: f.responsavel_id || null, situacao: f.situacao, fase: f.fase, valor_causa: valor, monitorar: f.monitorar, sigiloso: f.sigiloso, observacoes: f.observacoes.trim() || null,
      };
      const salvo = processo ? await db.processos.update(processo.id, dados) : await db.processos.insert(dados);
      if (!processo) {
        if (modeloEscolhido) { try { await db.checklist.aplicar(modeloEscolhido, { processo_id: salvo.id }); } catch { /* a lista pode ser aplicada depois */ } }
        if (salvo.monitorar) { try { await db.processos.consultar(salvo.id); } catch { /* a primeira consulta roda de novo na próxima atualização */ } }
      }
      toast.ok(processo ? 'Processo atualizado.' : 'Processo cadastrado.');
      onSalvo(salvo);
    } catch (e) { toast.erro((e as Error).message); setSalvando(false); }
  }

  return (
    <>
      <Modal titulo={processo ? 'Editar processo' : 'Novo processo'} onClose={onClose} largo
        rodape={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button></>}>
        <div className="stack">
          <Field label="Número do processo" dica={cnj && tribunal ? `Tribunal: ${tribunal.sigla}` : cnj ? 'Tribunal sem consulta automática' : undefined}>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              <input className="input mono" inputMode="numeric" autoFocus value={f.numero} placeholder="0000000-00.0000.0.00.0000" aria-invalid={!!f.numero && !cnj} onChange={e => set('numero', mascararCnj(e.target.value))} />
              <button type="button" className="btn ghost" onClick={preencher} disabled={buscando || !cnj}><Search size={16} />{buscando ? 'Buscando…' : 'Buscar dados'}</button>
            </div>
            {!!f.numero && f.numero.replace(/\D/g, '').length === 20 && !cnj && <span className="hint" style={{ color: 'var(--bad)' }}>Dígito verificador inválido: confira o número.</span>}
          </Field>
          <div className="grid c2">
            <Field label="Cliente">
              <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                <select className="select" value={f.cliente_id} onChange={e => set('cliente_id', e.target.value)}>
                  <option value="">Escolha…</option>
                  {clientes.filter(c => c.ativo || c.id === f.cliente_id).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <button type="button" className="btn ghost" onClick={() => setNovoCliente(true)}>Novo</button>
              </div>
            </Field>
            <Field label="Apelido do processo"><input className="input" value={f.titulo} maxLength={200} placeholder="Ex.: Beta x Delta" onChange={e => set('titulo', e.target.value)} /></Field>
          </div>
          <div className="grid c3">
            <Field label="Posição do cliente"><select className="select" value={f.polo} onChange={e => set('polo', e.target.value as PoloProcesso)}>{POLOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Field>
            <Field label="Parte contrária"><input className="input" value={f.parte_contraria} maxLength={200} onChange={e => set('parte_contraria', e.target.value)} /></Field>
            <Field label="Área"><select className="select" value={f.area} onChange={e => set('area', e.target.value as AreaJuridica | '')}><option value="">—</option>{AREAS.map(a => <option key={a.id} value={a.id}>{a.rotulo}</option>)}</select></Field>
          </div>
          <div className="grid c3">
            <Field label="Classe"><input className="input" value={f.classe} onChange={e => set('classe', e.target.value)} /></Field>
            <Field label="Assunto"><input className="input" value={f.assunto} onChange={e => set('assunto', e.target.value)} /></Field>
            <Field label="Órgão julgador"><input className="input" value={f.orgao_julgador} onChange={e => set('orgao_julgador', e.target.value)} /></Field>
          </div>
          <div className="grid c3">
            <Field label="Advogado responsável"><select className="select" value={f.responsavel_id} onChange={e => set('responsavel_id', e.target.value)}><option value="">Sem responsável</option>{equipe.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Field>
            <Field label="Valor da causa (R$)"><input className="input" inputMode="decimal" value={f.valor} onChange={e => set('valor', e.target.value)} /></Field>
            <Field label="Ajuizamento"><input className="input" type="date" value={f.data_ajuizamento} onChange={e => set('data_ajuizamento', e.target.value)} /></Field>
          </div>
          {processo && (
            <div className="grid c2">
              <Field label="Situação"><select className="select" value={f.situacao} onChange={e => set('situacao', e.target.value as SituacaoProcesso)}>{SITUACOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Field>
              <Field label="Fase"><select className="select" value={f.fase} onChange={e => set('fase', e.target.value as FaseProcesso)}>{FASES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Field>
            </div>
          )}
          {!processo && modelos.length > 0 && (
            <Field label="Lista de documentos">
              <select className="select" value={modeloEscolhido} onChange={e => { setModeloTocado(true); set('modelo', e.target.value); }}>
                <option value="">Sem lista</option>
                {modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </Field>
          )}
          <Field label="Observações"><textarea className="textarea" value={f.observacoes} maxLength={2000} onChange={e => set('observacoes', e.target.value)} /></Field>
          <label className="check"><input type="checkbox" checked={f.monitorar} onChange={e => set('monitorar', e.target.checked)} />Acompanhar os andamentos automaticamente{config.automacao.tarefa_andamento ? ' e criar tarefas' : ''}</label>
        </div>
      </Modal>
      {novoCliente && <ClienteModal cliente={null} onClose={() => setNovoCliente(false)} onSalvo={async c => { await recarregar(); set('cliente_id', c.id); setNovoCliente(false); }} />}
    </>
  );
}
