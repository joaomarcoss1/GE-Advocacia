import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { Badge, PageHeader } from '@/components/ui';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { isoParaBR } from '@/lib/datetime';
import { ErroNegocio } from '@/lib/erros';
import { GRUPOS, PAPEIS, PERMISSOES, type GrupoPermissao } from '@/lib/permissoes';
import type { MeuPontoHoje, StatusTarefa, TarefaFunc, TipoMarcacao } from '@/lib/types';
import { CartoesTarefas } from './ponto/MinhasTarefas';

const MARCACAO: Record<TipoMarcacao, string> = { entrada: 'Entrada', saida_intervalo: 'Saída para o intervalo', retorno_intervalo: 'Retorno do intervalo', saida: 'Saída' };

/** Área pessoal de quem entra no painel: o dia de ponto, as tarefas delegadas e o que o nível de acesso permite. */
export default function MeuEspaco() {
  const { db, escritorio } = useDados();
  const { sessao } = useAuth();
  const [ponto, setPonto] = useState<MeuPontoHoje | null>(null);
  const [lista, setLista] = useState<TarefaFunc[] | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState('');

  const carregar = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([db.minhaArea.pontoHoje().catch(() => null), db.minhaArea.tarefas()]);
      setPonto(p); setLista(t); setErro('');
    } catch (e) { setErro((e as Error).message); setLista([]); }
  }, [db]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function mover(t: TarefaFunc, status: Exclude<StatusTarefa, 'cancelada'>) {
    setOcupado(t.id);
    const nota = status === 'concluida' || status === 'em_revisao' ? (window.prompt('Observação para a equipe (opcional):') ?? '') : '';
    try { await db.minhaArea.atualizarTarefa(t.id, status, nota); await carregar(); }
    catch (e) { setErro(e instanceof ErroNegocio ? e.message : (e as Error).message); }
    finally { setOcupado(''); }
  }

  const papel = sessao?.papel && sessao.papel !== 'plataforma' ? PAPEIS[sessao.papel] : null;
  const permissoes = useMemo(() => new Set(sessao?.permissoes ?? []), [sessao]);
  const porGrupo = useMemo(() => {
    const g = new Map<GrupoPermissao, string[]>();
    for (const p of PERMISSOES) if (permissoes.has(p.id)) g.set(p.grupo, [...(g.get(p.grupo) ?? []), p.rotulo]);
    return [...g.entries()];
  }, [permissoes]);

  return (
    <>
      <PageHeader titulo="Meu espaço">
        <Link to={`/ponto/${escritorio.slug}`} className="btn ghost"><Smartphone size={16} aria-hidden="true" />Tela de ponto</Link>
      </PageHeader>
      <div className="grid c2 colapsa">
        <div className="card card-pad stack g-10">
          <div className="section-title">Meu acesso</div>
          <div className="row g-8"><strong>{sessao?.nome}</strong>{papel && <Badge tom="gold">{papel.rotulo}</Badge>}</div>
          {papel && <p className="muted fs-md m-0">{papel.descricao}</p>}
          {sessao?.liberado_ate && <div className="notice">Acesso liberado pela gerência até {isoParaBR(sessao.liberado_ate).hhmm}.</div>}
        </div>
        <div className="card card-pad stack g-10">
          <div className="section-title">Ponto de hoje</div>
          {!ponto || !ponto.funcionario_id
            ? <p className="muted fs-md m-0">Este acesso não está ligado a um cadastro de funcionário, então não há ponto a mostrar.</p>
            : ponto.marcacoes.length === 0
              ? <p className="muted fs-md m-0">Nenhuma marcação hoje.</p>
              : <ul className="lista-ponto">{ponto.marcacoes.map(m => <li key={m.tipo}><span>{MARCACAO[m.tipo]}</span><span className="mono">{isoParaBR(m.horario).hhmm}</span>{m.status_aprovacao === 'pendente' && <Badge tom="warn">em análise</Badge>}</li>)}</ul>}
        </div>
      </div>

      <div className="card card-pad mt-18">
        {lista !== null && lista.length === 0 && !erro
          ? <><div className="section-title">Minhas tarefas</div><p className="muted fs-md m-0">Nada delegado a você no momento.</p></>
          : <CartoesTarefas lista={lista} erro={erro} ocupado={ocupado} mover={mover} />}
      </div>

      <details className="card card-pad mt-18">
        <summary className="section-title" style={{ cursor: 'pointer' }}>O que o meu nível permite</summary>
        {porGrupo.length === 0
          ? <p className="muted fs-md mt-10">Seu acesso é básico: ponto, tarefas e agenda pessoais.</p>
          : porGrupo.map(([g, itens]) => (
            <div key={g} className="mt-10">
              <strong className="fs-md">{GRUPOS[g]}</strong>
              <ul className="fs-md" style={{ margin: '4px 0 0', paddingLeft: 20 }}>{itens.map(i => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
      </details>
    </>
  );
}
