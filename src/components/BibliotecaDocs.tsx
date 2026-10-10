import { useMemo, useState } from 'react';
import { Cloud, Eye, FileText, Search } from 'lucide-react';
import { Badge, Vazio, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { fmtTamanho } from '@/lib/anexos';
import { fmtData, isoParaBR } from '@/lib/datetime';
import { abrirNovaAba } from '@/lib/documentos';
import { semAcento } from '@/lib/format';
import { CATEGORIAS, rotuloCategoria } from '@/lib/organizacao';
import type { DocumentoArquivo } from '@/lib/types';

const PASSO = 50;
type Situacao = '' | 'conferir' | 'drive_pendente' | 'drive_erro' | 'cliente';

/** Todos os documentos do escritório em um só lugar: busca por nome, cliente, processo ou categoria, com filtros. */
export default function BibliotecaDocs({ docs }: { docs: DocumentoArquivo[] }) {
  const { db, clientes, processos } = useDados();
  const toast = useToast();
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('');
  const [limite, setLimite] = useState(PASSO);

  const nomeCliente = (id: string) => clientes.find(c => c.id === id)?.nome ?? '—';
  const rotuloProcesso = (id: string | null) => { const p = id ? processos.find(x => x.id === id) : null; return p ? (p.titulo || p.numero) : null; };

  const filtrados = useMemo(() => {
    const q = semAcento(busca.trim());
    return docs.filter(d => {
      if (categoria && (d.categoria ?? 'outros') !== categoria) return false;
      if (situacao === 'conferir' && d.conferido) return false;
      if (situacao === 'drive_pendente' && d.drive_status !== 'pendente') return false;
      if (situacao === 'drive_erro' && d.drive_status !== 'erro') return false;
      if (situacao === 'cliente' && d.origem !== 'link_cliente') return false;
      if (!q) return true;
      return semAcento(`${d.nome} ${nomeCliente(d.cliente_id)} ${rotuloProcesso(d.processo_id) ?? ''} ${rotuloCategoria(d.categoria)}`).includes(q);
    });
  }, [docs, busca, categoria, situacao, clientes, processos]); // eslint-disable-line react-hooks/exhaustive-deps

  async function abrir(d: DocumentoArquivo) {
    try { const r = await db.arquivos.abrir(d.id); abrirNovaAba(r.url, r.nome); setTimeout(() => r.revogar?.(), 60_000); } catch (e) { toast.erro((e as Error).message); }
  }

  return (
    <div className="card">
      <div className="filtros">
        <div className="search-field grow minw-220" ><Search size={18} className="lead" /><input aria-label="Buscar documentos" placeholder="Nome do arquivo, cliente, processo ou categoria" value={busca} onChange={e => { setBusca(e.target.value); setLimite(PASSO); }} /></div>
        <select className="select" aria-label="Categoria" value={categoria} onChange={e => { setCategoria(e.target.value); setLimite(PASSO); }}>
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
        </select>
        <select className="select" aria-label="Situação" value={situacao} onChange={e => { setSituacao(e.target.value as Situacao); setLimite(PASSO); }}>
          <option value="">Qualquer situação</option>
          <option value="conferir">A conferir</option>
          <option value="cliente">Enviados pelo cliente</option>
          <option value="drive_pendente">Drive pendente</option>
          <option value="drive_erro">Drive com erro</option>
        </select>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Documento</th><th>Cliente / processo</th><th>Recebido</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {filtrados.slice(0, limite).map(d => (
              <tr key={d.id}>
                <td><div className="doc-nome-lib"><FileText size={15} aria-hidden="true" /><span title={d.nome}>{d.nome}</span></div><div className="muted fs-sm" >{rotuloCategoria(d.categoria)} · {fmtTamanho(d.tamanho)}</div></td>
                <td><strong>{nomeCliente(d.cliente_id)}</strong>{rotuloProcesso(d.processo_id) && <div className="muted mono fs-sm" >{rotuloProcesso(d.processo_id)}</div>}</td>
                <td className="muted">{fmtData(isoParaBR(d.created_at).data)}{d.origem === 'link_cliente' && <div className="fs-sm">pelo cliente</div>}</td>
                <td>
                  <span className="row g-6 fx-wrap" >
                    {d.conferido ? <Badge tom="ok">Conferido</Badge> : <Badge tom="warn">A conferir</Badge>}
                    {d.drive_status === 'enviado' && <Badge tom="mute">No Drive</Badge>}
                    {d.drive_status === 'pendente' && <Badge tom="warn">Drive pendente</Badge>}
                    {d.drive_status === 'erro' && <span title={d.drive_erro ?? ''}><Badge tom="bad">Drive com erro</Badge></span>}
                  </span>
                </td>
                <td className="right">
                  <button className="btn ghost sm" onClick={() => abrir(d)} aria-label={`Abrir ${d.nome}`}><Eye size={15} />Abrir</button>
                  {d.drive_status === 'enviado' && d.drive_link && <a className="btn ghost sm" href={d.drive_link} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${d.nome} no Drive`}><Cloud size={14} />Drive</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {docs.length === 0 && <Vazio tipo="documento" titulo="Nenhum documento recebido ainda" />}
        {docs.length > 0 && filtrados.length === 0 && <Vazio tipo="busca" titulo="Nenhum documento com esses filtros" />}
      </div>
      {filtrados.length > limite && <div className="row" style={{ justifyContent: 'center', padding: 14 }}><button className="btn ghost" onClick={() => setLimite(l => l + PASSO)}>Mostrar mais ({filtrados.length - limite})</button></div>}
      {filtrados.length > 0 && <p className="muted fs-md" style={{ margin: '4px 18px 14px' }}>{filtrados.length} documento{filtrados.length > 1 ? 's' : ''}</p>}
    </div>
  );
}
