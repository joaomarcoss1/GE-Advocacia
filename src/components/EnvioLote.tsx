import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { AlertTriangle, Check, Loader2, UploadCloud, X } from 'lucide-react';
import { Badge, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { fmtTamanho } from '@/lib/anexos';
import { ACEITA_DOCUMENTO } from '@/lib/checklist';
import { prepararDocumento } from '@/lib/documentos';
import { CATEGORIAS, sugerirCategoria, sugerirItem, type CategoriaDoc } from '@/lib/organizacao';
import type { ChecklistItem, DocumentoArquivo } from '@/lib/types';
import { plural } from '@/lib/format';

const MAX_ARQUIVOS = 40;

async function hashArquivo(f: File): Promise<string | null> {
  try {
    const h = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

interface Linha {
  id: string; file: File; categoria: CategoriaDoc; catManual: boolean; item: string; sha: string | null;
  dup: 'existente' | 'lote' | null; incluir: boolean; estado: 'espera' | 'enviando' | 'ok' | 'erro'; erro?: string;
}

/** Área de soltar arquivos (ou clicar para escolher). Aceita vários de uma vez, inclusive fotos do celular. */
export function AreaSoltar({ aoReceber, children, desabilitado }: { aoReceber(files: File[]): void; children?: ReactNode; desabilitado?: boolean }) {
  const [sobre, setSobre] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const soltar = (e: DragEvent) => { e.preventDefault(); setSobre(false); if (!desabilitado && e.dataTransfer.files.length) aoReceber(Array.from(e.dataTransfer.files)); };
  return (
    <label className={`area-soltar${sobre ? ' sobre' : ''}${desabilitado ? ' off' : ''}`}
      onDragOver={e => { e.preventDefault(); if (!desabilitado) setSobre(true); }} onDragLeave={() => setSobre(false)} onDrop={soltar}>
      <UploadCloud size={22} aria-hidden="true" />
      <span><strong>Arraste os arquivos aqui</strong> ou clique para escolher</span>
      <small className="muted">PDF, imagem, Word ou Excel · até 20 MB cada · vários de uma vez</small>
      {children}
      <input ref={entrada} type="file" hidden multiple accept={ACEITA_DOCUMENTO} aria-label="Escolher documentos para enviar" disabled={desabilitado}
        onChange={e => { if (e.target.files?.length) aoReceber(Array.from(e.target.files)); e.target.value = ''; }} />
    </label>
  );
}

/**
 * Revisão e envio em lote: cada arquivo recebe uma categoria (que vira a subpasta no Drive) e, se couber, o item da lista que ele atende.
 * O sistema sugere os dois pelo nome; a equipe só confere. Arquivos repetidos (mesmo conteúdo) vêm desmarcados.
 */
export default function EnvioLote({ clienteId, processoId = null, arquivosIniciais = [], aoConcluir, aoCancelar }: {
  clienteId: string; processoId?: string | null; arquivosIniciais?: File[]; aoConcluir(enviados: number): void; aoCancelar(): void;
}) {
  const { db } = useDados();
  const toast = useToast();
  const demo = db.modo === 'local';
  const [itens, setItens] = useState<ChecklistItem[]>([]);
  const [existentes, setExistentes] = useState<DocumentoArquivo[]>([]);
  const [prontos, setProntos] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [enviando, setEnviando] = useState(false);
  const usados = useRef(0);

  useEffect(() => {
    let vivo = true;
    void Promise.all([db.checklist.itens.list().catch(() => []), db.arquivos.list(processoId ? { processo_id: processoId } : { cliente_id: clienteId }).catch(() => [])]).then(([its, ds]) => {
      if (!vivo) return;
      setItens(its.filter(i => (processoId ? i.processo_id === processoId : !i.processo_id && i.cliente_id === clienteId)).sort((a, b) => a.ordem - b.ordem));
      setExistentes(ds.filter(d => (processoId ? d.processo_id === processoId : !d.processo_id && d.cliente_id === clienteId)));
      setProntos(true);
    });
    return () => { vivo = false; };
  }, [db, clienteId, processoId]);

  const hashesExistentes = useMemo(() => new Set(existentes.map(d => d.sha256).filter(Boolean) as string[]), [existentes]);

  async function adicionar(files: File[]) {
    const livres = MAX_ARQUIVOS - linhas.length;
    if (files.length > livres) toast.erro(`Envie até ${MAX_ARQUIVOS} arquivos por vez. Os demais foram ignorados.`);
    const novos: Linha[] = [];
    for (const file of files.slice(0, Math.max(0, livres))) {
      const sha = await hashArquivo(file);
      const it = sugerirItem(file.name, itens);
      novos.push({ id: `l${usados.current++}`, file, categoria: sugerirCategoria(file.name, it?.nome), catManual: false, item: it?.id ?? '', sha, dup: null, incluir: true, estado: 'espera' });
    }
    setLinhas(atual => marcarRepetidos([...atual, ...novos], hashesExistentes));
  }
  // arquivos que chegaram junto com a abertura (soltos sobre o dossiê) entram depois que a lista de itens carregou
  const jaIniciou = useRef(false);
  useEffect(() => { if (prontos && !jaIniciou.current) { jaIniciou.current = true; if (arquivosIniciais.length) void adicionar(arquivosIniciais); } }); // eslint-disable-line react-hooks/exhaustive-deps

  const mudar = (id: string, p: Partial<Linha>) => setLinhas(ls => ls.map(l => (l.id === id ? { ...l, ...p } : l)));
  const escolherItem = (l: Linha, item: string) => {
    const nome = itens.find(i => i.id === item)?.nome;
    mudar(l.id, { item, ...(l.catManual ? {} : { categoria: sugerirCategoria(l.file.name, nome) }) });
  };
  const remover = (id: string) => setLinhas(ls => marcarRepetidos(ls.filter(l => l.id !== id), hashesExistentes));

  const aEnviar = linhas.filter(l => l.incluir && l.estado !== 'ok');
  async function enviar() {
    setEnviando(true);
    let ok = linhas.filter(l => l.estado === 'ok').length, falhas = 0;
    for (const l of aEnviar) {
      mudar(l.id, { estado: 'enviando', erro: undefined });
      try {
        const arquivo = await prepararDocumento(l.file, demo);
        await db.arquivos.enviar({ cliente_id: clienteId, processo_id: processoId, item_id: l.item || null, categoria: l.categoria, arquivo });
        mudar(l.id, { estado: 'ok' }); ok++;
      } catch (e) { mudar(l.id, { estado: 'erro', erro: (e as Error).message }); falhas++; }
    }
    setEnviando(false);
    if (ok) toast.ok(ok === 1 ? 'Documento salvo.' : `${ok} documentos salvos.`);
    if (ok && !falhas) aoConcluir(ok);                       // tudo certo: fecha; com falha, a lista fica para tentar de novo
  }

  if (!prontos) return <div className="esq linha" aria-busy="true" />;
  return (
    <div className="stack envio-lote">
      <AreaSoltar aoReceber={f => void adicionar(f)} desabilitado={enviando} />
      {linhas.length > 0 && (
        <ul className="lote" aria-label="Arquivos a enviar">
          {linhas.map(l => (
            <li key={l.id} className={`lote-linha ${l.estado}${l.incluir ? '' : ' fora'}`}>
              <label className="check lote-inc"><input type="checkbox" checked={l.incluir} disabled={enviando || l.estado === 'ok'} onChange={e => mudar(l.id, { incluir: e.target.checked })} aria-label={`Enviar ${l.file.name}`} /></label>
              <div className="lote-nome">
                <strong title={l.file.name}>{l.file.name}</strong>
                <small className="muted">{fmtTamanho(l.file.size)}</small>
                {l.dup === 'existente' && <Badge tom="warn">Já enviado antes</Badge>}
                {l.dup === 'lote' && <Badge tom="warn">Repetido neste lote</Badge>}
                {l.estado === 'ok' && <Badge tom="ok"><Check size={12} /> Salvo</Badge>}
                {l.estado === 'enviando' && <Loader2 size={15} className="gira" aria-label="Enviando" />}
                {l.estado === 'erro' && <span className="lote-erro" role="alert"><AlertTriangle size={13} /> {l.erro}</span>}
              </div>
              <select className="select sm" aria-label={`Categoria de ${l.file.name}`} value={l.categoria} disabled={enviando || l.estado === 'ok'} onChange={e => mudar(l.id, { categoria: e.target.value as CategoriaDoc, catManual: true })}>
                {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
              </select>
              <select className="select sm" aria-label={`Item da lista para ${l.file.name}`} value={l.item} disabled={enviando || l.estado === 'ok'} onChange={e => escolherItem(l, e.target.value)}>
                <option value="">Sem item da lista</option>
                {itens.filter(i => i.status !== 'dispensado').map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
              {l.estado !== 'ok' && <button className="icon-btn" aria-label={`Tirar ${l.file.name} da lista`} disabled={enviando} onClick={() => remover(l.id)}><X size={16} /></button>}
            </li>
          ))}
        </ul>
      )}
      <div className="row between fx-wrap g-8" >
        <small className="muted">{linhas.length ? `${aEnviar.length} de ${plural(linhas.length, 'selecionado', 'selecionados')}` : 'Nenhum arquivo escolhido.'}</small>
        <div className="row g-8" >
          <button className="btn ghost" onClick={aoCancelar} disabled={enviando}>Fechar</button>
          <button className="btn gold" onClick={enviar} disabled={enviando || aEnviar.length === 0}>{enviando ? 'Enviando…' : aEnviar.length ? `Salvar ${aEnviar.length} documento${aEnviar.length > 1 ? 's' : ''}` : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

/** Marca o que já existe no dossiê (mesmo conteúdo) e o que se repete dentro do lote; repetidos começam desmarcados. */
function marcarRepetidos(ls: Linha[], existentes: Set<string>): Linha[] {
  const vistos = new Set<string>();
  return ls.map(l => {
    if (l.estado === 'ok' || !l.sha) return { ...l, dup: null };
    const dup = existentes.has(l.sha) ? 'existente' as const : vistos.has(l.sha) ? 'lote' as const : null;
    vistos.add(l.sha);
    const mudou = dup !== l.dup;
    return { ...l, dup, incluir: mudou ? dup === null : l.incluir };
  });
}
