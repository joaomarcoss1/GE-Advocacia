import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, CalendarClock, CheckCheck, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Abas, Badge, Field, Modal, useConfirm, useToast, type Tom } from '@/components/ui';
import Dossie from '@/components/Dossie';
import ProcessoModal from '@/components/ProcessoModal';
import TarefaModal from '@/components/TarefaModal';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { useGoogle } from '@/context/useGoogle';
import { addDays, agoraBR, fmtData, isoParaBR } from '@/lib/datetime';
import { CATEGORIA_ROTULO, TIPO_MARCO_ROTULO, calcularPrazo, diasPadraoPorJustica, tribunalPorAlias, type Categoria, type RegimePrazo, type TipoMarco } from '@/lib/processos';
import { AREA_ROTULO, STATUS_ROTULO } from '@/lib/tarefas';
import type { Movimento, Processo } from '@/lib/types';

const TOM: Record<string, Tom> = { sentenca: 'bad', decisao: 'warn', intimacao: 'warn', citacao: 'bad', audiencia: 'warn', despacho: 'gold', transito: 'gold', arquivamento: 'mute' };
const CATEGORIAS_MANUAIS: Categoria[] = ['intimacao', 'citacao', 'sentenca', 'decisao', 'despacho', 'audiencia', 'juntada', 'peticao', 'recurso', 'transito', 'arquivamento', 'outros'];
const ORIGEM = { datajud: 'Tribunal', manual: 'Registrado à mão', simulada: 'Simulado' } as const;
export const dataHora = (iso: string) => { const d = isoParaBR(iso); return `${fmtData(d.data)} ${d.hhmm}`; };

