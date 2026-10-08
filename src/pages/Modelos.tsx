import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, FilePlus, FileText, ListChecks, Pencil, Search, Trash2 } from 'lucide-react';
import { Abas, Badge, PageHeader, Vazio, useConfirm, useToast } from '@/components/ui';
import ModeloUsar from '@/components/ModeloUsar';
import { AREAS, ListaEditor, ModeloEditor, rotuloArea } from '@/components/ModeloEditor';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { CHECKLISTS_PADRAO } from '@/lib/checklistPadrao';
import { semAcento } from '@/lib/format';
import { CATEGORIAS_MODELO, rotuloCategoriaModelo, type ModeloDocumento } from '@/lib/modelos';
import { MODELOS_PADRAO } from '@/lib/modelosPadrao';
import type { ChecklistModelo } from '@/lib/types';

/** Biblioteca do escritório: peças e documentos-modelo (a gestão mantém; toda a equipe usa) e listas de documentos por tipo de processo. */
export default function Modelos() {
  const { db } = useDados();
  const { sessao } = useAuth();
  const toast = useToast();
  const confirmar = useConfirm();
  const gestao = sessao?.papel === 'admin' || sessao?.papel === 'gerente';
  const [aba, setAba] = useState<'pecas' | 'listas'>('pecas');
  const [pecas, setPecas] = useState<ModeloDocumento[]>([]);
  const [listas, setListas] = useState<ChecklistModelo[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [area, setArea] = useState('');
  const [usando, setUsando] = useState<ModeloDocumento | null>(null);
  const [editando, setEditando] = useState<ModeloDocumento | 'novo' | null>(null);
  const [editLista, setEditLista] = useState<ChecklistModelo | 'novo' | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const [p, l] = await Promise.all([db.modelosDocumentos.list().catch(() => []), db.checklist.modelos.list().catch(() => [])]);
    setPecas(p.filter(x => x.ativo)); setListas(l.filter(x => x.ativo)); setCarregado(true);
  }, [db]);
  useEffect(() => { void carregar(); }, [carregar]);

  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    return pecas.filter(m => (!categoria || m.categoria === categoria) && (!area || (m.area ?? '') === area) && (!q || semAcento(`${m.titulo} ${m.descricao ?? ''}`).includes(q)))
      .sort((a, b) => CATEGORIAS_MODELO.findIndex(c => c.id === a.categoria) - CATEGORIAS_MODELO.findIndex(c => c.id === b.categoria) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  }, [pecas, busca, categoria, area]);
  const listasVisiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    return listas.filter(l => (!area || (l.area ?? '') === area) && (!q || semAcento(`${l.nome} ${l.tipo ?? ''}`).includes(q))).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [listas, busca, area]);

  async function carregarPadrao() {
    const falta = MODELOS_PADRAO.filter(m => !pecas.some(p => p.titulo.toLowerCase() === m.titulo.toLowerCase()));
    if (!falta.length) { toast.ok('Todos os modelos padrão já estão na biblioteca.'); return; }
    if (!(await confirmar(`Adicionar ${falta.length} modelos padrão (procurações, contratos, petições, defesas, recursos, acordos…)? Os que você já tem não mudam. Depois, edite à vontade e revise cada um antes de usar.`, { rotulo: 'Adicionar' }))) return;
    setOcupado(true);
    let n = 0;
    try { for (const m of falta) { await db.modelosDocumentos.insert({ titulo: m.titulo, categoria: m.categoria, area: m.area, descricao: m.descricao, conteudo: m.conteudo, ativo: true }); n++; } toast.ok(`${n} modelos adicionados.`); }
    catch (e) { toast.erro(`${n} adicionados; depois parou: ${(e as Error).message}`); }
    finally { setOcupado(false); await carregar(); }
  }
  async function carregarListasPadrao() {
    const falta = CHECKLISTS_PADRAO.filter(m => !listas.some(l => l.nome.toLowerCase() === m.nome.toLowerCase()));
    if (!falta.length) { toast.ok('Todas as listas padrão já existem.'); return; }
    if (!(await confirmar(`Adicionar ${falta.length} listas de documentos por tipo de processo? As que você já tem não mudam.`, { rotulo: 'Adicionar' }))) return;
    setOcupado(true);
    let n = 0;
    try { for (const m of falta) { await db.checklist.modelos.insert({ nome: m.nome, tipo: m.tipo, area: m.area, descricao: m.descricao, itens: m.itens, ativo: true }); n++; } toast.ok(`${n} listas adicionadas.`); }
    catch (e) { toast.erro(`${n} adicionadas; depois parou: ${(e as Error).message}`); }
    finally { setOcupado(false); await carregar(); }
  }
  async function excluirPeca(m: ModeloDocumento) {
    if (!(await confirmar(`Excluir o modelo "${m.titulo}"? Os documentos já gerados não mudam.`, { perigo: true, rotulo: 'Excluir' }))) return;
    try { await db.modelosDocumentos.remove(m.id); await carregar(); } catch (e) { toast.erro((e as Error).message); }
  }
  async function excluirLista(l: ChecklistModelo) {
    if (!(await confirmar(`Excluir a lista "${l.nome}"? As listas já aplicadas a clientes e processos não mudam.`, { perigo: true, rotulo: 'Excluir' }))) return;
    try { await db.checklist.modelos.remove(l.id); await carregar(); } catch (e) { toast.erro((e as Error).message); }
  }

  return (
    <>
      <PageHeader titulo="Modelos">
        {gestao && aba === 'pecas' && <><button className="btn ghost" onClick={carregarPadrao} disabled={ocupado}><BookOpenCheck size={17} />{ocupado ? 'Adicionando…' : 'Carregar modelos padrão'}</button><button className="btn gold" onClick={() => setEditando('novo')}><FilePlus size={17} />Novo modelo</button></>}
        {gestao && aba === 'listas' && <><button className="btn ghost" onClick={carregarListasPadrao} disabled={ocupado}><BookOpenCheck size={17} />{ocupado ? 'Adicionando…' : 'Carregar listas padrão'}</button><button className="btn gold" onClick={() => setEditLista('novo')}><ListChecks size={17} />Nova lista</button></>}
      </PageHeader>
      <div className="card">
        <Abas valor={aba} onChange={setAba} itens={[{ id: 'pecas', rotulo: `Peças e documentos (${pecas.length})` }, { id: 'listas', rotulo: `Listas de documentos (${listas.length})` }]} />
        <div className="filtros" style={{ padding: '14px 20px 0' }}>
          <div className="search-field grow" style={{ minWidth: 220 }}><Search size={18} className="lead" /><input aria-label="Buscar modelo" placeholder={aba === 'pecas' ? 'Buscar peça ou documento' : 'Buscar lista ou tipo de processo'} value={busca} onChange={e => setBusca(e.target.value)} /></div>
          {aba === 'pecas' && <select className="select" style={{ maxWidth: 260 }} aria-label="Tipo de documento" value={categoria} onChange={e => setCategoria(e.target.value)}><option value="">Todos os tipos</option>{CATEGORIAS_MODELO.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}</select>}
          <select className="select" style={{ maxWidth: 200 }} aria-label="Área" value={area} onChange={e => setArea(e.target.value)}><option value="">Todas as áreas</option>{AREAS.map(a => <option key={a.id} value={a.id}>{a.rotulo}</option>)}</select>
        </div>

        {aba === 'pecas' && (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Documento</th><th>Tipo</th><th>Área</th><th /></tr></thead>
              <tbody>
                {visiveis.map(m => (
                  <tr key={m.id}>
                    <td><strong>{m.titulo}</strong>{m.descricao && <div className="muted" style={{ fontSize: '.84rem' }}>{m.descricao}</div>}</td>
                    <td>{rotuloCategoriaModelo(m.categoria)}</td>
                    <td>{rotuloArea(m.area)}</td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm gold" onClick={() => setUsando(m)}><FileText size={15} />Usar</button>
                      {gestao && <><button className="icon-btn" aria-label={`Editar ${m.titulo}`} onClick={() => setEditando(m)}><Pencil size={16} /></button><button className="icon-btn" aria-label={`Excluir ${m.titulo}`} onClick={() => excluirPeca(m)}><Trash2 size={16} /></button></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {carregado && pecas.length === 0 && <Vazio tipo="documento" titulo="A biblioteca de modelos está vazia" acao={gestao ? { rotulo: 'Carregar modelos padrão', onClick: () => void carregarPadrao() } : undefined}>{gestao ? 'Carregue os modelos padrão e adapte ao estilo do escritório.' : 'A administração ainda não cadastrou modelos.'}</Vazio>}
            {pecas.length > 0 && visiveis.length === 0 && <Vazio tipo="busca" titulo="Nenhum modelo encontrado" />}
          </div>
        )}

        {aba === 'listas' && (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Lista</th><th>Tipo de processo</th><th>Área</th><th>Itens</th>{gestao && <th />}</tr></thead>
              <tbody>
                {listasVisiveis.map(l => (
                  <tr key={l.id}>
                    <td><strong>{l.nome}</strong>{l.descricao && <div className="muted" style={{ fontSize: '.84rem' }}>{l.descricao}</div>}</td>
                    <td>{l.tipo ?? <span className="muted">—</span>}</td>
                    <td>{rotuloArea(l.area)}</td>
                    <td><Badge tom="mute">{l.itens.length}</Badge></td>
                    {gestao && <td className="right" style={{ whiteSpace: 'nowrap' }}><button className="icon-btn" aria-label={`Editar ${l.nome}`} onClick={() => setEditLista(l)}><Pencil size={16} /></button><button className="icon-btn" aria-label={`Excluir ${l.nome}`} onClick={() => excluirLista(l)}><Trash2 size={16} /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {carregado && listas.length === 0 && <Vazio tipo="documento" titulo="Nenhuma lista de documentos" />}
            {listas.length > 0 && listasVisiveis.length === 0 && <Vazio tipo="busca" titulo="Nenhuma lista encontrada" />}
            <p className="muted" style={{ padding: '4px 20px 16px', margin: 0 }}>Para usar uma lista: abra o cliente ou o processo, em Documentos, e escolha o modelo. Para salvar a lista de um processo como modelo, use "Salvar como modelo" no próprio dossiê.</p>
          </div>
        )}
      </div>
      {usando && <ModeloUsar modelo={usando} onClose={() => setUsando(null)} />}
      {editando && <ModeloEditor modelo={editando === 'novo' ? null : editando} onClose={() => setEditando(null)} aoSalvar={() => { setEditando(null); void carregar(); }} />}
      {editLista && <ListaEditor lista={editLista === 'novo' ? null : editLista} onClose={() => setEditLista(null)} aoSalvar={() => { setEditLista(null); void carregar(); }} />}
    </>
  );
}
