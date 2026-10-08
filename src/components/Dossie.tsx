import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CircleDashed, Cloud, Eye, FolderOpen, Link2, MinusCircle, Plus, Trash2, UploadCloud } from 'lucide-react';
import { Badge, Modal, useConfirm, useToast } from '@/components/ui';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import EnvioLote, { AreaSoltar } from '@/components/EnvioLote';
import { fmtTamanho } from '@/lib/anexos';
import { CATEGORIAS, rotuloCategoria, type CategoriaDoc } from '@/lib/organizacao';
import { ACEITA_DOCUMENTO } from '@/lib/checklist';
import { fmtData, isoParaBR } from '@/lib/datetime';
import { abrirNovaAba, prepararDocumento } from '@/lib/documentos';
import type { ChecklistItem, ChecklistModelo, DocumentoArquivo, DriveStatus, LinkEnvio } from '@/lib/types';

const ICONE = { pendente: CircleDashed, recebido: Check, conferido: Check, dispensado: MinusCircle } as const;
const ROTULO = { pendente: 'Pendente', recebido: 'Recebido', conferido: 'Conferido', dispensado: 'Dispensado' } as const;
export const progressoDe = (itens: ChecklistItem[]) => {
  const obrig = itens.filter(i => i.obrigatorio && i.status !== 'dispensado');
  const feitos = obrig.filter(i => i.status === 'recebido' || i.status === 'conferido').length;
  return { total: obrig.length, feitos, pct: obrig.length ? Math.round((feitos / obrig.length) * 100) : 100 };
};