/** Cálculo do prazo a partir do andamento: o advogado confere o tipo da data, o marco e os dias; o passo a passo fica à vista. */
const ATALHOS_PRAZO: [number, string][] = [[15, 'CPC · 15'], [8, 'CLT · 8'], [10, 'Juizados · 10'], [5, 'Embargos/despacho · 5']];
function PrazoModal({ processo, movimento, onClose, onCriar }: { processo: Processo; movimento: Movimento; onClose(): void; onCriar(v: string, resumo: string): void }) {
  const { feriados } = useDados();
  const [marco, setMarco] = useState(isoParaBR(movimento.data_hora).data);
  const [tipo, setTipo] = useState<TipoMarco>(movimento.categoria === 'intimacao' ? 'disponibilizacao' : 'ciencia');
  const [dias, setDias] = useState(String(diasPadraoPorJustica(processo.numero, movimento.prazo_sugerido_dias) ?? 15));
  const [regime, setRegime] = useState<RegimePrazo>('uteis');
  const [dobro, setDobro] = useState(false);
  const n = Math.max(0, Math.min(365, Math.floor(Number(dias) || 0)));
  const conjunto = useMemo(() => new Set(feriados.map(f => f.data)), [feriados]);
  const r = marco && n > 0 ? calcularPrazo({ marco, tipo, dias: n, regime, dobro, feriados: conjunto }) : null;
  const resumo = `${movimento.nome} · ${TIPO_MARCO_ROTULO[tipo]} em ${fmtData(marco)} · ${r?.dias ?? n} dias ${regime === 'uteis' ? 'úteis' : 'corridos'}${dobro ? ' (em dobro)' : ''}`;
  return (
    <Modal titulo="Calcular prazo" onClose={onClose}
      rodape={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={!r} onClick={() => r && onCriar(r.vencimento, resumo)}><CalendarClock size={16} />Criar prazo na agenda</button></>}>
      <div className="stack">
        <p><strong>{CATEGORIA_ROTULO[movimento.categoria]}</strong> · {movimento.nome}<br /><span className="muted mono">{processo.numero}</span></p>
        <div className="grid c2">
          <Field label="A data informada é"><select className="select" value={tipo} onChange={e => setTipo(e.target.value as TipoMarco)}>{(Object.keys(TIPO_MARCO_ROTULO) as TipoMarco[]).map(k => <option key={k} value={k}>{TIPO_MARCO_ROTULO[k]}</option>)}</select></Field>
          <Field label="Data"><input className="input" type="date" value={marco} onChange={e => setMarco(e.target.value)} /></Field>
        </div>
        <div className="grid c2">
          <Field label="Prazo (dias)"><input className="input" inputMode="numeric" value={dias} onChange={e => setDias(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Contagem"><select className="select" value={regime} onChange={e => setRegime(e.target.value as RegimePrazo)}><option value="uteis">Dias úteis</option><option value="corridos">Dias corridos</option></select></Field>
        </div>
        <div className="atalhos-prazo" role="group" aria-label="Prazos usuais">
          {ATALHOS_PRAZO.map(([d, rot]) => <button key={d} type="button" className={`chip-atalho ${n === d ? 'on' : ''}`} aria-pressed={n === d} onClick={() => setDias(String(d))}>{rot}</button>)}
          <label className="check"><input type="checkbox" checked={dobro} onChange={e => setDobro(e.target.checked)} />Prazo em dobro</label>
        </div>
        <div className="resultado-prazo" role="status">
          {r ? <>Vence em <strong>{fmtData(r.vencimento)}</strong></> : 'Informe a data e os dias.'}
        </div>
        {r && <ol className="passos-prazo" aria-label="Como o prazo foi contado">{r.passos.map(p => <li key={p}>{p}</li>)}</ol>}
        <p className="hint">Sugestão pela regra geral (CPC e Lei 11.419): ignora fins de semana, feriados cadastrados e o recesso forense (20/12 a 20/01). Em dobro: Fazenda, Ministério Público, Defensoria e litisconsortes com advogados distintos. Confira o prazo no ato antes de confirmar.</p>
      </div>
    </Modal>
  );
}

/** Ficha do processo: andamentos (com prazos sugeridos), tarefas e prazos, documentos e dados. */
export default function ProcessoDetalhe({ processoId, aba: abaInicial = 'andamentos', onClose, aoMudar }: { processoId: string; aba?: 'andamentos' | 'tarefas' | 'documentos' | 'dados'; onClose(): void; aoMudar?(): void }) {
  const { db, processos, clientes, funcionarios, tarefas, recarregar } = useDados();
  const { sessao } = useAuth();
  const google = useGoogle();
  const toast = useToast();
  const confirmar = useConfirm();
  const processo = processos.find(p => p.id === processoId);
  const cliente = processo?.cliente_id ? clientes.find(c => c.id === processo.cliente_id) : null;
  const gestao = sessao?.papel === 'admin' || sessao?.papel === 'gerente';
  const [aba, setAba] = useState(abaInicial);
  const [movs, setMovs] = useState<Movimento[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [simulada, setSimulada] = useState(false);
  const [editar, setEditar] = useState(false);
  const [prazo, setPrazo] = useState<Movimento | null>(null);
  const [tarefaPadrao, setTarefaPadrao] = useState<Record<string, unknown> | null>(null);
  const [registro, setRegistro] = useState<{ categoria: Categoria; nome: string; complemento: string; data: string } | null>(null);

  const carregar = useCallback(async () => { try { setMovs(await db.processos.movimentos(processoId)); } catch { setMovs([]); } }, [db, processoId]);
  useEffect(() => { void carregar(); db.processos.fonte().then(f => setSimulada(f.simulada)).catch(() => undefined); }, [carregar, db]);
  const atualizarTudo = async () => { await recarregar(); await carregar(); aoMudar?.(); };
  const nomeDe = (id: string | null) => funcionarios.find(f => f.id === id)?.nome ?? null;
  const dasTarefas = useMemo(() => tarefas.filter(t => t.processo_id === processoId).sort((a, b) => (a.inicio ?? '9').localeCompare(b.inicio ?? '9')), [tarefas, processoId]);
  const naoLidos = movs.filter(m => !m.lido).length;
  if (!processo) return null;

  async function consultar() {
    setOcupado(true);
    try {
      const r = await db.processos.consultar(processoId);
      toast.ok(r.novos ? `${r.novos} andamento(s) novo(s)${r.tarefas ? ` · ${r.tarefas} tarefa(s) criada(s)` : ''}.` : 'Nenhum andamento novo.');
      await atualizarTudo();
    } catch (e) { toast.erro((e as Error).message); } finally { setOcupado(false); }
  }
  async function lerTudo() { try { await db.processos.marcarLidos(processoId); await atualizarTudo(); } catch (e) { toast.erro((e as Error).message); } }
  async function registrar() {
    if (!registro) return;
    if (!registro.nome.trim()) return toast.erro('Descreva o andamento.');
    setOcupado(true);
    try {
      await db.processos.registrarMovimento(processoId, { nome: registro.nome, complemento: registro.complemento, data_hora: new Date(`${registro.data}T12:00:00`).toISOString(), categoria: registro.categoria });
      setRegistro(null); toast.ok('Andamento registrado.'); await atualizarTudo();
    } catch (e) { toast.erro((e as Error).message); } finally { setOcupado(false); }
  }
  async function excluir() {
    if (!(await confirmar(`Excluir o processo ${processo!.numero}? Andamentos e lista de documentos saem junto.`, { perigo: true, rotulo: 'Excluir' }))) return;
    try { await db.processos.remove(processoId); toast.ok('Processo excluído.'); await recarregar(); onClose(); } catch (e) { toast.erro((e as Error).message); }
  }

  return (
    <>
      <Modal titulo={processo.titulo || processo.numero} onClose={onClose} largo
        rodape={gestao ? <><button className="btn ghost" onClick={excluir}><Trash2 size={16} />Excluir</button><button className="btn" onClick={() => setEditar(true)}><Pencil size={16} />Editar</button></> : <button className="btn" onClick={() => setEditar(true)}><Pencil size={16} />Editar</button>}>
        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            <span className="mono">{processo.numero}</span>
            {processo.tribunal && <span title={tribunalPorAlias(processo.tribunal)?.nome}><Badge tom="gold">{processo.tribunal.toUpperCase()}</Badge></span>}
            {processo.situacao !== 'ativo' && <Badge tom="mute">{processo.situacao}</Badge>}
            {processo.area && <Badge tom="mute">{AREA_ROTULO[processo.area]}</Badge>}
            {!processo.monitorar && <Badge tom="mute">Sem acompanhamento</Badge>}
            {naoLidos > 0 && <Badge tom="warn">{naoLidos} novo(s)</Badge>}
          </div>
          <dl className="ficha">
            {cliente && <div><dt>Cliente</dt><dd>{cliente.nome}</dd></div>}
            <div><dt>Responsável</dt><dd>{nomeDe(processo.responsavel_id) ?? '—'}</dd></div>
            {processo.classe && <div><dt>Classe</dt><dd>{processo.classe}</dd></div>}
            {processo.orgao_julgador && <div><dt>Órgão</dt><dd>{processo.orgao_julgador}</dd></div>}
            <div><dt>Última consulta</dt><dd>{processo.ultima_consulta ? dataHora(processo.ultima_consulta) : 'Ainda não consultado'}</dd></div>
          </dl>
          {processo.ultima_consulta_erro && <div className="notice bad" role="alert">Última consulta falhou: {processo.ultima_consulta_erro}</div>}

          <Abas valor={aba} onChange={setAba} itens={[{ id: 'andamentos', rotulo: 'Andamentos', contagem: naoLidos }, { id: 'tarefas', rotulo: 'Tarefas e prazos', contagem: undefined }, { id: 'documentos', rotulo: 'Documentos' }, { id: 'dados', rotulo: 'Dados' }]} />

          {aba === 'andamentos' && (
            <div className="stack">
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={consultar} disabled={ocupado}><RefreshCw size={16} />{ocupado ? 'Consultando…' : 'Atualizar andamentos'}</button>
                <button className="btn ghost sm" onClick={() => setRegistro({ categoria: 'intimacao', nome: '', complemento: '', data: agoraBR().data })}>Registrar andamento</button>
                {naoLidos > 0 && <button className="btn ghost sm" onClick={lerTudo}><CheckCheck size={16} />Marcar tudo como lido</button>}
                {simulada && <Badge tom="mute">Consulta simulada (demonstração)</Badge>}
              </div>
              {registro && (
                <div className="bloco-agenda stack">
                  <div className="grid c3">
                    <Field label="Tipo"><select className="select" value={registro.categoria} onChange={e => setRegistro({ ...registro, categoria: e.target.value as Categoria })}>{CATEGORIAS_MANUAIS.map(c => <option key={c} value={c}>{CATEGORIA_ROTULO[c]}</option>)}</select></Field>
                    <Field label="Data"><input className="input" type="date" value={registro.data} max={addDays(agoraBR().data, 1)} onChange={e => setRegistro({ ...registro, data: e.target.value })} /></Field>
                    <Field label="O que aconteceu"><input className="input" value={registro.nome} maxLength={300} autoFocus onChange={e => setRegistro({ ...registro, nome: e.target.value })} placeholder="Ex.: Intimação para manifestação" /></Field>
                  </div>
                  <Field label="Detalhes (opcional)"><input className="input" value={registro.complemento} maxLength={2000} onChange={e => setRegistro({ ...registro, complemento: e.target.value })} /></Field>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn ghost sm" onClick={() => setRegistro(null)}>Cancelar</button><button className="btn sm" onClick={registrar} disabled={ocupado}>Registrar</button></div>
                </div>
              )}
              <ol className="linha-tempo">
                {movs.length === 0 && <li className="muted">Nenhum andamento ainda. Use “Atualizar andamentos”.</li>}
                {movs.map(m => (
                  <li key={m.id} className={`${m.lido ? '' : 'novo'}`}>
                    <div className="row" style={{ gap: 8 }}>
                      <Badge tom={TOM[m.categoria] ?? 'mute'}>{CATEGORIA_ROTULO[m.categoria]}</Badge>
                      <strong>{m.nome}</strong>
                      {!m.lido && <BellRing size={14} aria-label="Novo" className="novo-ic" />}
                    </div>
                    {m.complemento && <div className="muted">{m.complemento}</div>}
                    <small className="muted">{dataHora(m.data_hora)} · {ORIGEM[m.origem]}{m.criado_por_nome ? ` por ${m.criado_por_nome}` : ''}</small>
                    {m.exige_acao && Date.now() - Date.parse(m.data_hora) <= 60 * 86_400_000 && (
                      <div className="row" style={{ gap: 8, marginTop: 6 }}>
                        {m.tarefa_id ? <Badge tom="ok">Tarefa criada</Badge> : (
                          <button className="btn ghost sm" onClick={() => setTarefaPadrao({ tipo: 'tarefa', titulo: `Analisar ${CATEGORIA_ROTULO[m.categoria].toLowerCase()} — ${processo.titulo || processo.numero}`, descricao: `${m.nome}${m.complemento ? ` — ${m.complemento}` : ''}`, processoId: processo.id, responsavel: processo.responsavel_id ?? '' })}>Criar tarefa</button>
                        )}
                        {m.prazo_sugerido_dias && <button className="btn sm" onClick={() => setPrazo(m)}><CalendarClock size={15} />Calcular prazo ({diasPadraoPorJustica(processo.numero, m.prazo_sugerido_dias)} dias)</button>}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {aba === 'tarefas' && (
            <div className="stack">
              <div><button className="btn gold sm" onClick={() => setTarefaPadrao({ processoId: processo.id, responsavel: processo.responsavel_id ?? '' })}>Delegar tarefa ou prazo</button></div>
              <ul className="docs">
                {dasTarefas.length === 0 && <li className="muted">Nenhuma tarefa ou prazo deste processo.</li>}
                {dasTarefas.map(t => (
                  <li key={t.id} className="doc">
                    <span className="doc-nome"><span>{t.titulo}</span></span>
                    <small className="muted">{t.inicio ? dataHora(t.inicio).slice(0, t.dia_inteiro ? 10 : 16) : 'Sem data'} · {STATUS_ROTULO[t.status]}{nomeDe(t.responsavel_id) ? ` · ${nomeDe(t.responsavel_id)}` : ''}</small>
                    {t.prazo_fatal && <Badge tom="bad">Prazo fatal</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {aba === 'documentos' && (processo.cliente_id ? <Dossie clienteId={processo.cliente_id} processoId={processo.id} aoMudar={aoMudar} /> : <p className="muted">Vincule um cliente ao processo para organizar os documentos.</p>)}

          {aba === 'dados' && (
            <dl className="ficha">
              <div><dt>Posição do cliente</dt><dd>{{ ativo: 'Autor / ativo', passivo: 'Réu / passivo', terceiro: 'Terceiro' }[processo.polo]}</dd></div>
              {processo.parte_contraria && <div><dt>Parte contrária</dt><dd>{processo.parte_contraria}</dd></div>}
              {processo.assunto && <div><dt>Assunto</dt><dd>{processo.assunto}</dd></div>}
              {processo.grau && <div><dt>Grau</dt><dd>{processo.grau}</dd></div>}
              {processo.data_ajuizamento && <div><dt>Ajuizamento</dt><dd>{fmtData(processo.data_ajuizamento)}</dd></div>}
              {processo.valor_causa != null && <div><dt>Valor da causa</dt><dd>{processo.valor_causa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd></div>}
              <div><dt>Fase</dt><dd>{processo.fase}</dd></div>
              {processo.observacoes && <div style={{ gridColumn: '1 / -1' }}><dt>Observações</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{processo.observacoes}</dd></div>}
            </dl>
          )}
        </div>
      </Modal>

      {editar && <ProcessoModal processo={processo} onClose={() => setEditar(false)} onSalvo={async () => { setEditar(false); await atualizarTudo(); }} />}
      {prazo && <PrazoModal processo={processo} movimento={prazo} onClose={() => setPrazo(null)}
        onCriar={(v, resumo) => { setTarefaPadrao({ tipo: 'prazo', titulo: `Prazo — ${prazo.nome}`, descricao: `${resumo}. Conferir no ato.`, data: v, diaInteiro: true, prazoFatal: true, processoId: processo.id, responsavel: processo.responsavel_id ?? '', lembrete: 1440 }); setPrazo(null); }} />}
      {tarefaPadrao && <TarefaModal tarefa={null} padrao={tarefaPadrao as never} googleConectado={google.status.conectado} onClose={() => setTarefaPadrao(null)}
        onSalvo={async t => {
          setTarefaPadrao(null);
          if (t.inicio && google.status.conectado) { try { await db.google.sincronizar(t.id); } catch { /* o aviso fica na ficha da tarefa */ } }
          await atualizarTudo(); setAba('tarefas');
        }} />}
    </>
  );
}
