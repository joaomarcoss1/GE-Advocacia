import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Badge, Field, Modal, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { CATEGORIAS_MODELO, GRUPOS_VARIAVEIS, VARIAVEIS, variaveisDesconhecidas, type CategoriaModelo, type ModeloDocumento } from '@/lib/modelos';
import type { AreaJuridica, ChecklistModelo } from '@/lib/types';
import { Previa } from '@/components/ModeloUsar';

export const AREAS: { id: AreaJuridica; rotulo: string }[] = [
  { id: 'civel', rotulo: 'Cível' }, { id: 'trabalhista', rotulo: 'Trabalhista' }, { id: 'familia', rotulo: 'Família e sucessões' }, { id: 'previdenciario', rotulo: 'Previdenciário' },
  { id: 'empresarial', rotulo: 'Empresarial' }, { id: 'tributario', rotulo: 'Tributário' }, { id: 'criminal', rotulo: 'Criminal' }, { id: 'administrativo', rotulo: 'Administrativo' }, { id: 'outro', rotulo: 'Outra' },
];
export const rotuloArea = (a: string | null) => AREAS.find(x => x.id === a)?.rotulo ?? 'Geral';

/** Cria ou edita um modelo de peça. Os campos {{grupo.campo}} são inseridos pelo seletor, sem precisar decorar. */
export function ModeloEditor({ modelo, onClose, aoSalvar }: { modelo: ModeloDocumento | null; onClose(): void; aoSalvar(): void }) {
  const { db } = useDados();
  const toast = useToast();
  const [titulo, setTitulo] = useState(modelo?.titulo ?? '');
  const [categoria, setCategoria] = useState<CategoriaModelo>(modelo?.categoria ?? 'manifestacoes');
  const [area, setArea] = useState<AreaJuridica | ''>(modelo?.area ?? '');
  const [descricao, setDescricao] = useState(modelo?.descricao ?? '');
  const [conteudo, setConteudo] = useState(modelo?.conteudo ?? '');
  const [ver, setVer] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const desconhecidas = useMemo(() => variaveisDesconhecidas(conteudo), [conteudo]);

  function inserir(chave: string) {
    if (!chave) return;
    const el = ref.current, ins = `{{${chave}}}`;
    const ini = el?.selectionStart ?? conteudo.length, fim = el?.selectionEnd ?? conteudo.length;
    setConteudo(conteudo.slice(0, ini) + ins + conteudo.slice(fim));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + ins.length, ini + ins.length); });
  }
  async function salvar() {
    setSalvando(true);
    try {
      const dados = { titulo: titulo.trim(), categoria, area: area || null, descricao: descricao.trim() || null, conteudo, ativo: true };
      if (modelo) await db.modelosDocumentos.update(modelo.id, dados); else await db.modelosDocumentos.insert(dados);
      toast.ok(modelo ? 'Modelo atualizado.' : 'Modelo criado.'); aoSalvar();
    } catch (e) { toast.erro((e as Error).message); } finally { setSalvando(false); }
  }
  const valido = titulo.trim().length >= 2 && conteudo.length >= 20;
  return (
    <Modal titulo={modelo ? 'Editar modelo' : 'Novo modelo'} onClose={onClose} largo rodape={<>
      <button className="btn ghost" onClick={onClose}>Cancelar</button>
      <button className="btn gold" onClick={salvar} disabled={!valido || salvando}>{salvando ? 'Salvando…' : 'Salvar modelo'}</button>
    </>}>
      <div className="stack">
        <div className="grid c2">
          <Field label="Título"><input className="input" value={titulo} maxLength={160} onChange={e => setTitulo(e.target.value)} /></Field>
          <Field label="Tipo de documento">
            <select className="select" value={categoria} onChange={e => setCategoria(e.target.value as CategoriaModelo)}>{CATEGORIAS_MODELO.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}</select>
          </Field>
        </div>
        <div className="grid c2">
          <Field label="Área"><select className="select" value={area} onChange={e => setArea(e.target.value as AreaJuridica | '')}><option value="">Geral</option>{AREAS.map(a => <option key={a.id} value={a.id}>{a.rotulo}</option>)}</select></Field>
          <Field label="Quando usar (opcional)"><input className="input" value={descricao} maxLength={400} onChange={e => setDescricao(e.target.value)} /></Field>
        </div>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Field label="Inserir campo do sistema">
            <select className="select" value="" onChange={e => inserir(e.target.value)} aria-label="Inserir campo do sistema">
              <option value="">Escolha um campo…</option>
              {GRUPOS_VARIAVEIS.map(g => <optgroup key={g} label={g}>{VARIAVEIS.filter(v => v.grupo === g).map(v => <option key={v.chave} value={v.chave}>{v.rotulo}</option>)}</optgroup>)}
            </select>
          </Field>
          <button className="btn ghost sm" onClick={() => setVer(v => !v)}>{ver ? 'Voltar ao texto' : 'Ver prévia'}</button>
        </div>
        {ver ? <Previa texto={conteudo} /> : (
          <textarea ref={ref} className="textarea mono" style={{ minHeight: 360 }} aria-label="Texto do modelo" value={conteudo} maxLength={80000} onChange={e => setConteudo(e.target.value)} />
        )}
        <small className="muted">
          Use <code>{'{{cliente.nome}}'}</code> para dados do sistema (ou <code>{'{{cliente.rg|padrão}}'}</code> com texto padrão), <code>[entre colchetes]</code> para o que se preenche à mão, <code># Título</code>, <code>## Seção</code>,
          <code> &gt;&gt; </code> centralizado, <code>{' << '}</code> à direita, <code>**negrito**</code> e <code>- item</code>.
        </small>
        {desconhecidas.length > 0 && <Badge tom="warn">Campo(s) inexistente(s): {desconhecidas.join(', ')}</Badge>}
      </div>
    </Modal>
  );
}

