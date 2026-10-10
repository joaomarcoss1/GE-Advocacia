import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cloud, FileText, FolderOpen, Search, UploadCloud } from 'lucide-react';
import { Badge, Kpi, Modal, PageHeader, Vazio, useToast } from '@/components/ui';
import BibliotecaDocs from '@/components/BibliotecaDocs';
import Dossie, { progressoDe } from '@/components/Dossie';
import EnvioLote from '@/components/EnvioLote';
import { useDados } from '@/context/Dados';
import { fmtData, isoParaBR } from '@/lib/datetime';
import { semAcento, plural } from '@/lib/format';
import type { ChecklistItem, DocumentoArquivo, DriveStatus, ResumoDocumentos } from '@/lib/types';

interface Linha { chave: string; cliente_id: string; processo_id: string | null; titulo: string; sub: string; itens: ChecklistItem[]; docs: number }

/** Central de documentos: o que falta de cada cliente e processo, e o que chegou por último. */
export default function Documentos() {
  const { db, clientes, processos, recarregar } = useDados();
  const toast = useToast();
  const [itens, setItens] = useState<ChecklistItem[]>([]);
  const [docs, setDocs] = useState<DocumentoArquivo[]>([]);
  const [resumo, setResumo] = useState<ResumoDocumentos>({ total: 0, sem_conferir: 0, drive_pendente: 0 });
  const [drive, setDrive] = useState<DriveStatus>({ disponivel: false, conectado: false });
  const [busca, setBusca] = useState('');
  const [soPendentes, setSoPendentes] = useState(true);
  const [aberto, setAberto] = useState<Linha | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [aba, setAba] = useState<'pendencias' | 'biblioteca'>('pendencias');
  const [envio, setEnvio] = useState<{ cliente: string; processo: string } | null>(null);

  const carregar = useCallback(async () => {
    const [i, d, r, dr] = await Promise.all([db.checklist.itens.list().catch(() => []), db.arquivos.list().catch(() => []), db.arquivos.resumo().catch(() => ({ total: 0, sem_conferir: 0, drive_pendente: 0 })), db.arquivos.drive.status().catch(() => ({ disponivel: false, conectado: false }) as DriveStatus)]);
    setItens(i); setDocs(d); setResumo(r); setDrive(dr);
  }, [db]);
  useEffect(() => { void carregar(); }, [carregar]);

  const linhas = useMemo<Linha[]>(() => {
    const out: Linha[] = [];
    for (const p of processos) {
      if (p.situacao !== 'ativo' || !p.cliente_id) continue;
      const its = itens.filter(i => i.processo_id === p.id);
      out.push({ chave: p.id, cliente_id: p.cliente_id, processo_id: p.id, titulo: clientes.find(c => c.id === p.cliente_id)?.nome ?? '—', sub: `${p.titulo ? `${p.titulo} · ` : ''}${p.numero}`, itens: its, docs: docs.filter(d => d.processo_id === p.id).length });
    }
    for (const c of clientes) {
      const its = itens.filter(i => !i.processo_id && i.cliente_id === c.id);
      if (its.length || docs.some(d => d.cliente_id === c.id && !d.processo_id)) out.push({ chave: `c-${c.id}`, cliente_id: c.id, processo_id: null, titulo: c.nome, sub: 'Documentos do cliente', itens: its, docs: docs.filter(d => d.cliente_id === c.id && !d.processo_id).length });
    }
    return out;
  }, [processos, clientes, itens, docs]);

  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    return linhas.filter(l => (!soPendentes || progressoDe(l.itens).pct < 100) && (!q || semAcento(`${l.titulo} ${l.sub}`).includes(q))).sort((a, b) => progressoDe(a.itens).pct - progressoDe(b.itens).pct || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  }, [linhas, busca, soPendentes]);
  const recentes = useMemo(() => [...docs].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8), [docs]);
  const pendentesTotal = linhas.reduce((s, l) => s + progressoDe(l.itens).total - progressoDe(l.itens).feitos, 0);

  async function sincronizar() {
    setSincronizando(true);
    try { const r = await db.arquivos.drive.sincronizar(); toast.ok(r.erros ? `${plural(r.enviados, 'enviado', 'enviados')}; ${r.erros} com erro.` : r.enviados ? `${plural(r.enviados, 'documento enviado', 'documentos enviados')} ao Drive.` : 'Nada pendente.'); await carregar(); }
    catch (e) { toast.erro((e as Error).message); } finally { setSincronizando(false); }
  }
  const quem = (d: DocumentoArquivo) => { const p = d.processo_id ? processos.find(x => x.id === d.processo_id) : null; return `${clientes.find(c => c.id === d.cliente_id)?.nome ?? '—'}${p ? ` · ${p.titulo || p.numero}` : ''}`; };

  return (
    <>
      <PageHeader titulo="Documentos">
        <button className="btn gold" onClick={() => setEnvio({ cliente: '', processo: '' })}><UploadCloud size={17} />Enviar documentos</button>
        {drive.conectado && resumo.drive_pendente > 0 && <button className="btn ghost" onClick={sincronizar} disabled={sincronizando}><Cloud size={17} />{sincronizando ? 'Enviando…' : `Enviar ${resumo.drive_pendente} ao Drive`}</button>}
      </PageHeader>

      <div className="grid c4" style={{ marginBottom: 18 }}>
        <Kpi label="Itens pendentes" valor={pendentesTotal} alerta={pendentesTotal > 0} icone={<FileText />} />
        <Kpi label="Documentos recebidos" valor={resumo.total} icone={<FolderOpen />} />
        <Kpi label="A conferir" valor={resumo.sem_conferir} />
        <Kpi label={drive.disponivel ? (drive.conectado ? 'Drive: pendentes' : 'Drive') : 'Drive'} valor={drive.conectado ? resumo.drive_pendente : '—'} alerta={drive.conectado && resumo.drive_pendente > 0} />
      </div>

      <div className="seg" role="tablist" aria-label="Visões dos documentos" style={{ marginBottom: 14 }}>
        <button role="tab" aria-selected={aba === 'pendencias'} className={aba === 'pendencias' ? 'on' : ''} onClick={() => setAba('pendencias')}>Pendências por processo</button>
        <button role="tab" aria-selected={aba === 'biblioteca'} className={aba === 'biblioteca' ? 'on' : ''} onClick={() => setAba('biblioteca')}>Biblioteca ({docs.length})</button>
      </div>

      {aba === 'biblioteca' && <BibliotecaDocs docs={docs} />}

      {aba === 'pendencias' && <><div className="card" style={{ marginBottom: 18 }}>
        <div className="filtros">
          <div className="search-field grow" style={{ minWidth: 220 }}><Search size={18} className="lead" /><input aria-label="Buscar" placeholder="Cliente, processo ou número" value={busca} onChange={e => setBusca(e.target.value)} /></div>
          <label className="check"><input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} />Só com pendências</label>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Cliente / processo</th><th>Andamento da lista</th><th>Falta enviar</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {visiveis.map(l => {
                const pr = progressoDe(l.itens);
                const faltam = l.itens.filter(i => i.obrigatorio && i.status === 'pendente');
                return (
                  <tr key={l.chave} className="clicavel" onClick={() => setAberto(l)}>
                    <td><button className="link-linha" onClick={e => { e.stopPropagation(); setAberto(l); }}><strong>{l.titulo}</strong></button><div className="muted mono" style={{ fontSize: '.8rem' }}>{l.sub}</div></td>
                    <td style={{ minWidth: 150 }}>{l.itens.length ? <><div className="barra" aria-hidden="true"><i style={{ width: `${pr.pct}%` }} /></div><small className="muted">{pr.feitos} de {pr.total}</small></> : <span className="muted">Sem lista</span>}</td>
                    <td className="muted">{faltam.slice(0, 2).map(i => i.nome).join(', ')}{faltam.length > 2 ? ` +${faltam.length - 2}` : ''}</td>
                    <td className="right">{pr.total > 0 && pr.pct === 100 ? <Badge tom="ok">Completo</Badge> : <button className="btn ghost sm" onClick={e => { e.stopPropagation(); setAberto(l); }}>Abrir</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {linhas.length === 0 && <Vazio tipo="documento" titulo="Cadastre um processo para organizar os documentos" />}
          {linhas.length > 0 && visiveis.length === 0 && <Vazio tipo="ok" titulo="Nenhuma pendência" />}
        </div>
      </div>

      {recentes.length > 0 && (
        <div className="card">
          <div className="card-head"><span className="section-title">Recebidos recentemente</span></div>
          <ul className="docs" style={{ padding: '4px 20px 16px' }}>
            {recentes.map(d => (
              <li key={d.id} className="doc">
                <span className="doc-nome"><FileText size={15} /><span>{d.nome}</span></span>
                <small className="muted">{quem(d)} · {fmtData(isoParaBR(d.created_at).data)}{d.origem === 'link_cliente' ? ' · enviado pelo cliente' : ''}</small>
                {!d.conferido && <Badge tom="warn">A conferir</Badge>}
                {d.drive_status === 'enviado' && d.drive_link && <a className="btn ghost sm" href={d.drive_link} target="_blank" rel="noopener noreferrer"><Cloud size={14} />Drive</a>}
              </li>
            ))}
          </ul>
        </div>
      )}</>}

      {envio && (
        <Modal titulo="Enviar documentos" onClose={() => setEnvio(null)} largo>
          <div className="grid c2" style={{ marginBottom: 14 }}>
            <label className="field"><span>Cliente</span>
              <select className="select" value={envio.cliente} onChange={e => setEnvio({ cliente: e.target.value, processo: '' })} aria-label="Cliente dos documentos">
                <option value="">Escolha o cliente…</option>
                {[...clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="field"><span>Processo</span>
              <select className="select" value={envio.processo} disabled={!envio.cliente} onChange={e => setEnvio({ ...envio, processo: e.target.value })} aria-label="Processo dos documentos">
                <option value="">Documentos do cliente (sem processo)</option>
                {processos.filter(p => p.cliente_id === envio.cliente).map(p => <option key={p.id} value={p.id}>{p.titulo ? `${p.titulo} · ` : ''}{p.numero}</option>)}
              </select>
            </label>
          </div>
          {envio.cliente
            ? <EnvioLote key={`${envio.cliente}-${envio.processo}`} clienteId={envio.cliente} processoId={envio.processo || null} aoCancelar={() => { setEnvio(null); void carregar(); }} aoConcluir={() => { setEnvio(null); void carregar(); void recarregar(); }} />
            : <p className="muted">Escolha o cliente para enviar os arquivos. Eles são organizados automaticamente por categoria e, se o Drive estiver conectado, vão para a pasta certa.</p>}
        </Modal>
      )}

      {aberto && <Modal titulo={aberto.titulo} onClose={() => setAberto(null)} largo><p className="muted mono" style={{ margin: '0 0 14px' }}>{aberto.sub}</p><Dossie clienteId={aberto.cliente_id} processoId={aberto.processo_id} aoMudar={() => { void carregar(); void recarregar(); }} /></Modal>}
    </>
  );
}
