import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Info, Save, Trash2, XCircle } from 'lucide-react';
import { Abas, Field, Modal, PageHeader, Vazio, useConfirm, useToast } from '@/components/ui';
import CampoNumero from '@/components/CampoNumero';
import { plural } from '@/lib/format';
import HonorariosParametros from '@/components/HonorariosParametros';
import { useDados } from '@/context/Dados';
import { baixarDocx } from '@/lib/docx';
import { brl, dataPorExtenso } from '@/lib/modelos';
import {
  BASE_LEGAL, CASO_PADRAO, COMPLEXIDADES, MODALIDADES, PARAMETROS_PADRAO, SERVICOS, STATUS_PROPOSTA, calcular, formaDePagamento, servicoPorId, textoProposta, totalCustosFixos,
  type Alerta, type CasoEntrada, type Modalidade, type ParametrosHonorarios, type PropostaHonorarios, type StatusProposta,
} from '@/lib/precificacao';

const ICONE: Record<Alerta['nivel'], typeof Info> = { bad: XCircle, warn: AlertTriangle, info: Info, ok: CheckCircle2 };
const GRUPOS = [...new Set(SERVICOS.map(s => s.grupo))];

/** Motor de precificação de honorários (só o administrador): parte dos custos reais do escritório e confronta com a OAB e o proveito do cliente. */
export default function Honorarios() {
  const { db, clientes, processos, agora } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const [aba, setAba] = useState<'simulador' | 'propostas' | 'parametros' | 'legal'>('simulador');
  const [params, setParams] = useState<ParametrosHonorarios>(PARAMETROS_PADRAO);
  const [salvos, setSalvos] = useState<ParametrosHonorarios>(PARAMETROS_PADRAO);
  const [propostas, setPropostas] = useState<PropostaHonorarios[]>([]);
  const [caso, setCaso] = useState<CasoEntrada>(CASO_PADRAO);
  const [clienteId, setClienteId] = useState('');
  const [processoId, setProcessoId] = useState('');
  const [carregado, setCarregado] = useState(false);
  const [salvandoParams, setSalvandoParams] = useState(false);
  const [salvarProposta, setSalvarProposta] = useState(false);

  const carregar = useCallback(async () => {
    const [p, ps] = await Promise.all([db.honorarios.parametros.get().catch(() => PARAMETROS_PADRAO), db.honorarios.propostas.list().catch(() => [])]);
    setParams(p); setSalvos(p); setPropostas(ps.sort((a, b) => b.created_at.localeCompare(a.created_at))); setCarregado(true);
  }, [db]);
  useEffect(() => { void carregar(); }, [carregar]);

  const r = useMemo(() => calcular(params, caso), [params, caso]);
  const sv = servicoPorId(caso.servico_id);
  const sujo = JSON.stringify(params) !== JSON.stringify(salvos);
  const setC = <K extends keyof CasoEntrada>(k: K, v: CasoEntrada[K]) => setCaso(c => ({ ...c, [k]: v }));
  const forma = formaDePagamento(r, caso, brl);
  const semCustos = totalCustosFixos(params) <= 0;

  function escolherServico(id: string) {
    const s = servicoPorId(id);
    setCaso(c => ({ ...c, servico_id: id, duracao_meses: s?.meses ?? c.duracao_meses, parcelas: Math.max(1, Math.min(12, s?.meses ?? c.parcelas)) }));
  }
  async function salvarParametros() {
    setSalvandoParams(true);
    try { await db.honorarios.parametros.save(params); setSalvos(params); toast.ok('Parâmetros salvos.'); } catch (e) { toast.erro((e as Error).message); } finally { setSalvandoParams(false); }
  }
  async function baixarProposta(d: { titulo: string; cliente: string; servico: string; modalidade: Modalidade; valor: number; exitoPct: number; forma: string; duracao: number; custas: number; obs?: string | null }) {
    const texto = textoProposta({ titulo: d.titulo, cliente: d.cliente, escritorio: '', servico: d.servico, modalidade: d.modalidade, valor: d.valor, exitoPct: d.exitoPct, forma: d.forma, duracaoMeses: d.duracao, custas: d.custas, dataExtenso: dataPorExtenso(agora.data), observacoes: d.obs }, brl);
    await baixarDocx(`Proposta – ${d.cliente}`, texto);
  }
  const nomeCliente = (id: string | null) => clientes.find(c => c.id === id)?.nome ?? 'Cliente';

  return (
    <>
      <PageHeader titulo="Honorários">
        {aba === 'parametros' && <button className="btn gold" onClick={salvarParametros} disabled={!sujo || salvandoParams}><Save size={17} />{salvandoParams ? 'Salvando…' : sujo ? 'Salvar parâmetros' : 'Salvo'}</button>}
      </PageHeader>
      <div className="card mb-18" >
        <Abas valor={aba} onChange={setAba} itens={[{ id: 'simulador', rotulo: 'Simulador' }, { id: 'propostas', rotulo: `Propostas (${propostas.length})` }, { id: 'parametros', rotulo: 'Parâmetros do escritório' }, { id: 'legal', rotulo: 'Base legal' }]} />
      </div>

      {aba === 'simulador' && carregado && (
        <div className="grid c2 honorarios-grid">
          <div className="card card-pad stack" aria-label="Dados do caso">
            <h2 className="section-title m-0" >O caso</h2>
            <Field label="Serviço">
              <select className="select" value={caso.servico_id} onChange={e => escolherServico(e.target.value)}>
                {GRUPOS.map(g => <optgroup key={g} label={g}>{SERVICOS.filter(s => s.grupo === g).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</optgroup>)}
              </select>
            </Field>
            <div className="grid c2">
              <Field label="Complexidade"><select className="select" value={caso.complexidade} onChange={e => setC('complexidade', e.target.value as CasoEntrada['complexidade'])}>{COMPLEXIDADES.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}</select></Field>
              <Field label="Duração prevista (meses)" dica={sv ? `Em média ${plural(sv.meses, "mês", "meses")} para este serviço.` : undefined}><CampoNumero rotulo="Duração em meses" valor={caso.duracao_meses} casas={0} min={1} max={120} onChange={v => setC('duracao_meses', v || 1)} /></Field>
            </div>
            <div className="grid c3">
              <Field label="Audiências"><CampoNumero rotulo="Audiências" valor={caso.audiencias} casas={0} max={30} onChange={v => setC('audiencias', v)} /></Field>
              <Field label="Instâncias de recurso"><CampoNumero rotulo="Instâncias de recurso" valor={caso.instancias_recursais} casas={0} max={3} onChange={v => setC('instancias_recursais', v)} /></Field>
              <Field label="Horas extras de trabalho"><CampoNumero rotulo="Horas extras" valor={caso.horas_extras} casas={1} max={500} onChange={v => setC('horas_extras', v)} /></Field>
            </div>
            <div className="grid c2">
              <Field label="Deslocamento total (km)"><CampoNumero rotulo="Deslocamento em km" valor={caso.km_total} casas={0} max={100000} onChange={v => setC('km_total', v)} /></Field>
              <Field label="Despesas que o escritório absorve (R$)" dica="Diligências, cópias, correspondentes que não serão reembolsadas."><CampoNumero rotulo="Despesas absorvidas" valor={caso.despesas_absorvidas} onChange={v => setC('despesas_absorvidas', v)} /></Field>
            </div>
            <div className="grid c3">
              <Field label="Valor da causa (R$)"><CampoNumero rotulo="Valor da causa" valor={caso.valor_causa} onChange={v => setC('valor_causa', v)} /></Field>
              <Field label="Proveito econômico esperado (R$)" dica="O que o cliente deve ganhar ou deixar de perder."><CampoNumero rotulo="Proveito econômico" valor={caso.proveito_estimado} onChange={v => setC('proveito_estimado', v)} /></Field>
              <Field label="Chance de êxito (%)"><CampoNumero rotulo="Chance de êxito" valor={caso.probabilidade_exito_pct} casas={0} max={100} onChange={v => setC('probabilidade_exito_pct', v)} /></Field>
            </div>
            <h2 className="section-title" style={{ margin: '6px 0 0' }}>Forma de cobrança</h2>
            <Field label="Modalidade" dica={MODALIDADES.find(m => m.id === caso.modalidade)?.dica}>
              <select className="select" value={caso.modalidade} onChange={e => setC('modalidade', e.target.value as Modalidade)}>{MODALIDADES.map(m => <option key={m.id} value={m.id}>{m.rotulo}</option>)}</select>
            </Field>
            {(caso.modalidade === 'parcelado' || caso.modalidade === 'misto') && (
              <div className="grid c2">
                <Field label="Entrada (%)"><CampoNumero rotulo="Entrada" valor={caso.entrada_pct} casas={0} max={100} onChange={v => setC('entrada_pct', v)} /></Field>
                <Field label="Parcelas mensais"><CampoNumero rotulo="Parcelas" valor={caso.parcelas} casas={0} max={60} onChange={v => setC('parcelas', v)} /></Field>
              </div>
            )}
            {caso.valor_causa > 0 && (
              <label className="check"><input type="checkbox" checked={caso.abater_sucumbencia} onChange={e => setC('abater_sucumbencia', e.target.checked)} />Descontar a sucumbência esperada ({caso.sucumbencia_pct}% do valor da causa × chance de êxito)</label>
            )}
          </div>

          <div className="stack g-14" >
            {semCustos ? (
              <div className="card card-pad preco-card">
                <small className="muted">Antes de calcular</small>
                <div className="preco-grande">—</div>
                <ol className="passos-prazo" style={{ margin: '4px 0 12px' }}>
                  <li>Cadastre os custos fixos do escritório e a folha.</li>
                  <li>Informe a tributação, a margem e a tabela de mínimos da OAB-MA.</li>
                  <li>Volte aqui e simule o caso.</li>
                </ol>
                <button className="btn gold" onClick={() => setAba('parametros')}>Cadastrar os custos</button>
              </div>
            ) : (
            <div className="card card-pad preco-card" aria-live="polite">
              <small className="muted">{caso.modalidade === 'exito' ? 'Percentual de êxito necessário' : caso.modalidade === 'hora' ? 'Valor da hora técnica' : 'Valor recomendado'}</small>
              <div className="preco-grande">{caso.modalidade === 'exito' ? `${String(r.exitoPct).replace('.', ',')}%` : caso.modalidade === 'hora' ? brl(r.valorHora ?? 0) : brl(r.recomendado)}</div>
              {caso.modalidade !== 'exito' && caso.modalidade !== 'hora' && (
                <div className="faixas">
                  <div><small className="muted">Mínimo seguro</small><strong>{brl(r.minimo)}</strong></div>
                  <div><small className="muted">Recomendado</small><strong>{brl(r.recomendado)}</strong></div>
                  <div><small className="muted">Premium</small><strong>{brl(r.premium)}</strong></div>
                </div>
              )}
              {caso.modalidade === 'misto' && <p style={{ margin: '10px 0 0' }}>Entrada de <strong>{brl(r.fixo)}</strong> + êxito de <strong>{String(r.exitoPct).replace('.', ',')}%</strong>.</p>}
              <p className="muted" style={{ margin: '10px 0 0' }}>{forma}</p>
            </div>
            )}

            <div className="card card-pad">
              <ul className="alertas-preco">
                {r.alertas.map((a, i) => { const Ic = ICONE[a.nivel]; return <li key={i} className={`al-${a.nivel}`}><Ic size={17} aria-hidden="true" /><span>{a.texto}</span></li>; })}
              </ul>
            </div>

            <div className="card">
              <div className="card-head"><span className="section-title">Como chegamos nesse valor</span></div>
              <table className="tbl compacta">
                <tbody>
                  <tr><td>Horas estimadas de trabalho</td><td className="right">{r.horas.toFixed(1).replace('.', ',')} h</td></tr>
                  <tr><td>Custo de 1 hora do escritório</td><td className="right">{brl(r.custoHora)}</td></tr>
                  <tr><td>Custo do trabalho</td><td className="right">{brl(r.custoTrabalho)}</td></tr>
                  <tr><td>Despesas absorvidas + reserva</td><td className="right">{brl(r.despesas + r.reserva)}</td></tr>
                  <tr><td><strong>Custo total do caso</strong></td><td className="right"><strong>{brl(r.custoTotal)}</strong></td></tr>
                  <tr><td>Tributos + inadimplência</td><td className="right">{r.tributoPct.toFixed(2).replace('.', ',')}% + {r.inadimplenciaPct}%</td></tr>
                  <tr><td>Ponto de equilíbrio (sem lucro)</td><td className="right">{brl(r.piso)}</td></tr>
                  <tr><td>Com a margem de {r.margemPct}%</td><td className="right">{brl(r.alvo)}</td></tr>
                  <tr><td>Tabela da OAB-MA × fator de mercado</td><td className="right">{r.oab != null ? `${brl(r.oab)} × ${params.fator_regional.toFixed(2).replace('.', ',')} = ${brl(r.oabAjustada ?? 0)}` : <span className="muted">não informada</span>}</td></tr>
                  <tr><td>Lucro esperado · margem</td><td className="right">{brl(r.lucroEsperado)} · {r.margemEsperadaPct.toFixed(1).replace('.', ',')}%</td></tr>
                  <tr><td>Uso da capacidade mensal</td><td className="right">{r.ocupacaoPct.toFixed(0)}%</td></tr>
                  {caso.valor_causa > 0 && <tr><td>Custas iniciais TJMA (despesa do cliente)</td><td className="right">{brl(r.custasEstimadas)}</td></tr>}
                </tbody>
              </table>
            </div>

            {r.parcelas.length > 0 && (
              <div className="card">
                <div className="card-head"><span className="section-title">Cronograma de pagamento</span></div>
                <table className="tbl compacta"><tbody>
                  {r.parcelas.map((p, i) => <tr key={i}><td>{p.rotulo}</td><td className="muted">{p.mes === 0 ? 'na contratação' : `mês ${p.mes}`}</td><td className="right">{brl(p.valor)}</td></tr>)}
                </tbody></table>
              </div>
            )}

            <div className="row g-8 fx-wrap" >
              <button className="btn gold" onClick={() => setSalvarProposta(true)}><Save size={16} />Salvar proposta</button>
              <button className="btn ghost" onClick={() => void baixarProposta({ titulo: sv?.nome ?? 'Honorários', cliente: nomeCliente(clienteId || null), servico: sv?.nome ?? '', modalidade: caso.modalidade, valor: caso.modalidade === 'parcelado' || caso.modalidade === 'fixo' ? r.recomendado : r.fixo, exitoPct: r.exitoPct, forma, duracao: caso.duracao_meses, custas: r.custasEstimadas })}><Download size={16} />Baixar proposta (Word)</button>
            </div>
            <small className="muted">Apoio técnico: o valor final é decisão do advogado. Confirme tributos com a contabilidade, a tabela vigente da OAB-MA e as custas do TJMA.</small>
          </div>
        </div>
      )}

      {aba === 'propostas' && (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Proposta</th><th>Cliente</th><th>Valor</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {propostas.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.titulo}</strong><div className="muted fs-sm" >{servicoPorId(p.servico)?.nome ?? p.servico} · {MODALIDADES.find(m => m.id === p.modalidade)?.rotulo}</div></td>
                    <td>{p.cliente_id ? nomeCliente(p.cliente_id) : <span className="muted">—</span>}</td>
                    <td>{p.modalidade === 'exito' ? `${String(p.exito_pct).replace('.', ',')}% de êxito` : brl(p.valor_proposto)}{p.modalidade === 'misto' && p.exito_pct > 0 ? ` + ${String(p.exito_pct).replace('.', ',')}%` : ''}</td>
                    <td>
                      <select className="select sm" aria-label={`Situação de ${p.titulo}`} value={p.status} onChange={async e => { try { await db.honorarios.propostas.update(p.id, { status: e.target.value as StatusProposta }); await carregar(); } catch (er) { toast.erro((er as Error).message); } }}>
                        {STATUS_PROPOSTA.map(s => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
                      </select>
                    </td>
                    <td className="right nowrap" >
                      <button className="btn ghost sm" onClick={() => { setCaso(p.entrada); setClienteId(p.cliente_id ?? ''); setProcessoId(p.processo_id ?? ''); setAba('simulador'); }}>Reabrir</button>
                      <button className="icon-btn" aria-label={`Baixar proposta ${p.titulo}`} onClick={() => void baixarProposta({ titulo: p.titulo, cliente: nomeCliente(p.cliente_id), servico: servicoPorId(p.servico)?.nome ?? p.servico, modalidade: p.modalidade, valor: p.valor_proposto, exitoPct: p.exito_pct, forma: p.forma_pagamento ?? '', duracao: p.entrada.duracao_meses, custas: p.resultado.custasEstimadas ?? 0, obs: p.observacoes })}><Download size={16} /></button>
                      <button className="icon-btn" aria-label={`Excluir ${p.titulo}`} onClick={async () => { if (await confirmar(`Excluir a proposta "${p.titulo}"?`, { perigo: true, rotulo: 'Excluir' })) { try { await db.honorarios.propostas.remove(p.id); await carregar(); } catch (er) { toast.erro((er as Error).message); } } }}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {carregado && propostas.length === 0 && <Vazio tipo="documento" titulo="Nenhuma proposta salva">Simule um caso e use "Salvar proposta" para guardar o valor, o cronograma e o cliente.</Vazio>}
          </div>
        </div>
      )}

      {aba === 'parametros' && carregado && <HonorariosParametros p={params} onChange={setParams} />}

      {aba === 'legal' && (
        <div className="stack g-14" >
          <div className="cartao-integracao"><strong>Apoio técnico, não parecer jurídico.</strong> As referências abaixo orientam o cálculo; a redação vigente, a tabela da Seccional e as alíquotas devem ser conferidas pelo advogado e pela contabilidade antes de fechar o contrato.</div>
          {(['OAB', 'Federal', 'TJMA', 'Tributário'] as const).map(amb => (
            <div key={amb} className="card">
              <div className="card-head"><span className="section-title">{amb === 'OAB' ? 'OAB' : amb === 'Federal' ? 'Leis federais' : amb === 'TJMA' ? 'Tribunal de Justiça do Maranhão' : 'Tributos'}</span></div>
              <ul className="stack m-0 g-14" style={{ listStyle: 'none', padding: '14px 22px 18px' }}>
                {BASE_LEGAL.filter(n => n.ambito === amb).map(n => <li key={n.titulo}><strong>{n.titulo}</strong><div className="muted">{n.texto}</div></li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {salvarProposta && (
        <SalvarProposta
          clientes={clientes} processos={processos} clienteId={clienteId} processoId={processoId}
          tituloInicial={`${sv?.nome ?? 'Honorários'}${clienteId ? ` – ${nomeCliente(clienteId)}` : ''}`}
          valorInicial={caso.modalidade === 'parcelado' || caso.modalidade === 'fixo' ? r.recomendado : r.fixo}
          onClose={() => setSalvarProposta(false)}
          onSalvar={async d => {
            try {
              await db.honorarios.propostas.insert({ cliente_id: d.cliente_id, processo_id: d.processo_id, titulo: d.titulo, servico: caso.servico_id, modalidade: caso.modalidade, status: 'rascunho',
                valor_recomendado: caso.modalidade === 'hora' ? (r.valorHora ?? 0) : r.recomendado, valor_proposto: d.valor, exito_pct: r.exitoPct, forma_pagamento: forma, entrada: caso, resultado: r, observacoes: d.obs });
              setClienteId(d.cliente_id ?? ''); setProcessoId(d.processo_id ?? ''); setSalvarProposta(false); toast.ok('Proposta salva.'); await carregar(); setAba('propostas');
            } catch (e) { toast.erro((e as Error).message); }
          }}
        />
      )}
    </>
  );
}

function SalvarProposta({ clientes, processos, clienteId, processoId, tituloInicial, valorInicial, onClose, onSalvar }: {
  clientes: { id: string; nome: string }[]; processos: { id: string; numero: string; titulo: string | null; cliente_id: string | null }[]; clienteId: string; processoId: string;
  tituloInicial: string; valorInicial: number; onClose(): void; onSalvar(d: { titulo: string; cliente_id: string | null; processo_id: string | null; valor: number; obs: string | null }): Promise<void>;
}) {
  const [titulo, setTitulo] = useState(tituloInicial);
  const [cli, setCli] = useState(clienteId);
  const [proc, setProc] = useState(processoId);
  const [valor, setValor] = useState(valorInicial);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal titulo="Salvar proposta" onClose={onClose} rodape={<>
      <button className="btn ghost" onClick={onClose}>Cancelar</button>
      <button className="btn gold" disabled={titulo.trim().length < 2 || salvando} onClick={async () => { setSalvando(true); await onSalvar({ titulo: titulo.trim(), cliente_id: cli || null, processo_id: proc || null, valor, obs: obs.trim() || null }); setSalvando(false); }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
    </>}>
      <div className="stack">
        <Field label="Título"><input className="input" value={titulo} maxLength={200} onChange={e => setTitulo(e.target.value)} /></Field>
        <div className="grid c2">
          <Field label="Cliente"><select className="select" value={cli} onChange={e => { setCli(e.target.value); setProc(''); }}><option value="">Sem cliente</option>{[...clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
          <Field label="Processo"><select className="select" value={proc} disabled={!cli} onChange={e => setProc(e.target.value)}><option value="">Sem processo</option>{processos.filter(p => p.cliente_id === cli).map(p => <option key={p.id} value={p.id}>{p.titulo ? `${p.titulo} · ` : ''}{p.numero}</option>)}</select></Field>
        </div>
        <Field label="Valor proposto ao cliente (R$)" dica="Começa no valor recomendado. Ajuste se negociar."><CampoNumero rotulo="Valor proposto" valor={valor} onChange={setValor} /></Field>
        <Field label="Observações (aparecem na proposta)"><textarea className="textarea" value={obs} maxLength={2000} onChange={e => setObs(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