type Linha = { nome: string; obrigatorio: boolean };
/** Cria ou edita uma lista de documentos (modelo de checklist) para um tipo de processo. */
export function ListaEditor({ lista, inicial, onClose, aoSalvar }: { lista: ChecklistModelo | null; inicial?: { itens: Linha[]; area?: AreaJuridica | null; tipo?: string }; onClose(): void; aoSalvar(): void }) {
  const { db } = useDados();
  const toast = useToast();
  const [nome, setNome] = useState(lista?.nome ?? '');
  const [tipo, setTipo] = useState(lista?.tipo ?? inicial?.tipo ?? '');
  const [area, setArea] = useState<AreaJuridica | ''>(lista?.area ?? inicial?.area ?? '');
  const [descricao, setDescricao] = useState(lista?.descricao ?? '');
  const [itens, setItens] = useState<Linha[]>(lista?.itens.map(i => ({ nome: i.nome, obrigatorio: i.obrigatorio !== false })) ?? inicial?.itens ?? [{ nome: '', obrigatorio: true }]);
  const [salvando, setSalvando] = useState(false);
  const set = (i: number, p: Partial<Linha>) => setItens(l => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const mover = (i: number, d: -1 | 1) => setItens(l => { const k = i + d; if (k < 0 || k >= l.length) return l; const c = [...l]; [c[i], c[k]] = [c[k], c[i]]; return c; });
  const validos = itens.filter(i => i.nome.trim());

  async function salvar() {
    setSalvando(true);
    try {
      const dados = { nome: nome.trim(), tipo: tipo.trim() || null, area: area || null, descricao: descricao.trim() || null, ativo: true, itens: validos.map(i => ({ nome: i.nome.trim(), ...(i.obrigatorio ? {} : { obrigatorio: false }) })) };
      if (lista) await db.checklist.modelos.update(lista.id, dados); else await db.checklist.modelos.insert(dados);
      toast.ok('Lista salva.'); aoSalvar();
    } catch (e) { toast.erro((e as Error).message); } finally { setSalvando(false); }
  }
  return (
    <Modal titulo={lista ? 'Editar lista de documentos' : 'Nova lista de documentos'} onClose={onClose} largo rodape={<>
      <button className="btn ghost" onClick={onClose}>Cancelar</button>
      <button className="btn gold" onClick={salvar} disabled={nome.trim().length < 2 || validos.length === 0 || salvando}>{salvando ? 'Salvando…' : 'Salvar lista'}</button>
    </>}>
      <div className="stack">
        <div className="grid c2">
          <Field label="Nome da lista"><input className="input" value={nome} maxLength={120} onChange={e => setNome(e.target.value)} /></Field>
          <Field label="Tipo de processo" dica="Ex.: Reclamação trabalhista. A lista é sugerida nos processos desse tipo."><input className="input" value={tipo} maxLength={120} onChange={e => setTipo(e.target.value)} /></Field>
        </div>
        <div className="grid c2">
          <Field label="Área"><select className="select" value={area} onChange={e => setArea(e.target.value as AreaJuridica | '')}><option value="">Geral</option>{AREAS.map(a => <option key={a.id} value={a.id}>{a.rotulo}</option>)}</select></Field>
          <Field label="Observação (opcional)"><input className="input" value={descricao} maxLength={400} onChange={e => setDescricao(e.target.value)} /></Field>
        </div>
        <div className="section-title">Documentos ({validos.length})</div>
        <ul className="lista-edicao">
          {itens.map((it, i) => (
            <li key={i}>
              <input className="input grow" aria-label={`Documento ${i + 1}`} value={it.nome} maxLength={200} placeholder="Nome do documento" onChange={e => set(i, { nome: e.target.value })} />
              <label className="check"><input type="checkbox" checked={it.obrigatorio} onChange={e => set(i, { obrigatorio: e.target.checked })} />Obrigatório</label>
              <button className="icon-btn" aria-label="Subir" onClick={() => mover(i, -1)} disabled={i === 0}><ArrowUp size={15} /></button>
              <button className="icon-btn" aria-label="Descer" onClick={() => mover(i, 1)} disabled={i === itens.length - 1}><ArrowDown size={15} /></button>
              <button className="icon-btn" aria-label="Remover documento" onClick={() => setItens(l => (l.length > 1 ? l.filter((_, k) => k !== i) : [{ nome: '', obrigatorio: true }]))}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
        <div><button className="btn ghost sm" onClick={() => setItens(l => (l.length < 80 ? [...l, { nome: '', obrigatorio: true }] : l))}><Plus size={15} />Adicionar documento</button></div>
      </div>
    </Modal>
  );
}