/** Dossiê de documentos de um cliente ou processo: checklist, arquivos recebidos (com conferência e Drive) e o link para o cliente enviar sozinho. */
export default function Dossie({ clienteId, processoId = null, aoMudar }: { clienteId: string; processoId?: string | null; aoMudar?(): void }) {
  const { db, clientes, processos } = useDados();
  const { sessao } = useAuth();
  const toast = useToast();
  const confirmar = useConfirm();
  const gestao = sessao?.papel === 'admin' || sessao?.papel === 'gerente';
  const [itens, setItens] = useState<ChecklistItem[]>([]);
  const [docs, setDocs] = useState<DocumentoArquivo[]>([]);
  const [modelos, setModelos] = useState<ChecklistModelo[]>([]);
  const [links, setLinks] = useState<LinkEnvio[]>([]);
  const [drive, setDrive] = useState<DriveStatus>({ disponivel: false, conectado: false });
  const [carregado, setCarregado] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [modelo, setModelo] = useState('');
  const [novoItem, setNovoItem] = useState('');
  const [novoLink, setNovoLink] = useState<{ url: string; expira: string } | null>(null);
  const [lote, setLote] = useState<File[] | null>(null);
  const cliente = clientes.find(c => c.id === clienteId);
  const processo = processoId ? processos.find(p => p.id === processoId) : null;

  const carregar = useCallback(async () => {
    const [its, ds, ms, ls, dr] = await Promise.all([
      db.checklist.itens.list(), db.arquivos.list(processoId ? { processo_id: processoId } : { cliente_id: clienteId }),
      db.checklist.modelos.list(), db.arquivos.links.list(), db.arquivos.drive.status().catch(() => ({ disponivel: false, conectado: false }) as DriveStatus),
    ]);
    setItens(its.filter(i => (processoId ? i.processo_id === processoId : !i.processo_id && i.cliente_id === clienteId)).sort((a, b) => a.ordem - b.ordem));
    setDocs(ds.filter(d => (processoId ? d.processo_id === processoId : !d.processo_id && d.cliente_id === clienteId)));
    const ativos = ms.filter(m => m.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    setModelos(ativos);
    setModelo(m => m || (ativos.find(x => x.area && x.area === processo?.area) ?? ativos[0])?.id || '');
    setLinks(ls.filter(l => l.ativo && Date.parse(l.expira_em) > Date.now() && l.cliente_id === clienteId && (processoId ? l.processo_id === processoId : !l.processo_id)));
    setDrive(dr); setCarregado(true);
  }, [db, clienteId, processoId, processo?.area]);
  useEffect(() => { void carregar(); }, [carregar]);
  const atualizar = async () => { await carregar(); aoMudar?.(); };
  const demo = db.modo === 'local';

  async function enviar(item: ChecklistItem | null, files: FileList | null) {
    if (!files?.length) return;
    setOcupado(item?.id ?? 'avulso');
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        const arquivo = await prepararDocumento(f, demo);
        await db.arquivos.enviar({ cliente_id: clienteId, processo_id: processoId, item_id: item?.id ?? null, arquivo });
        ok++;
      } catch (e) { toast.erro((e as Error).message); }
    }
    setOcupado(null);
    if (ok) { toast.ok(ok === 1 ? 'Documento salvo.' : `${ok} documentos salvos.`); await atualizar(); }
  }
  async function conferir(d: DocumentoArquivo) {
    try {
      await db.arquivos.conferir(d.id, !d.conferido);
      if (d.item_id) {
        const outros = docs.filter(x => x.item_id === d.item_id && x.id !== d.id);
        const todos = !d.conferido && outros.every(x => x.conferido);
        await db.checklist.itens.update(d.item_id, { status: todos ? 'conferido' : 'recebido' });
      }
      await atualizar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function abrir(d: DocumentoArquivo) {
    try { const r = await db.arquivos.abrir(d.id); abrirNovaAba(r.url, r.nome); setTimeout(() => r.revogar?.(), 60_000); } catch (e) { toast.erro((e as Error).message); }
  }
  async function remover(d: DocumentoArquivo) {
    if (!(await confirmar(`Excluir "${d.nome}"? O arquivo sai do sistema${d.drive_status === 'enviado' ? ' e da pasta do Drive' : ''}.`, { perigo: true, rotulo: 'Excluir' }))) return;
    try { await db.arquivos.remover(d.id); await atualizar(); } catch (e) { toast.erro((e as Error).message); }
  }
  async function reclassificar(d: DocumentoArquivo, categoria: CategoriaDoc) {
    try { await db.arquivos.reclassificar(d.id, categoria); toast.ok(`Movido para "${rotuloCategoria(categoria)}".`); await atualizar(); } catch (e) { toast.erro((e as Error).message); }
  }
  async function abrirPasta() {
    setOcupado('pasta');
    try { abrirNovaAba(await db.arquivos.drive.pasta({ cliente_id: clienteId, processo_id: processoId }), 'pasta'); } catch (e) { toast.erro((e as Error).message); } finally { setOcupado(null); }
  }
  async function alternarDispensa(i: ChecklistItem) {
    try { await db.checklist.itens.update(i.id, { status: i.status === 'dispensado' ? 'pendente' : 'dispensado' }); await atualizar(); } catch (e) { toast.erro((e as Error).message); }
  }
  async function removerItem(i: ChecklistItem) {
    if (!(await confirmar(`Remover "${i.nome}" da lista?`, { perigo: true, rotulo: 'Remover' }))) return;
    try { await db.checklist.itens.remove(i.id); await atualizar(); } catch (e) { toast.erro((e as Error).message); }
  }
  async function adicionarItem() {
    if (!novoItem.trim()) return;
    try { await db.checklist.itens.insert({ cliente_id: clienteId, processo_id: processoId, nome: novoItem.trim(), obrigatorio: true, status: 'pendente', ordem: Math.max(0, ...itens.map(i => i.ordem)) + 1 }); setNovoItem(''); await atualizar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function aplicar() {
    if (!modelo) return;
    try { const n = await db.checklist.aplicar(modelo, { processo_id: processoId, cliente_id: clienteId }); toast.ok(n ? `${n} itens adicionados.` : 'Todos os itens desse modelo já estão na lista.'); await atualizar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function gerarLink() {
    try {
      const { link, token } = await db.arquivos.links.criar({ cliente_id: clienteId, processo_id: processoId, dias: 14, rotulo: processo ? `Processo ${processo.numero}` : undefined });
      setNovoLink({ url: `${location.origin}/enviar/${token}`, expira: link.expira_em });
      await carregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function revogar(l: LinkEnvio) {
    if (!(await confirmar('Cancelar este link? Quem o recebeu não conseguirá mais enviar arquivos.', { perigo: true, rotulo: 'Cancelar link' }))) return;
    try { await db.arquivos.links.revogar(l.id); await carregar(); } catch (e) { toast.erro((e as Error).message); }
  }

  const prog = progressoDe(itens);
  const soltos = useMemo(() => docs.filter(d => !d.item_id), [docs]);
  const telefone = (cliente?.telefone ?? '').replace(/\D/g, '');
  const mensagem = (url: string) => `Olá${cliente ? `, ${cliente.nome.split(' ')[0]}` : ''}! Para enviar os documentos do seu caso com segurança, use este link: ${url}`;

  const chipDoc = (d: DocumentoArquivo) => (
    <li key={d.id} className="doc">
      <button className="doc-nome" onClick={() => abrir(d)} title="Abrir"><Eye size={15} /><span>{d.nome}</span></button>
      <small className="muted">{fmtTamanho(d.tamanho)} · {fmtData(isoParaBR(d.created_at).data)}{d.origem === 'link_cliente' ? ' · enviado pelo cliente' : ''}</small>
      <span className="doc-acoes">
        <select className="select sm cat-sel" aria-label={`Categoria de ${d.nome}`} value={d.categoria ?? 'outros'} onChange={e => void reclassificar(d, e.target.value as CategoriaDoc)}>
          {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
        </select>
        {d.drive_status === 'enviado' && d.drive_link && <a className="btn ghost sm" href={d.drive_link} target="_blank" rel="noopener noreferrer"><Cloud size={14} />Drive</a>}
        {d.drive_status === 'pendente' && <Badge tom="warn">Drive pendente</Badge>}
        {d.drive_status === 'erro' && <span title={d.drive_erro ?? ''}><Badge tom="bad">Drive com erro</Badge></span>}
        <button className={`btn sm ${d.conferido ? '' : 'ghost'}`} aria-pressed={d.conferido} onClick={() => conferir(d)}>{d.conferido ? 'Conferido' : 'Conferir'}</button>
        {gestao && <button className="icon-btn" aria-label={`Excluir ${d.nome}`} onClick={() => remover(d)}><Trash2 size={16} /></button>}
      </span>
    </li>
  );

  if (!carregado) return <div className="esq linha" aria-busy="true" />;
  return (
    <div className="dossie stack">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="grow" style={{ minWidth: 220 }}>
          <div className="row between"><strong>{prog.feitos} de {prog.total} documentos obrigatórios</strong><span className="muted">{prog.pct}%</span></div>
          <div className="barra" role="progressbar" aria-valuenow={prog.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Documentos recebidos"><i style={{ width: `${prog.pct}%` }} /></div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {drive.disponivel && <Badge tom={drive.conectado ? 'ok' : 'mute'}>{drive.conectado ? 'Drive conectado' : 'Drive não conectado'}</Badge>}
          {drive.conectado && <button className="btn ghost sm" onClick={abrirPasta} disabled={ocupado === 'pasta'}><FolderOpen size={16} />{ocupado === 'pasta' ? 'Abrindo…' : 'Pasta no Drive'}</button>}
          <button className="btn gold sm" onClick={gerarLink}><Link2 size={16} />Link para o cliente</button>
        </div>
      </div>

      {itens.length === 0 && <p className="muted">Nenhuma lista de documentos. Escolha um modelo abaixo ou adicione itens.</p>}
      <ul className="itens-check">
        {itens.map(i => {
          const Ic = ICONE[i.status];
          const arqs = docs.filter(d => d.item_id === i.id);
          return (
            <li key={i.id} className={`item-check ${i.status}`}>
              <div className="item-topo">
                <span className={`ic ${i.status}`} aria-hidden="true"><Ic size={16} /></span>
                <span className="grow"><strong>{i.nome}</strong>{!i.obrigatorio && <small className="muted"> · opcional</small>}<span className="sr-only"> ({ROTULO[i.status]})</span></span>
                <span className="item-acoes">
                  {i.status !== 'dispensado' && (
                    <label className={`btn sm ${i.status === 'pendente' ? '' : 'ghost'}`} aria-disabled={ocupado === i.id}>
                      <UploadCloud size={15} />{ocupado === i.id ? 'Enviando…' : 'Enviar'}
                      <input type="file" hidden multiple accept={ACEITA_DOCUMENTO} aria-label={`Enviar arquivo para ${i.nome}`} disabled={ocupado === i.id} onChange={e => { void enviar(i, e.target.files); e.target.value = ''; }} />
                    </label>
                  )}
                  {(arqs.length === 0 || i.status === 'dispensado') && <button className="btn ghost sm" onClick={() => alternarDispensa(i)}>{i.status === 'dispensado' ? 'Reativar' : 'Dispensar'}</button>}
                  {gestao && arqs.length === 0 && <button className="icon-btn" aria-label={`Remover ${i.nome}`} onClick={() => removerItem(i)}><Trash2 size={15} /></button>}
                </span>
              </div>
              {arqs.length > 0 && <ul className="docs">{arqs.map(chipDoc)}</ul>}
            </li>
          );
        })}
      </ul>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="input grow" style={{ minWidth: 200 }} aria-label="Novo item da lista" placeholder="Adicionar item à lista" value={novoItem} maxLength={160} onChange={e => setNovoItem(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void adicionarItem(); } }} />
        <button className="btn ghost" onClick={adicionarItem} disabled={!novoItem.trim()}><Plus size={16} />Adicionar</button>
      </div>
      <AreaSoltar aoReceber={f => setLote(f)} />
      {soltos.length > 0 && (
        <div className="stack" style={{ gap: 14 }}>
          <div className="section-title">Outros documentos</div>
          {CATEGORIAS.map(c => ({ c, lista: soltos.filter(d => (d.categoria ?? 'outros') === c.id) })).filter(g => g.lista.length > 0).map(g => (
            <div key={g.c.id}><div className="cat-titulo">{g.c.pasta}</div><ul className="docs">{g.lista.map(chipDoc)}</ul></div>
          ))}
        </div>
      )}

      {modelos.length > 0 && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select className="select" style={{ maxWidth: 280 }} aria-label="Modelo de lista de documentos" value={modelo} onChange={e => setModelo(e.target.value)}>
            {modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <button className="btn ghost" onClick={aplicar}>Aplicar modelo</button>
        </div>
      )}

      {links.length > 0 && (
        <div>
          <div className="section-title" style={{ marginBottom: 8 }}>Links ativos</div>
          <ul className="docs">
            {links.map(l => (
              <li key={l.id} className="doc">
                <span className="doc-nome"><Link2 size={15} /><span>{l.rotulo || 'Link de envio'}</span></span>
                <small className="muted">expira em {fmtData(isoParaBR(l.expira_em).data)} · {l.usos} arquivo(s) recebido(s)</small>
                <span className="doc-acoes"><button className="btn ghost sm" onClick={() => revogar(l)}>Cancelar link</button></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lote && (
        <Modal titulo="Enviar documentos" onClose={() => setLote(null)} largo>
          <EnvioLote clienteId={clienteId} processoId={processoId} arquivosIniciais={lote} aoCancelar={() => { setLote(null); void atualizar(); }} aoConcluir={() => { setLote(null); void atualizar(); }} />
        </Modal>
      )}

      {novoLink && (
        <Modal titulo="Link para o cliente" onClose={() => setNovoLink(null)}
          rodape={<><button className="btn ghost" onClick={() => setNovoLink(null)}>Fechar</button>
            <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${telefone ? `55${telefone.replace(/^55/, '')}` : ''}?text=${encodeURIComponent(mensagem(novoLink.url))}`}>Enviar pelo WhatsApp</a></>}>
          <div className="stack">
            <p>Válido até <strong>{fmtData(isoParaBR(novoLink.expira).data)}</strong>. O link só aparece agora; depois dele, se perder, crie outro.</p>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              <input className="input mono" readOnly aria-label="Endereço do link" value={novoLink.url} onFocus={e => e.currentTarget.select()} />
              <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(novoLink.url); toast.ok('Link copiado.'); } catch { toast.erro('Copie manualmente (Ctrl+C).'); } }}>Copiar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
